"""
Entrypoint del backend de SALLY — protocolo WebSocket v2 (agente único).

Toda la inteligencia reside en SallyLiveAgent conectado por /ws/sally.
El polling inyecta contexto del ecosistema en la sesión Live activa;
Gemini decide autónomamente qué tools llamar y cuándo hablar.

Mensajes entrantes (frontend → backend):
  /ws       : (sin USER_MESSAGE — voz exclusivamente por /ws/sally)
  /ws/sally : binary PCM (16kHz, Int16 LE) | JSON { SESSION_START | SESSION_END | INTERRUPT }

Mensajes salientes (backend → frontend):
  /ws
    CONNECTED              { msg }
    SET_INTERIOR_MODE      { mode }                 # cambio intrínseco multi-subsistema
    SET_INSIDE_LIGHT       { color, intensity }
    SET_STEERING_WHEEL     { position }
    SET_SEAT_DRIVER        { position }
    SET_SEAT_PASSENGER     { position }
    SET_SEAT_REAR_LEFT     { position }
    SET_SEAT_REAR_RIGHT    { position }
    SET_TABLE_OPEN         { open }
    SET_CABIN_TEMPERATURE  { degrees }
    SET_WINDOW_PROJECTION  { window, preset }
    SET_FUEL_LEVEL         { percent }              # set simulated battery / fuel level
    ECOSYSTEM_UPDATE       { ...snapshot }
  /ws/sally
    binary PCM (24kHz, Int16 LE) — voz nativa Gemini Live (Kore)
    JSON { LIVE_READY | LIVE_STATE | SET_* | LIVE_ERROR }
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

import shared_state as _shared

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from config.env import load_env
from config.logger import setup_logging
from sally.live_bridge import SallyLiveAgent
from websocket.manager import ConnectionManager

setup_logging()
logger = logging.getLogger(__name__)

env     = load_env()
manager = ConnectionManager()

# Active SallyLiveAgent — set while a /ws/sally session is open.
# Polling loops inject ecosystem context here; nil when no session is active.
_active_agent: SallyLiveAgent | None = None

# Polling cadences (seconds). The wearable + sensors arrive via WebSocket and
# trigger reactive injections (rate-limited) — periodic polling is the safety net.
POLL_INTERVAL_SECONDS  = 15
CALENDAR_POLL_SECONDS  = 180     # 3 min
SPOTIFY_POLL_SECONDS   = 30
GMAIL_POLL_SECONDS     = 180     # 3 min

# Reactive triggers
STRESS_SPIKE_THRESHOLD       = 7
HEART_RATE_SPIKE_THRESHOLD   = 100
SOCIAL_BATTERY_HIGH_THRESHOLD = 75    # % — when crossed upward, propose AMICS + plans
LOW_FUEL_THRESHOLD           = 25     # %
CRITICAL_FUEL_THRESHOLD      = 10     # %
REACTIVE_POLL_MIN_INTERVAL_S = 6.0    # rate-limit reactive polls

_live_state: dict           = _shared.live_state
_prev_wearable_stress: int  = 0
_prev_heart_rate: int       = 0
_prev_social_battery: int   = 0
_prev_fuel_level: int       = 100
_last_reactive_at: float    = 0.0


def _build_state(trigger: str = "unknown") -> dict:
    return {**_live_state, "hour": datetime.now().hour, "trigger": trigger}


def _can_fire_reactive() -> bool:
    """Rate-limit reactive polls so a slider drag doesn't flood the agent."""
    global _last_reactive_at
    now = time.monotonic()
    if now - _last_reactive_at < REACTIVE_POLL_MIN_INTERVAL_S:
        return False
    _last_reactive_at = now
    return True


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    logger.info("Arrancando Sally backend (Gemini Live — agente único)")
    tasks = [
        asyncio.create_task(_polling_loop()),
        asyncio.create_task(_calendar_loop()),
        asyncio.create_task(_spotify_loop()),
        asyncio.create_task(_wearable_ws_task()),
        asyncio.create_task(_sensors_ws_task()),
        asyncio.create_task(_gmail_loop()),
    ]
    yield
    logger.info("Apagando Sally backend")
    for t in tasks:
        t.cancel()


app = FastAPI(lifespan=lifespan)


# ── Ecosystem connectors ──────────────────────────────────────────────────────

async def _calendar_loop() -> None:
    while True:
        try:
            from ecosystem.calendar import get_calendar_state
            _live_state.update(await get_calendar_state())
        except NotImplementedError:
            logger.debug("Calendar: no configurado")
        except Exception as exc:
            logger.warning("Calendar poll falló: %s", exc)
        await asyncio.sleep(CALENDAR_POLL_SECONDS)


async def _spotify_loop() -> None:
    while True:
        try:
            from ecosystem.spotify import get_spotify_state
            _live_state.update(await get_spotify_state())
        except NotImplementedError:
            logger.debug("Spotify: no configurado")
        except Exception as exc:
            logger.warning("Spotify poll falló: %s", exc)
        await asyncio.sleep(SPOTIFY_POLL_SECONDS)


def _make_wearable_callback():
    """Wearable WS pushes whenever the slider moves. We update live_state every
    time and fire a reactive injection on meaningful spikes (stress, heart rate)
    — rate-limited so dragging a slider doesn't flood the agent.
    """
    def _on_update(data: dict) -> None:
        global _prev_wearable_stress, _prev_heart_rate, _prev_social_battery
        _live_state.update(data)

        stress  = int(data.get("stressLevel",   0))
        hr      = int(data.get("heartRate",     0))
        social  = int(data.get("socialBattery", 0))

        trigger: str | None = None
        if stress >= STRESS_SPIKE_THRESHOLD and _prev_wearable_stress < STRESS_SPIKE_THRESHOLD:
            trigger = "stress_spike"
            logger.info("Stress spike %d→%d", _prev_wearable_stress, stress)
        elif hr >= HEART_RATE_SPIKE_THRESHOLD and _prev_heart_rate < HEART_RATE_SPIKE_THRESHOLD:
            trigger = "heart_rate_spike"
            logger.info("Heart rate spike %d→%d", _prev_heart_rate, hr)
        elif (
            social >= SOCIAL_BATTERY_HIGH_THRESHOLD
            and _prev_social_battery < SOCIAL_BATTERY_HIGH_THRESHOLD
        ):
            trigger = "social_high"
            logger.info("Social battery high %d→%d%%", _prev_social_battery, social)

        _prev_wearable_stress = stress
        _prev_heart_rate      = hr
        _prev_social_battery  = social

        if trigger and _can_fire_reactive():
            asyncio.get_event_loop().create_task(_reactive_poll(trigger))
    return _on_update


def _make_sensors_callback():
    """Sensors WS push fuel/temperature/location updates. We trigger a reactive
    injection when fuel crosses the LOW or CRITICAL threshold so Sally surfaces
    the gas-station conversation immediately, not on the next 15 s tick.
    """
    def _on_update(data: dict) -> None:
        global _prev_fuel_level
        _live_state.update(data)

        fuel = data.get("fuelLevel")
        if not isinstance(fuel, (int, float)):
            return
        fuel = int(fuel)

        trigger: str | None = None
        if fuel <= CRITICAL_FUEL_THRESHOLD and _prev_fuel_level > CRITICAL_FUEL_THRESHOLD:
            trigger = "fuel_critical"
            logger.info("Fuel critical: %d%% (was %d%%)", fuel, _prev_fuel_level)
        elif fuel <= LOW_FUEL_THRESHOLD and _prev_fuel_level > LOW_FUEL_THRESHOLD:
            trigger = "fuel_low"
            logger.info("Fuel low: %d%% (was %d%%)", fuel, _prev_fuel_level)

        _prev_fuel_level = fuel

        if trigger and _can_fire_reactive():
            asyncio.get_event_loop().create_task(_reactive_poll(trigger))
    return _on_update


async def _wearable_ws_task() -> None:
    if not os.getenv("WEARABLE_WS_URL"):
        logger.debug("Wearable: WEARABLE_WS_URL no configurado")
        return
    while True:
        try:
            from ecosystem.wearable import wearable_ws_listener
            await wearable_ws_listener(_make_wearable_callback())
        except Exception as exc:
            logger.warning("Wearable WS caído (%s), reintentando en 5s…", exc)
            await asyncio.sleep(5)


async def _sensors_ws_task() -> None:
    if not os.getenv("SENSORS_WS_URL"):
        logger.debug("Sensors: SENSORS_WS_URL no configurado")
        return
    while True:
        try:
            from ecosystem.sensors import sensors_ws_listener
            await sensors_ws_listener(_make_sensors_callback())
        except Exception as exc:
            logger.warning("Sensors WS caído (%s), reintentando en 5s…", exc)
            await asyncio.sleep(5)


async def _gmail_loop() -> None:
    while True:
        try:
            from ecosystem.gmail import get_gmail_snapshot
            data = await get_gmail_snapshot()
            _live_state.update(data)
            logger.info(
                "Gmail snapshot — %d urgent email(s)",
                len(data.get("urgentEmails", [])),
            )
        except NotImplementedError:
            logger.debug("Gmail: no configurado, omitiendo")
            return
        except Exception as exc:
            logger.warning("Gmail snapshot falló: %s", exc)
        await asyncio.sleep(GMAIL_POLL_SECONDS)


# ── Polling loops ─────────────────────────────────────────────────────────────

async def _polling_loop() -> None:
    """Periodic context injection (every POLL_INTERVAL_SECONDS).

    Wearable + sensors push reactively via their WS callbacks (stress / heart rate
    spikes, fuel low). This loop is the safety net that keeps the agent's view
    of the ecosystem fresh even when nothing dramatic happens.
    """
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        if _active_agent is None:
            logger.debug("Polling: sin sesión Live activa, saltando")
            continue

        state = _build_state(trigger="periodic")
        logger.info("Polling — inject_context (clientes=%d)", len(manager.active))
        await _active_agent.inject_context(state)
        await manager.broadcast("ECOSYSTEM_UPDATE", state)


async def _reactive_poll(trigger: str) -> None:
    """Immediate injection triggered by stress spike or external event."""
    if _active_agent is None or not manager.active:
        return
    state = _build_state(trigger=trigger)
    await _active_agent.inject_system_message(
        f"[trigger={trigger}]\n{json.dumps(state, ensure_ascii=False)}"
    )
    await manager.broadcast("ECOSYSTEM_UPDATE", state)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "sally-backend"}


@app.websocket("/ws/sally")
async def sally_live_endpoint(ws: WebSocket) -> None:
    """Audio bridge: browser ↔ Gemini Live API (speech-to-speech, voz Kore)."""
    global _active_agent

    await ws.accept()
    ws_id = id(ws)

    # Wait for SESSION_START before opening the Gemini Live session
    try:
        raw = await ws.receive_text()
        ctrl = json.loads(raw)
        if ctrl.get("type") != "SESSION_START":
            await ws.close(code=4000)
            return
    except Exception:
        return

    logger.info("Live session opening ws=%d model=%s", ws_id, os.getenv("GOOGLE_LIVE_MODEL", "gemini-3.1-flash-live-preview"))
    agent = SallyLiveAgent(
        ws=ws,
        manager=manager,
        live_state=_live_state,
        api_key=env.get("GOOGLE_API_KEY", ""),
    )
    _active_agent = agent
    try:
        await agent.run()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("Live endpoint error ws=%d: %s", ws_id, exc)
    finally:
        _active_agent = None
        logger.info("Live session closed ws=%d", ws_id)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """Ecosystem panel: receives SET_* and ECOSYSTEM_UPDATE broadcasts."""
    await manager.connect(ws)
    ws_id = id(ws)

    await ws.send_json({"type": "CONNECTED", "payload": {"msg": "Sally online"}})

    # Send current ecosystem state
    state = _build_state(trigger="connected")
    await ws.send_json({"type": "ECOSYSTEM_UPDATE", "payload": state})

    # If a Live session is active, trigger a re-evaluation so the agent updates
    # cabin state for the new client
    if _active_agent is not None:
        await _active_agent.inject_context(state)

    try:
        while True:
            await ws.receive_text()   # keep alive; SET_* messages are broadcast-only
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        manager.disconnect(ws)


# ── Single-container deployment (Cloud Run) ───────────────────────────────────
# Cuando los simuladores están empaquetados junto al backend (imagen prod),
# los montamos como sub-apps del mismo proceso para servir todo desde una URL.
# En dev con docker-compose los simuladores corren en contenedores aparte
# y los imports de abajo simplemente fallan — sin efecto secundario.

try:
    from simulators.sensors import app as sensors_app          # type: ignore
    from simulators.wearable import app as wearable_app        # type: ignore
    app.mount("/sensors", sensors_app)
    app.mount("/wearable", wearable_app)
    logger.info("Simuladores montados en /sensors y /wearable (modo single-container)")
except ImportError:
    logger.info("Simuladores no empaquetados — modo multi-contenedor (compose dev)")

# El frontend pre-buildeado se sirve en /. Tiene que ser el ÚLTIMO mount porque
# StaticFiles actúa como catch-all. Si /app/static no existe (imagen dev), se omite.
_static_dir = Path(__file__).resolve().parent.parent / "static"
if _static_dir.is_dir():
    app.mount("/", StaticFiles(directory=str(_static_dir), html=True), name="static")
    logger.info("Frontend estático servido desde %s", _static_dir)
else:
    logger.info("Sin frontend estático bundled (%s no existe)", _static_dir)
