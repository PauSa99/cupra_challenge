"""
LangChain tools for SALLY — single source of truth for tool definitions.

CABIN_TOOLS    — cabin subsystems, split in two layers:
  · Mode tool (intrinsic, multi-subsystem):
        set_interior_mode(mode)
  · General tools (only on explicit driver request):
        set_steering_wheel, set_seat_driver, set_seat_passenger,
        set_seat_rear_left, set_seat_rear_right, set_table,
        set_inside_light, set_cabin_temperature,
        set_window_projection, set_fuel_level
GMAIL_TOOLS    — gmail_search + gmail_send.
CALENDAR_TOOLS — calendar_list_upcoming (manual refresh + lookup).
SPOTIFY_TOOLS  — now_playing + play / pause / resume / skip.
ALL_TOOLS      — passed to SallyLiveAgent, auto-converted to Gemini FunctionDeclarations.

WS dispatch helpers (tool_call_to_ws_action) map tool names → SET_* WebSocket messages
so the 3D car panel reacts visually when Gemini calls a cabin tool.
No speed locks: any cabin change is allowed at any speed.
"""

import asyncio
import base64
import logging
import os
from email.mime.text import MIMEText
from typing import Literal

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from langchain_core.tools import tool
from shared_state import live_state as _live_state

logger = logging.getLogger(__name__)

_TOKEN_URI    = "https://oauth2.googleapis.com/token"
_GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]


# ── Cabin tools — INTRINSIC MODE ──────────────────────────────────────────────
# Sally proposes one of these proactively. Always after explicit driver consent.

@tool
def set_interior_mode(
    mode: Literal["conduccion", "reunion", "relax", "amics"],
) -> str:
    """Applies a complete cabin preset (steering + all 4 seats + table + ambient + windows).

    Use ONLY after the driver has verbally agreed to the proposal.
    • conduccion — default driving stance: steering extended, seats forward, blue ambient.
    • reunion    — meeting setup: front seats rotate to face rear, big table open, green ambient,
                    windows show presentation.
    • relax      — wind-down: steering retracted, all seats reclined slightly outward, amber
                    ambient, windows show sunset.
    • amics      — social/weekend: seats angle inward in a circle, table open, red ambient,
                    windows show mountains.
    """
    return f"Interior mode: {mode}."


# ── Cabin tools — GENERAL (only on explicit driver request) ───────────────────

@tool
def set_inside_light(
    color: Literal["green", "blue", "amber", "red", "off"],
    intensity: int = 80,
) -> str:
    """Sets cabin ambient LED. color: green=calm, blue=focus/driving, amber=warm/relax,
    red=alert/social, off=none. intensity: 0-100. Apply only when the driver asks."""
    return f"Light: {color} at {intensity}%."


@tool
def set_steering_wheel(position: Literal["retract", "extend"]) -> str:
    """Retracts or extends the steering wheel.
    retract=parked/autonomous mode, extend=driver in control. Apply only when the driver asks."""
    return f"Steering wheel {position}ed."


@tool
def set_seat_driver(position: Literal["normal", "reclined", "rotated"]) -> str:
    """Adjusts the driver seat. Apply only when the driver asks.
    normal=driving, reclined=rest, rotated=facing rear passengers."""
    return f"Driver seat: {position}."


@tool
def set_seat_passenger(position: Literal["normal", "reclined", "rotated"]) -> str:
    """Adjusts the front-passenger seat. Apply only when the driver asks."""
    return f"Passenger seat: {position}."


@tool
def set_seat_rear_left(position: Literal["normal", "reclined", "rotated"]) -> str:
    """Adjusts the rear-left seat. Apply only when the driver asks."""
    return f"Rear-left seat: {position}."


@tool
def set_seat_rear_right(position: Literal["normal", "reclined", "rotated"]) -> str:
    """Adjusts the rear-right seat. Apply only when the driver asks."""
    return f"Rear-right seat: {position}."


@tool
def set_table(open: bool) -> str:
    """Opens or closes the foldable cabin table.
    open=true → table extended for meetings/social, open=false → stowed.
    Apply only when the driver asks ("abre la mesa", "esconde la mesa")."""
    return f"Table: {'open' if open else 'closed'}."


@tool
def set_cabin_temperature(degrees: int) -> str:
    """Sets target cabin temperature in Celsius (16–26). Apply only when the driver asks."""
    return f"Temperature: {degrees}°C."


@tool
def set_window_projection(
    window: Literal["left", "right", "front", "all"],
    preset: Literal["OFF", "MOUNTAINS", "SUNSET", "PRESENTACIO"],
) -> str:
    """Sets a panoramic projection on a window (or all of them).
    Apply only when the driver asks ("pon paisaje en las ventanas", "apaga las pantallas")."""
    return f"Window {window}: {preset}."


@tool
def set_fuel_level(percent: int) -> str:
    """Sets the current fuel/battery level (%, 0–100). Use this only when the
    driver explicitly asks ("ponme el combustible al 15%", "simula que tengo
    poca gasolina"). Updates the on-board reading immediately."""
    percent = max(0, min(int(percent), 100))
    _live_state["fuelLevel"] = percent
    return f"Fuel level: {percent}%."


CABIN_TOOLS = [
    set_interior_mode,
    set_inside_light,
    set_steering_wheel,
    set_seat_driver,
    set_seat_passenger,
    set_seat_rear_left,
    set_seat_rear_right,
    set_table,
    set_cabin_temperature,
    set_window_projection,
    set_fuel_level,
]


# ── Gmail credential helper ───────────────────────────────────────────────────

def _gmail_creds() -> Credentials:
    """Builds OAuth2 credentials for Gmail API.
    Uses GMAIL_REFRESH_TOKEN if set, falls back to GOOGLE_REFRESH_TOKEN.
    The refresh token must have been issued with gmail.readonly + gmail.send scopes.
    """
    client_id     = os.getenv("GOOGLE_CLIENT_ID", "")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "")
    refresh_token = os.getenv("GMAIL_REFRESH_TOKEN") or os.getenv("GOOGLE_REFRESH_TOKEN", "")
    if not all([client_id, client_secret, refresh_token]):
        raise NotImplementedError(
            "Gmail no configurado — necesita GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET "
            "y GMAIL_REFRESH_TOKEN (con scopes gmail.readonly + gmail.send)."
        )
    return Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri=_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=_GMAIL_SCOPES,
    )


# ── Gmail sync implementations (run in thread pool) ──────────────────────────

def _search_emails_sync(query: str, max_results: int) -> str:
    service  = build("gmail", "v1", credentials=_gmail_creds(), cache_discovery=False)
    response = service.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()
    messages = response.get("messages", [])
    if not messages:
        return "No emails found matching that query."

    parts = []
    for msg in messages:
        detail = service.users().messages().get(
            userId="me", id=msg["id"], format="metadata",
            metadataHeaders=["Subject", "From", "Date"],
        ).execute()
        hdrs    = {h["name"]: h["value"] for h in detail["payload"]["headers"]}
        snippet = detail.get("snippet", "")[:120]
        parts.append(
            f"From: {hdrs.get('From','?')}\n"
            f"Subject: {hdrs.get('Subject','?')}\n"
            f"Date: {hdrs.get('Date','?')}\n"
            f"Preview: {snippet}"
        )
    return "\n---\n".join(parts)


def _send_email_sync(to: str, subject: str, body: str) -> str:
    service = build("gmail", "v1", credentials=_gmail_creds(), cache_discovery=False)
    msg = MIMEText(body, "plain", "utf-8")
    msg["to"]      = to
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    service.users().messages().send(userId="me", body={"raw": raw}).execute()
    return f"Email sent to {to}."


# ── Gmail tools ───────────────────────────────────────────────────────────────

@tool
async def gmail_search(query: str, max_results: int = 3) -> str:
    """Searches the user's Gmail inbox using Gmail search syntax.
    query examples: 'is:unread', 'from:boss@company.com', 'subject:reunion', 'is:unread newer_than:1h'.
    max_results: 1-5 (capped at 5 for latency). Use to find emails, check unread, or look up specific senders."""
    try:
        return await asyncio.to_thread(_search_emails_sync, query, min(max_results, 5))
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("gmail_search error: %s", exc)
        return f"Error searching Gmail: {exc}"


@tool
async def gmail_send(to: str, subject: str, body: str) -> str:
    """Sends an email from the user's Gmail account.
    to: recipient email address.
    subject: email subject line.
    body: plain-text email body.
    IMPORTANT: after calling this tool, always confirm verbally to the driver:
    'He enviado el correo a [Name] sobre [brief topic].'"""
    try:
        return await asyncio.to_thread(_send_email_sync, to, subject, body)
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("gmail_send error: %s", exc)
        return f"Error sending email: {exc}"


GMAIL_TOOLS = [gmail_search, gmail_send]


# ── Calendar tools ────────────────────────────────────────────────────────────

@tool
async def calendar_list_upcoming(hours_ahead: int = 24, max_results: int = 5) -> str:
    """Re-fetches Google Calendar and lists upcoming events in the next `hours_ahead` hours.

    Use this when the driver asks about meetings/agenda OR when you need to
    refresh your awareness of the calendar before answering. Updates the
    internal ecosystem snapshot so subsequent context injections are fresh.

    hours_ahead: 1-72 (default 24).
    max_results: 1-10 (default 5).
    Returns a human-readable list of upcoming events with relative times."""
    from ecosystem.calendar import list_upcoming_events

    try:
        events = await list_upcoming_events(
            hours_ahead=max(1, min(int(hours_ahead), 72)),
            max_results=max(1, min(int(max_results), 10)),
        )
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("calendar_list_upcoming error: %s", exc)
        return f"Error consultando Google Calendar: {exc}"

    if not events:
        _live_state.update({"calendar": 999, "nextEvent": None, "upcomingEvents": []})
        return "No tienes eventos próximos en esa ventana."

    _live_state.update({
        "calendar":       events[0]["minutesUntil"],
        "nextEvent":      events[0],
        "upcomingEvents": events,
    })

    lines = []
    for ev in events:
        loc = f" @ {ev['location']}" if ev.get("location") else ""
        lines.append(f"• {ev['title']} — en {ev['minutesUntil']} min{loc}")
    return "Próximos eventos:\n" + "\n".join(lines)


CALENDAR_TOOLS = [calendar_list_upcoming]


# ── Spotify tools ─────────────────────────────────────────────────────────────

@tool
async def spotify_now_playing() -> str:
    """Re-fetches Spotify and tells you what's currently playing for the driver.

    Use this when the driver asks about the music OR when you want to refresh
    Sally's awareness before commenting on music. Updates the internal snapshot
    (spotifyTrack, spotifyGenre, spotifyIsPlaying) so the next polling pass
    reflects the current playback state."""
    from ecosystem.spotify import get_spotify_state

    try:
        state = await get_spotify_state()
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("spotify_now_playing error: %s", exc)
        return f"Error consultando Spotify: {exc}"

    _live_state.update(state)

    if not state.get("spotifyTrack"):
        return "Ahora mismo no hay música sonando en Spotify."
    status = "sonando" if state.get("spotifyIsPlaying") else "en pausa"
    return f"{state['spotifyTrack']} ({state.get('spotifyGenre', 'unknown')}) — {status}."


@tool
async def spotify_play(query: str) -> str:
    """Searches Spotify for the given query and starts playing the first result.

    query: free-text search — track name, artist, or both (e.g. "Born to Run Springsteen").
    Requires an active Spotify device (open the app on phone/PC if there's none).
    After playing, refreshes the now-playing snapshot."""
    from ecosystem.spotify import search_and_play, get_spotify_state

    try:
        result = await search_and_play(query)
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("spotify_play error: %s", exc)
        return f"Error iniciando reproducción: {exc}"

    if result.get("ok"):
        try:
            _live_state.update(await get_spotify_state())
        except Exception as exc:
            logger.debug("spotify_play: snapshot refresh failed: %s", exc)
    return result.get("message", "Spotify play OK.")


@tool
async def spotify_pause() -> str:
    """Pauses Spotify playback on the active device."""
    from ecosystem.spotify import pause_playback

    try:
        result = await pause_playback()
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("spotify_pause error: %s", exc)
        return f"Error pausando reproducción: {exc}"
    if result.get("ok"):
        _live_state["spotifyIsPlaying"] = False
    return result.get("message", "Spotify pause OK.")


@tool
async def spotify_resume() -> str:
    """Resumes Spotify playback on the active device (does not change the track)."""
    from ecosystem.spotify import resume_playback

    try:
        result = await resume_playback()
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("spotify_resume error: %s", exc)
        return f"Error reanudando reproducción: {exc}"
    if result.get("ok"):
        _live_state["spotifyIsPlaying"] = True
    return result.get("message", "Spotify resume OK.")


@tool
async def spotify_skip() -> str:
    """Skips to the next track on the active Spotify device."""
    from ecosystem.spotify import skip_track, get_spotify_state

    try:
        result = await skip_track()
    except NotImplementedError as exc:
        return str(exc)
    except Exception as exc:
        logger.error("spotify_skip error: %s", exc)
        return f"Error saltando canción: {exc}"

    if result.get("ok"):
        try:
            _live_state.update(await get_spotify_state())
        except Exception as exc:
            logger.debug("spotify_skip: snapshot refresh failed: %s", exc)
    return result.get("message", "Spotify next OK.")


SPOTIFY_TOOLS = [spotify_now_playing, spotify_play, spotify_pause, spotify_resume, spotify_skip]


ALL_TOOLS = CABIN_TOOLS + GMAIL_TOOLS + CALENDAR_TOOLS + SPOTIFY_TOOLS


# ── WS dispatch helpers ───────────────────────────────────────────────────────

_TOOL_WS_TYPE: dict[str, str] = {
    "set_interior_mode":     "SET_INTERIOR_MODE",
    "set_inside_light":      "SET_INSIDE_LIGHT",
    "set_steering_wheel":    "SET_STEERING_WHEEL",
    "set_seat_driver":       "SET_SEAT_DRIVER",
    "set_seat_passenger":    "SET_SEAT_PASSENGER",
    "set_seat_rear_left":    "SET_SEAT_REAR_LEFT",
    "set_seat_rear_right":   "SET_SEAT_REAR_RIGHT",
    "set_table":             "SET_TABLE_OPEN",
    "set_cabin_temperature": "SET_CABIN_TEMPERATURE",
    "set_window_projection": "SET_WINDOW_PROJECTION",
    "set_fuel_level":        "SET_FUEL_LEVEL",
}


def tool_call_to_ws_action(tool_name: str, tool_input: dict) -> dict | None:
    """Returns {ws_type, payload} for cabin tools; None for non-cabin tools (Gmail etc.)."""
    ws_type = _TOOL_WS_TYPE.get(tool_name)
    if not ws_type:
        return None

    if tool_name == "set_interior_mode":
        payload = {"mode": tool_input.get("mode", "conduccion")}
    elif tool_name == "set_inside_light":
        payload = {
            "color":     tool_input.get("color", "off"),
            "intensity": tool_input.get("intensity", 80),
        }
    elif tool_name in (
        "set_steering_wheel",
        "set_seat_driver",
        "set_seat_passenger",
        "set_seat_rear_left",
        "set_seat_rear_right",
    ):
        payload = {"position": tool_input.get("position", "")}
    elif tool_name == "set_table":
        payload = {"open": bool(tool_input.get("open", False))}
    elif tool_name == "set_cabin_temperature":
        payload = {"degrees": tool_input.get("degrees", 22)}
    elif tool_name == "set_window_projection":
        payload = {
            "window": tool_input.get("window", "all"),
            "preset": tool_input.get("preset", "OFF"),
        }
    elif tool_name == "set_fuel_level":
        payload = {"percent": int(tool_input.get("percent", 0))}
    else:
        payload = dict(tool_input)

    return {"ws_type": ws_type, "payload": payload}
