"""
Gestión de conexiones WebSocket activas y difusión de mensajes.

``ConnectionManager`` mantiene la lista de sockets abiertos y expone
``broadcast`` para enviar un mensaje a todos los clientes a la vez.
El broadcast es resiliente: si un socket falla durante el envío,
se elimina de la lista sin interrumpir el resto de entregas.
"""

import json
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Registro centralizado de conexiones WebSocket activas.

    Attributes:
        active: Lista de sockets actualmente conectados.

    Example::

        manager = ConnectionManager()
        # En el endpoint WebSocket:
        await manager.connect(ws)
        await manager.broadcast("SALLY_ACTION", {...})
    """

    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        """Acepta y registra una nueva conexión WebSocket.

        Llama a ``ws.accept()`` antes de añadir el socket a ``active``,
        tal como exige el protocolo WebSocket de FastAPI.

        Args:
            ws: Socket entrante pendiente de aceptar.
        """
        await ws.accept()
        self.active.append(ws)
        logger.info("Cliente conectado — total activos: %d", len(self.active))

    def disconnect(self, ws: WebSocket) -> None:
        """Elimina un socket de la lista de conexiones activas.

        Llamar a este método no cierra el socket; solo lo desregistra
        del manager. FastAPI cierra el socket al salir del endpoint.

        Args:
            ws: Socket a desregistrar.
        """
        self.active.remove(ws)
        logger.info("Cliente desconectado — total activos: %d", len(self.active))

    async def broadcast(self, msg_type: str, payload: dict) -> None:
        """Envía un mensaje JSON a todos los clientes conectados.

        El mensaje sigue el protocolo ``{type, payload}`` que espera
        el frontend de Sally. Los sockets que fallen durante el envío
        se eliminan automáticamente de ``active`` sin detener el broadcast.

        Args:
            msg_type: Tipo de mensaje (ej. ``"SALLY_ACTION"``).
            payload:  Cuerpo del mensaje como diccionario serializable a JSON.

        Example::

            await manager.broadcast("SALLY_ACTION", {
                "ambient_color": "blue",
                "screen_mode": "focus",
                ...
            })
        """
        message = json.dumps({"type": msg_type, "payload": payload})
        dead: list[WebSocket] = []

        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception as exc:
                # Socket cerrado inesperadamente; se limpia tras el loop
                logger.warning("Error al enviar a cliente, marcando como muerto: %s", exc)
                dead.append(ws)

        for ws in dead:
            self.active.remove(ws)

        if dead:
            logger.info(
                "Broadcast completado — %d entregados, %d eliminados",
                len(self.active),
                len(dead),
            )
        else:
            logger.debug("Broadcast '%s' entregado a %d cliente(s)", msg_type, len(self.active))
