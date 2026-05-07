"""
Conector Wearable — suscriptor WebSocket al simulador de wearable.

En lugar de polling HTTP, mantiene una conexión WebSocket persistente al
servicio wearable. Cada vez que el usuario actualiza un valor en la UI del
simulador, el servicio wearable difunde el nuevo estado y este conector llama
al callback ``on_update`` con el payload recibido.

Configuración necesaria (variables de entorno):
    WEARABLE_WS_URL  — URL WebSocket del simulador, ej: ws://wearable:3002/ws

Flujo:
    1. Conecta al endpoint WS del simulador (ws://wearable:3002/ws)
    2. Recibe el estado actual en el momento de la conexión
    3. Difunde al callback ``on_update`` con cada mensaje STATE que llegue
    4. Si la conexión se pierde, el caller (main.py) se encarga de reintentar
"""

import json
import logging
import os

import websockets

logger = logging.getLogger(__name__)


async def wearable_ws_listener(on_update) -> None:
    """Conecta al WebSocket del simulador y llama on_update con cada STATE.

    La función es una corutina de larga duración: bloquea mientras la conexión
    está activa y sólo retorna cuando el servidor cierra el socket o se produce
    un error. El bucle de reconexión debe manejarse en el caller (main.py).

    Args:
        on_update: Callable ``(dict) → None`` que recibe el payload del estado
                   cada vez que el simulador publica un cambio. Se llama también
                   con el estado inicial enviado al conectarse.

    Raises:
        NotImplementedError: Si ``WEARABLE_WS_URL`` no está configurado.
        websockets.exceptions.WebSocketException: Si la conexión falla.
    """
    url = os.getenv("WEARABLE_WS_URL", "")
    if not url:
        raise NotImplementedError("WEARABLE_WS_URL no configurado")

    logger.info("Wearable: conectando a %s", url)

    async with websockets.connect(url) as ws:
        logger.info("Wearable: conexión WS establecida")
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("Wearable: mensaje no-JSON ignorado: %s", raw[:80])
                continue

            if msg.get("type") == "STATE":
                payload = msg.get("payload")
                if not isinstance(payload, dict):
                    logger.warning("Wearable: STATE sin payload válido: %s", raw[:80])
                    continue
                logger.info(
                    "Wearable — HR:%s bpm | Sueño:%.1fh | Estrés:%s/10 | Pasos:%s | Social:%s%%",
                    payload.get("heartRate"),
                    payload.get("sleepHours", 0),
                    payload.get("stressLevel"),
                    payload.get("steps"),
                    payload.get("socialBattery"),
                )
                on_update(payload)
