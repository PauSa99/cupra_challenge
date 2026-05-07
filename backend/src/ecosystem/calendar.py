"""
Conector Google Calendar.

Obtiene los próximos eventos del calendario del usuario, con detalles
(título, hora, ubicación, minutos hasta) para que SALLY pueda hablar
del próximo compromiso, no solo de "minutos hasta el siguiente".

Configuración necesaria (variables de entorno):
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    GOOGLE_REFRESH_TOKEN

Las llamadas de red se ejecutan en un thread pool (asyncio.to_thread)
para no bloquear el event loop de FastAPI.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES    = ["https://www.googleapis.com/auth/calendar.readonly"]
_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _get_credentials() -> Credentials:
    """Construye las credenciales OAuth2 desde las variables de entorno."""
    client_id     = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    refresh_token = os.getenv("GOOGLE_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        raise NotImplementedError("Credenciales de Google Calendar no configuradas en .env")

    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )


def _parse_event_start(start_field: dict) -> datetime:
    """Convierte el campo `start` de un evento (date o dateTime) a datetime UTC-aware."""
    raw = start_field.get("dateTime", start_field.get("date"))
    if "T" in raw:
        dt = datetime.fromisoformat(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    return datetime.fromisoformat(raw + "T00:00:00+00:00")


def _summarize_event(event: dict, now: datetime) -> dict:
    """Convierte un evento del API en un dict ligero para inyectar en live_state."""
    start_dt = _parse_event_start(event["start"])
    minutes_until = max(0, int((start_dt - now).total_seconds() / 60))
    return {
        "title":         event.get("summary", "Sin título"),
        "minutesUntil":  minutes_until,
        "start":         start_dt.isoformat(),
        "location":      event.get("location", "") or "",
        "attendeesCount": len(event.get("attendees", []) or []),
    }


def _fetch_upcoming_events(creds: Credentials, hours_ahead: int, max_results: int) -> list[dict]:
    """Obtiene los próximos eventos hasta `hours_ahead` horas (síncrono — usar via to_thread)."""
    from datetime import timedelta

    service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    now     = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=hours_ahead)

    events_result = service.events().list(
        calendarId="primary",
        timeMin=now.isoformat(),
        timeMax=horizon.isoformat(),
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    events = events_result.get("items", [])
    return [_summarize_event(e, now) for e in events]


def _fetch_next_event(creds: Credentials) -> dict:
    """Snapshot del próximo evento + lista corta para inyectar en live_state."""
    upcoming = _fetch_upcoming_events(creds, hours_ahead=24, max_results=5)

    if not upcoming:
        logger.debug("Calendar: no hay eventos próximos")
        return {"calendar": 60, "nextEvent": None, "upcomingEvents": []}

    next_evt = upcoming[0]
    logger.info(
        "Calendar — próximo evento: '%s' en %d min",
        next_evt["title"], next_evt["minutesUntil"],
    )

    return {
        "calendar":        next_evt["minutesUntil"],
        "nextEvent":       next_evt,
        "upcomingEvents":  upcoming,
    }


async def get_calendar_state() -> dict:
    """Snapshot del calendario para inyección periódica en live_state.

    Returns:
        {
            "calendar":       <minutos hasta el próximo evento (int)>,
            "nextEvent":      <dict con title/minutesUntil/start/location | None>,
            "upcomingEvents": [<hasta 5 eventos próximos>],
        }

    Raises:
        NotImplementedError: Si las credenciales no están configuradas.
    """
    creds = _get_credentials()
    return await asyncio.to_thread(_fetch_next_event, creds)


async def list_upcoming_events(hours_ahead: int = 24, max_results: int = 5) -> list[dict]:
    """Devuelve los próximos eventos en una ventana configurable.

    Pensado para invocación manual desde una tool de SALLY (cuando el conductor
    pregunta por su agenda). El llamante puede actualizar live_state con el
    primero de la lista para mantener `calendar` sincronizado.
    """
    creds = _get_credentials()
    return await asyncio.to_thread(_fetch_upcoming_events, creds, hours_ahead, max_results)
