"""
Conector Spotify.

Lectura: canción en reproducción, géneros del artista, normalización al
catálogo de categorías que entiende SALLY.

Control activo: play / pause / resume / skip / search-and-play. SALLY
puede iniciar reproducción o cambiar de canción mediante tools.

Configuración necesaria (variables de entorno):
    SPOTIFY_CLIENT_ID
    SPOTIFY_CLIENT_SECRET
    SPOTIFY_REFRESH_TOKEN

El refresh token DEBE haberse emitido con estos scopes:
    user-read-currently-playing
    user-read-playback-state
    user-modify-playback-state
"""

import base64
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_TOKEN_URL    = "https://accounts.spotify.com/api/token"
_PLAYING_URL  = "https://api.spotify.com/v1/me/player/currently-playing"
_ARTIST_URL   = "https://api.spotify.com/v1/artists/{id}"
_DEVICES_URL  = "https://api.spotify.com/v1/me/player/devices"
_PLAY_URL     = "https://api.spotify.com/v1/me/player/play"
_PAUSE_URL    = "https://api.spotify.com/v1/me/player/pause"
_NEXT_URL     = "https://api.spotify.com/v1/me/player/next"
_SEARCH_URL   = "https://api.spotify.com/v1/search"

# Mapeo de géneros de Spotify → categorías que usa Sally en el system prompt
GENRE_MAP = {
    "jazz":        ["jazz", "soul", "blues", "bossa nova", "swing"],
    "classical":   ["classical", "opera", "orchestral", "chamber"],
    "electronic":  ["electronic", "techno", "house", "edm", "ambient", "synthwave"],
    "rock":        ["rock", "metal", "punk", "grunge", "indie rock", "alternative"],
    "pop":         ["pop", "dance pop", "electropop", "k-pop", "latin pop"],
    "hiphop":      ["hip hop", "rap", "trap", "r&b", "urban"],
    "relaxing":    ["chill", "lo-fi", "acoustic", "folk", "singer-songwriter", "new age"],
}


def _normalize_genre(raw_genres: list[str]) -> str:
    """Mapea los géneros de Spotify a la categoría más cercana de GENRE_MAP."""
    for genre in raw_genres:
        genre_lower = genre.lower()
        for category, keywords in GENRE_MAP.items():
            if any(kw in genre_lower for kw in keywords):
                return category
    return raw_genres[0] if raw_genres else "unknown"


async def _get_access_token(client: httpx.AsyncClient) -> str:
    """Obtiene un access token usando el refresh token."""
    client_id     = os.getenv("SPOTIFY_CLIENT_ID", "")
    client_secret = os.getenv("SPOTIFY_CLIENT_SECRET", "")
    refresh_token = os.getenv("SPOTIFY_REFRESH_TOKEN", "")

    if not all([client_id, client_secret, refresh_token]):
        raise NotImplementedError("Credenciales de Spotify no configuradas en .env")

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()

    response = await client.post(
        _TOKEN_URL,
        headers={"Authorization": f"Basic {credentials}"},
        data={
            "grant_type":    "refresh_token",
            "refresh_token": refresh_token,
        },
    )
    response.raise_for_status()
    return response.json()["access_token"]


async def _get_active_device_id(client: httpx.AsyncClient, headers: dict) -> str | None:
    """Devuelve el id del dispositivo activo, o el primero disponible si no hay activo."""
    resp = await client.get(_DEVICES_URL, headers=headers)
    if resp.status_code != 200:
        return None
    devices = resp.json().get("devices", []) or []
    if not devices:
        return None
    for d in devices:
        if d.get("is_active"):
            return d.get("id")
    return devices[0].get("id")


async def get_spotify_state() -> dict:
    """Obtiene la canción en reproducción y la normaliza para live_state.

    Returns:
        {
            "spotifyGenre":     <categoría normalizada (str)>,
            "spotifyTrack":     <"Canción — Artista" | None>,
            "spotifyIsPlaying": <bool>,
        }

    Raises:
        NotImplementedError: Si las credenciales no están configuradas.
    """
    async with httpx.AsyncClient() as client:
        access_token = await _get_access_token(client)
        headers = {"Authorization": f"Bearer {access_token}"}

        response = await client.get(_PLAYING_URL, headers=headers)

        if response.status_code == 204:
            logger.debug("Spotify: no hay nada en reproducción")
            return {"spotifyGenre": "none", "spotifyTrack": None, "spotifyIsPlaying": False}

        response.raise_for_status()
        data = response.json()

        if not data or data.get("currently_playing_type") != "track":
            return {"spotifyGenre": "none", "spotifyTrack": None, "spotifyIsPlaying": False}

        track     = data["item"]
        is_playing = bool(data.get("is_playing", False))
        track_name = f"{track['name']} — {track['artists'][0]['name']}"
        artist_id  = track["artists"][0]["id"]

        artist_response = await client.get(
            _ARTIST_URL.format(id=artist_id),
            headers=headers,
        )
        artist_response.raise_for_status()
        raw_genres = artist_response.json().get("genres", [])
        genre = _normalize_genre(raw_genres)

        logger.info(
            "Spotify — '%s' | género: %s | playing=%s",
            track_name, genre, is_playing,
        )

        return {
            "spotifyGenre":     genre,
            "spotifyTrack":     track_name,
            "spotifyIsPlaying": is_playing,
        }


# ── Control activo ──────────────────────────────────────────────────────────

async def search_and_play(query: str) -> dict:
    """Busca el primer track que matchee `query` y lo reproduce en el dispositivo activo.

    Returns:
        {
            "ok":        bool,
            "message":   str,    # legible para SALLY
            "track":     str | None,
        }
    """
    async with httpx.AsyncClient() as client:
        token   = await _get_access_token(client)
        headers = {"Authorization": f"Bearer {token}"}

        search = await client.get(
            _SEARCH_URL,
            headers=headers,
            params={"q": query, "type": "track", "limit": 1},
        )
        search.raise_for_status()
        items = (search.json().get("tracks") or {}).get("items") or []
        if not items:
            return {"ok": False, "message": f"No encontré nada para '{query}'.", "track": None}

        track     = items[0]
        track_uri = track["uri"]
        track_lbl = f"{track['name']} — {track['artists'][0]['name']}"

        device_id = await _get_active_device_id(client, headers)
        if not device_id:
            return {
                "ok":      False,
                "message": "No hay ningún dispositivo de Spotify activo. Abre la app primero.",
                "track":   track_lbl,
            }

        resp = await client.put(
            _PLAY_URL,
            headers=headers,
            params={"device_id": device_id},
            json={"uris": [track_uri]},
        )
        if resp.status_code not in (200, 202, 204):
            return {
                "ok":      False,
                "message": f"Spotify rechazó el play ({resp.status_code}).",
                "track":   track_lbl,
            }

        logger.info("Spotify play — %s en device=%s", track_lbl, device_id)
        return {"ok": True, "message": f"Reproduciendo {track_lbl}.", "track": track_lbl}


async def _simple_playback_command(method: str, url: str, action_label: str) -> dict:
    """Helper para PUT/POST sin body (pause / resume / next)."""
    async with httpx.AsyncClient() as client:
        token   = await _get_access_token(client)
        headers = {"Authorization": f"Bearer {token}"}
        device_id = await _get_active_device_id(client, headers)
        if not device_id:
            return {"ok": False, "message": "No hay dispositivo de Spotify activo."}

        request_fn: Any = client.put if method == "PUT" else client.post
        resp = await request_fn(url, headers=headers, params={"device_id": device_id})
        if resp.status_code not in (200, 202, 204):
            return {"ok": False, "message": f"Spotify rechazó {action_label} ({resp.status_code})."}
        return {"ok": True, "message": f"{action_label} OK."}


async def pause_playback() -> dict:
    return await _simple_playback_command("PUT", _PAUSE_URL, "pause")


async def resume_playback() -> dict:
    return await _simple_playback_command("PUT", _PLAY_URL, "resume")


async def skip_track() -> dict:
    return await _simple_playback_command("POST", _NEXT_URL, "next")
