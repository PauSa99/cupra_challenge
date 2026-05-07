"""
Conector Sensors — suscriptor WebSocket al simulador de sensores del coche.

Funciona exactamente igual que ecosystem/wearable.py pero para los sensores
del vehículo: nivel de combustible (fuelLevel %), temperatura exterior y ubicación.

Configuración necesaria (variables de entorno):
    SENSORS_WS_URL  — URL WebSocket del simulador, ej: ws://sensors:3003/ws

Flujo:
    1. Conecta al endpoint WS del simulador (ws://sensors:3003/ws)
    2. Recibe el estado actual en el momento de la conexión
    3. Llama al callback ``on_update`` con cada mensaje STATE que llegue
    4. Si la conexión se pierde, el caller (main.py) se encarga de reintentar
"""

import json
import logging
import os

import websockets

logger = logging.getLogger(__name__)


async def sensors_ws_listener(on_update) -> None:
    """Conecta al WebSocket del simulador de sensores y llama on_update con cada STATE.

    Args:
        on_update: Callable ``(dict) → None`` que recibe el payload del estado
                   cada vez que el simulador publica un cambio.

    Raises:
        NotImplementedError: Si ``SENSORS_WS_URL`` no está configurado.
        websockets.exceptions.WebSocketException: Si la conexión falla.
    """
    url = os.getenv("SENSORS_WS_URL", "")
    if not url:
        raise NotImplementedError("SENSORS_WS_URL no configurado")

    logger.info("Sensors: conectando a %s", url)

    async with websockets.connect(url) as ws:
        logger.info("Sensors: conexión WS establecida")
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Sensors: mensaje no-JSON ignorado: %s", raw[:80])
                continue

            if msg.get("type") == "STATE":
                payload = msg.get("payload")
                if not isinstance(payload, dict):
                    logger.warning("Sensors: STATE sin payload válido: %s", raw[:80])
                    continue
                logger.info(
                    "Sensors — fuel:%s%% | temp:%s°C | location:%s",
                    payload.get("fuelLevel"),
                    payload.get("temperature"),
                    payload.get("location") or "—",
                )
                on_update(payload)
