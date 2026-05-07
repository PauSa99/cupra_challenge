"""
Wearable Simulator — servicio de estado biométrico para Sally.

Expone el estado actual del wearable vía REST y WebSocket.
El backend (ecosystem/wearable.py) se suscribe al endpoint /ws
y recibe actualizaciones en tiempo real cuando el usuario cambia
los valores desde la UI del simulador.

Endpoints:
    GET  /health  — comprobación de disponibilidad
    GET  /state   — estado actual del wearable (debug / carga inicial)
    POST /state   — actualiza uno o más campos y difunde vía WebSocket
    WS   /ws      — canal push hacia todos los suscriptores
"""

import logging
from typing import List, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Estado en memoria ─────────────────────────────────────────────────────────
_state: dict = {
    "heartRate":     75,   # BPM   (40 – 180)
    "sleepHours":    7.5,  # h     (0.0 – 12.0)
    "stressLevel":   3,    # /10   (1 – 10)
    "steps":         2500, # pasos (0 – 20 000)
    "socialBattery": 50,   # %     (0 – 100) — energía social del conductor
}

# Lista de WebSockets activos (backend + wearable-frontend)
_clients: List[WebSocket] = []


# ── Modelo de entrada (todos los campos opcionales → actualizaciones parciales)
class WearableUpdate(BaseModel):
    heartRate:     Optional[int]   = None
    sleepHours:    Optional[float] = None
    stressLevel:   Optional[int]   = None
    steps:         Optional[int]   = None
    socialBattery: Optional[int]   = None


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Sally Wearable Simulator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Utilidad: difundir estado a todos los clientes WS ─────────────────────────
async def _broadcast() -> None:
    payload = {"type": "STATE", "payload": dict(_state)}
    dead: List[WebSocket] = []
    for ws in list(_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _clients.remove(ws)


# ── Endpoints REST ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "sally-wearable"}


@app.get("/state")
async def get_state() -> dict:
    return dict(_state)


@app.post("/state")
async def update_state(update: WearableUpdate) -> dict:
    """Actualiza los campos indicados y notifica a todos los suscriptores WS."""
    if update.heartRate     is not None: _state["heartRate"]     = update.heartRate
    if update.sleepHours    is not None: _state["sleepHours"]    = update.sleepHours
    if update.stressLevel   is not None: _state["stressLevel"]   = update.stressLevel
    if update.steps         is not None: _state["steps"]         = update.steps
    if update.socialBattery is not None: _state["socialBattery"] = update.socialBattery

    logger.info(
        "Wearable actualizado — HR:%s bpm | Sueño:%.1fh | Estrés:%s/10 | Pasos:%s | Social:%s%%",
        _state["heartRate"], _state["sleepHours"],
        _state["stressLevel"], _state["steps"], _state["socialBattery"],
    )

    await _broadcast()
    return dict(_state)


# ── Endpoint WebSocket ─────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """
    Canal push para suscriptores (backend ecosystem + wearable-frontend).
    Envía el estado actual al conectarse y difunde cada actualización posterior.
    """
    await ws.accept()
    _clients.append(ws)
    logger.info("Nuevo suscriptor WS — total: %d", len(_clients))

    # Enviar estado actual inmediatamente al conectarse
    await ws.send_json({"type": "STATE", "payload": dict(_state)})

    try:
        while True:
            # Mantener la conexión viva; el contenido entrante se ignora
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if ws in _clients:
            _clients.remove(ws)
        logger.info("Suscriptor WS desconectado — total: %d", len(_clients))
