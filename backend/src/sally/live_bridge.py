"""
SallyLiveAgent — único agente de SALLY. WebSocket ↔ Gemini Live API.

Único punto de inteligencia del sistema. Gestiona:
  - Audio bidireccional browser ↔ Gemini Live (voz Kore, sin TTS).
  - Ejecución de tools con broadcast SET_* al panel 3D.
  - Contexto del ecosistema inyectado desde los polling loops.
  - Barge-in (interrupción del conductor).

Los polling loops llaman inject_context(state) para que Gemini
evalúe el estado del coche y decida tools + speech de forma autónoma.
"""

import asyncio
import json
import logging
import os
import time
from typing import Any

from fastapi import WebSocket
from google import genai
from google.genai import types

from websocket.manager import ConnectionManager
from sally.live_prompt import LIVE_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_LIVE_MODEL = os.getenv("GOOGLE_LIVE_MODEL", "gemini-3.1-flash-live-preview")

_JSON_TO_GENAI_TYPE = {
    "string":  types.Type.STRING,
    "integer": types.Type.INTEGER,
    "number":  types.Type.NUMBER,
    "boolean": types.Type.BOOLEAN,
    "array":   types.Type.ARRAY,
    "object":  types.Type.OBJECT,
}


def _lc_tools_to_genai(lc_tools: list[Any]) -> list[types.FunctionDeclaration]:
    """Convert LangChain @tool definitions → Gemini FunctionDeclaration list.

    Reads each tool's Pydantic args_schema so tools.py is the single source of truth.
    """
    declarations = []
    for t in lc_tools:
        schema = t.args_schema.model_json_schema()
        props: dict[str, types.Schema] = {}
        for pname, pdef in schema.get("properties", {}).items():
            raw_type = pdef.get("type", "string")
            genai_type = _JSON_TO_GENAI_TYPE.get(raw_type, types.Type.STRING)
            enum_vals = pdef.get("enum") or []
            props[pname] = types.Schema(
                type=genai_type,
                description=pdef.get("description", ""),
                enum=enum_vals if enum_vals else None,
            )
        declarations.append(
            types.FunctionDeclaration(
                name=t.name,
                description=t.description,
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties=props,
                    required=schema.get("required", []),
                ),
            )
        )
    return declarations


class SallyLiveAgent:
    def __init__(
        self,
        ws: WebSocket,
        manager: ConnectionManager,
        live_state: dict,
        api_key: str,
    ) -> None:
        self._ws           = ws
        self._manager      = manager
        self._live_state   = live_state
        self._api_key      = api_key
        self._interrupted  = False
        self._speaking     = False
        self._session      = None   # set while the Gemini session is open
        self._grace_until  = 0.0    # monotonic deadline for ignoring polling injections

    # ── Entry point ──────────────────────────────────────────────────────────────

    async def run(self) -> None:
        from sally.tools import ALL_TOOLS

        # gemini-3.1-flash-live-preview is only available on v1alpha
        client = genai.Client(
            api_key=self._api_key,
            http_options=types.HttpOptions(api_version="v1alpha"),
        )

        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    disabled=False,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                    silence_duration_ms=1500,
                )
            ),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
                )
            ),
            system_instruction=LIVE_SYSTEM_PROMPT,
            tools=[types.Tool(function_declarations=_lc_tools_to_genai(ALL_TOOLS))],
        )

        try:
            async with client.aio.live.connect(
                model=_LIVE_MODEL,
                config=config,
            ) as session:
                self._session     = session
                # Grace window: ignore polling injections for the first 10 s so the
                # driver's first spoken turn is not buried under an ECOSYSTEM_UPDATE.
                self._grace_until = time.monotonic() + 10.0
                try:
                    await self._ws.send_json({"type": "LIVE_READY"})
                    await self._ws.send_json(
                        {"type": "LIVE_STATE", "payload": {"state": "listening"}}
                    )

                    t1 = asyncio.create_task(self._browser_to_gemini(session))
                    t2 = asyncio.create_task(self._gemini_to_browser(session))

                    done, pending = await asyncio.wait(
                        [t1, t2], return_when=asyncio.FIRST_COMPLETED
                    )
                    for task in pending:
                        task.cancel()
                        try:
                            await task
                        except (asyncio.CancelledError, Exception):
                            pass
                finally:
                    self._session = None

        except Exception as exc:
            logger.error("Live agent error: %s", exc, exc_info=True)
            try:
                await self._ws.send_json(
                    {"type": "LIVE_ERROR", "payload": {"msg": str(exc)}}
                )
            except Exception:
                pass

    # ── Context injection (from polling loops) ────────────────────────────────────

    async def inject_context(self, state: dict) -> None:
        """Inject an ecosystem state snapshot into the active Gemini session.

        Called periodically by the polling loop (every POLL_INTERVAL_SECONDS).
        Sally re-evaluates the four interior modes and the wearable / sensors
        / calendar / spotify / gmail signals, and proposes changes proactively.
        Skipped while Sally is speaking and during the post-connect grace window.
        """
        if self._session is None or self._speaking:
            return
        if time.monotonic() < self._grace_until:
            logger.debug("inject_context: within grace window, skipping")
            return
        try:
            await self._session.send_realtime_input(
                text=(
                    f"[ECOSYSTEM UPDATE]\n{json.dumps(state, ensure_ascii=False)}\n"
                    "Estos datos son reales — el coche está en marcha ahora mismo. "
                    "Evalúa: ¿el modo activo sigue encajando con el contexto? "
                    "¿Conviene proponer otro de los cuatro modos (conduccion / reunion / "
                    "relax / amics)? ¿Hay algo en wearable, sensors, calendar, gmail o "
                    "spotify que merezca un comentario o propuesta? Sé proactiva, pero "
                    "PIDE permiso antes de cambiar de modo. Si no hay nada nuevo respecto "
                    "a tu última intervención, calla."
                )
            )
            logger.debug("inject_context: trigger=%s", state.get("trigger"))
        except Exception as exc:
            logger.warning("inject_context failed: %s", exc)

    async def inject_system_message(self, text: str) -> None:
        """Inject an explicit reactive trigger (stress spike, fuel low, etc.).

        Gemini will respond with native audio — no TTS involved.
        No-ops if the session is closed.
        """
        if self._session is None:
            return
        try:
            await self._session.send_realtime_input(
                text=(
                    f"[TRIGGER REACTIVO]\n{text}\n"
                    "Esto es un evento real recién detectado en el coche. "
                    "Reacciona ahora hablando al conductor: si es fuel_low o "
                    "fuel_critical saca el tema de buscar gasolinera; si es "
                    "stress_spike o heart_rate_spike propón modo relax o "
                    "ajusta luz/temperatura; si es social_high propón modo amics "
                    "y sugiere un plan concreto cerca de su location; nunca "
                    "cambies la cabina sin pedir permiso."
                )
            )
            logger.info("inject_system_message: %.100s", text)
        except Exception as exc:
            logger.warning("inject_system_message failed: %s", exc)

    # ── Task 1: browser → Gemini ─────────────────────────────────────────────────

    async def _browser_to_gemini(self, session) -> None:
        while True:
            try:
                msg = await self._ws.receive()
            except Exception:
                break

            if msg.get("type") == "websocket.disconnect":
                break

            raw_bytes = msg.get("bytes")
            if raw_bytes:
                self._interrupted = False
                try:
                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=raw_bytes,
                            mime_type="audio/pcm;rate=16000",
                        )
                    )
                except Exception as exc:
                    logger.error("Forward audio to Gemini failed: %s", exc)
                    break
                continue

            raw_text = msg.get("text")
            if raw_text:
                try:
                    ctrl = json.loads(raw_text)
                except json.JSONDecodeError:
                    continue

                event_type = ctrl.get("type")
                if event_type == "INTERRUPT":
                    logger.debug("Barge-in interrupt received from browser")
                    self._interrupted = True
                    self._speaking    = False
                    try:
                        await self._ws.send_json(
                            {"type": "LIVE_STATE", "payload": {"state": "listening"}}
                        )
                    except Exception:
                        pass

                elif event_type == "SESSION_END":
                    logger.info("Session end requested by browser")
                    break

    # ── Task 2: Gemini → browser ──────────────────────────────────────────────────

    async def _gemini_to_browser(self, session) -> None:
        # `session.receive()` yields one turn's worth of messages and then ends.
        # The outer `while True` keeps the conversation going for the lifetime of
        # the WebSocket session — without it, the second user turn never reaches us.
        try:
            while True:
                async for response in session.receive():
                    # Native audio output — `response.data` is the SDK shortcut
                    # for the inline PCM blob inside server_content.model_turn.
                    audio = getattr(response, "data", None)
                    if audio and not self._interrupted:
                        if not self._speaking:
                            self._speaking = True
                            await self._ws.send_json(
                                {"type": "LIVE_STATE", "payload": {"state": "speaking"}}
                            )
                        try:
                            await self._ws.send_bytes(audio)
                        except Exception as exc:
                            logger.error("Send audio to browser failed: %s", exc)
                            return

                    sc = response.server_content
                    if sc:
                        # Server-side VAD detected the user spoke over the model.
                        if getattr(sc, "interrupted", False):
                            logger.debug("Server-side interruption — flushing playback state")
                            self._interrupted = True
                            self._speaking    = False
                            try:
                                await self._ws.send_json(
                                    {"type": "LIVE_STATE", "payload": {"state": "listening"}}
                                )
                            except Exception:
                                pass

                        # Model finished its audio output (may still emit tool calls).
                        if getattr(sc, "generation_complete", False):
                            self._speaking = False

                    # Tool calls
                    if response.tool_call:
                        self._speaking = False
                        await self._ws.send_json(
                            {"type": "LIVE_STATE", "payload": {"state": "processing"}}
                        )
                        await self._execute_tools(session, response.tool_call.function_calls)

                # Reached when the current turn ends (turn_complete). Reset
                # local state, notify the browser, and wait for the next turn.
                self._interrupted = False
                self._speaking    = False
                try:
                    await self._ws.send_json(
                        {"type": "LIVE_STATE", "payload": {"state": "listening"}}
                    )
                except Exception:
                    pass

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Receive from Gemini failed: %s", exc, exc_info=True)

    # ── Tool execution ────────────────────────────────────────────────────────────

    async def _execute_tools(self, session, function_calls) -> None:
        from sally.tools import tool_call_to_ws_action

        responses = []
        for fc in function_calls:
            name = fc.name
            args = dict(fc.args) if fc.args else {}

            result = await self._dispatch_tool(name, args)
            logger.info("Live tool %s(%s) → %s", name, args, result)

            # Broadcast SET_* to all /ws clients (3D car panel, ecosystem display)
            action = tool_call_to_ws_action(name, args)
            if action:
                await self._manager.broadcast(action["ws_type"], action["payload"])
                try:
                    await self._ws.send_json(
                        {"type": action["ws_type"], "payload": action["payload"]}
                    )
                except Exception:
                    pass

            responses.append(
                types.FunctionResponse(
                    id=fc.id, name=name, response={"result": result}
                )
            )

        if responses:
            try:
                await session.send_tool_response(function_responses=responses)
            except Exception as exc:
                logger.error("Tool response send failed: %s", exc)

    async def _dispatch_tool(self, name: str, args: dict) -> str:
        """Execute any registered tool by delegating to its LangChain ainvoke.

        Cabin / Gmail / Calendar / Spotify tools all live in sally/tools.py and
        are auto-converted to Gemini FunctionDeclarations. Each tool returns a
        short result string that we feed back to Gemini as the tool response.
        """
        from sally.tools import ALL_TOOLS
        for t in ALL_TOOLS:
            if t.name == name:
                try:
                    return await t.ainvoke(args)
                except Exception as exc:
                    logger.error("Tool %s ainvoke failed: %s", name, exc)
                    return f"{name} error: {exc}"
        logger.warning("Unknown tool requested by Gemini: %s", name)
        return f"Unknown tool: {name}"
