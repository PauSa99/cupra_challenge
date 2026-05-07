"""
Car Sensors Simulator — servicio de estado de sensores del vehículo para Sally.

Expone el estado actual de los sensores del coche vía REST y WebSocket.
El backend (ecosystem/sensors.py) se suscribe al endpoint /ws
y recibe actualizaciones en tiempo real cuando el usuario cambia
los valores desde el SensorsPanel del frontend.

Endpoints:
    GET  /health  — comprobación de disponibilidad
    GET  /state   — estado actual de los sensores
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
    "fuelLevel":   60,    # %     (0 – 100) — nivel de combustible / batería
    "temperature": 20,    # °C    (-10 – 45)
    "location":    "",    # texto libre
}

# Lista de WebSockets activos (backend ecosystem)
_clients: List[WebSocket] = []


# ── Modelo de entrada (todos los campos opcionales → actualizaciones parciales)
class SensorsUpdate(BaseModel):
    fuelLevel:   Optional[int]   = None
    temperature: Optional[int]   = None
    location:    Optional[str]   = None


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Sally Car Sensors Simulator")

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
    return {"status": "ok", "service": "sally-sensors"}


@app.get("/state")
async def get_state() -> dict:
    return dict(_state)


@app.post("/state")
async def update_state(update: SensorsUpdate) -> dict:
    """Actualiza los campos indicados y notifica a todos los suscriptores WS."""
    if update.fuelLevel   is not None: _state["fuelLevel"]   = update.fuelLevel
    if update.temperature is not None: _state["temperature"] = update.temperature
    if update.location    is not None: _state["location"]    = update.location

    logger.info(
        "Sensors actualizado — fuel:%s%% | temp:%s°C | location:%s",
        _state["fuelLevel"], _state["temperature"], _state["location"] or "—",
    )

    await _broadcast()
    return dict(_state)


# ── Endpoint WebSocket ─────────────────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    """
    Canal push para suscriptores (backend ecosystem).
    Envía el estado actual al conectarse y difunde cada actualización posterior.
    """
    await ws.accept()
    _clients.append(ws)
    logger.info("Nuevo suscriptor WS — total: %d", len(_clients))

    # Enviar estado actual inmediatamente al conectarse
    await ws.send_json({"type": "STATE", "payload": dict(_state)})

    try:
        while True:
            await ws.receive_text()
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        if ws in _clients:
            _clients.remove(ws)
        logger.info("Suscriptor WS desconectado — total: %d", len(_clients))
