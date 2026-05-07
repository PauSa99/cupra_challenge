"""
Carga y validación de variables de entorno del backend.

Usa python-dotenv para leer el fichero .env del directorio raíz del proyecto.
Las variables de Docker Compose o del sistema operativo tienen prioridad.
"""

import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def load_env() -> dict:
    """Carga las variables de entorno necesarias para el backend.

    Autenticación Google AI Studio (API key):
    - GOOGLE_API_KEY     : Clave de API de AI Studio. Requerida para Live API.
    - GOOGLE_LIVE_MODEL  : Modelo Live API. Default: gemini-3.1-flash-live-preview.

    Variables de conectores (opcionales):
    - SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN
        Scopes requeridos para play/pause/skip:
            user-read-currently-playing
            user-read-playback-state
            user-modify-playback-state
    - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
        Scopes requeridos: calendar.readonly + gmail.readonly + gmail.send
    - WEARABLE_WS_URL  : URL WebSocket del simulador de wearable.
    - SENSORS_WS_URL   : URL WebSocket del simulador de sensores.

    Returns:
        Diccionario con todas las claves de configuración del backend.
    """
    config = {
        "GOOGLE_API_KEY":   os.getenv("GOOGLE_API_KEY", ""),
        "GOOGLE_LIVE_MODEL": os.getenv("GOOGLE_LIVE_MODEL", "gemini-3.1-flash-live-preview"),
        "BACKEND_PORT":     int(os.getenv("BACKEND_PORT", "3001")),
        "ENV":              os.getenv("ENV", "development"),
    }

    if not config["GOOGLE_API_KEY"]:
        logger.warning(
            "GOOGLE_API_KEY no configurado — la Live API (voz) no funcionará. "
            "Obtén una clave en https://aistudio.google.com/apikey y añádela al .env."
        )

    spotify_ok  = all(os.getenv(k) for k in ("SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"))
    calendar_ok = all(os.getenv(k) for k in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"))
    wearable_ok = bool(os.getenv("WEARABLE_WS_URL"))
    sensors_ok  = bool(os.getenv("SENSORS_WS_URL"))

    logger.info(
        "Configuración cargada — modelo=%s entorno=%s",
        config["GOOGLE_LIVE_MODEL"],
        config["ENV"],
    )
    logger.info(
        "Conectores — Spotify: %s | Calendar: %s | Wearable: %s | Sensors: %s",
        "activo"      if spotify_ok  else "desactivado",
        "activo"      if calendar_ok else "desactivado",
        "activo (WS)" if wearable_ok else "desactivado",
        "activo (WS)" if sensors_ok  else "desactivado",
    )

    return config
