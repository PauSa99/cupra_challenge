"""
Configuración centralizada de logging para el backend de SALLY.

Todos los módulos deben obtener su logger a través de `get_logger(__name__)`
en lugar de usar `print()` directamente. Esto garantiza un formato uniforme
y permite controlar el nivel de verbosidad desde una única variable de entorno.
"""

import logging
import os
import sys


def setup_logging() -> None:
    """Configura el logger raíz de la aplicación.

    Lee el nivel de log desde la variable de entorno ``LOG_LEVEL``
    (por defecto ``INFO``). Escribe en ``stdout`` con un formato que incluye
    timestamp, nivel, nombre del módulo y mensaje.

    Debe llamarse una única vez al arrancar la aplicación (en ``main.py``
    dentro del ``lifespan``).

    Levels disponibles (de menor a mayor verbosidad):
        ``DEBUG`` → ``INFO`` → ``WARNING`` → ``ERROR`` → ``CRITICAL``

    Example::

        # En main.py
        from config.logger import setup_logging
        setup_logging()
    """
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s [%(levelname)-8s] %(name)s — %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root = logging.getLogger()
    root.setLevel(level)
    # Evitar duplicar handlers si setup_logging() se llama más de una vez
    if not root.handlers:
        root.addHandler(handler)


def get_logger(name: str) -> logging.Logger:
    """Devuelve un logger con el nombre del módulo que lo solicita.

    Args:
        name: Nombre del logger, normalmente ``__name__`` del módulo llamante.

    Returns:
        Instancia de ``logging.Logger`` lista para usar.

    Example::

        from config.logger import get_logger
        logger = get_logger(__name__)
        logger.info("Módulo cargado")
    """
    return logging.getLogger(name)
