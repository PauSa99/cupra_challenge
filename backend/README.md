# SALLY · Backend

Servidor FastAPI que aloja la lógica del agente, el bridge de audio con
Gemini Live y los conectores al ecosistema externo (Calendar, Gmail,
Spotify) y al ecosistema interno simulado (sensores del coche, wearable).

> Para una visión global del proyecto y la arquitectura completa, ver el
> [README raíz](../README.md).

---

## Filosofía

**Una única pieza de inteligencia.** Toda decisión la toma `SallyLiveAgent`
hablando con Gemini 3.1 Flash Live. El backend no implementa "lógica de
negocio" sobre cuándo cambiar el modo de cabina o qué decir al conductor
— sólo recoge datos del ecosistema y los inyecta como contexto en la
sesión Live activa. Gemini decide qué tools llamar y cuándo hablar.

Esto significa que el prompt de sistema (`sally/live_prompt.py`) y el
catálogo de tools (`sally/tools.py`) son la **fuente de verdad del
comportamiento**. Cambiarlos cambia a Sally, sin tocar `main.py`.

---

## Estructura

```
backend/
├── Dockerfile              ← imagen dev con hot-reload (uvicorn --reload)
├── requirements.txt
└── src/
    ├── main.py             ← entrypoint: lifespan, polling, endpoints WS
    ├── shared_state.py     ← dict global compartido entre tools y polling
    ├── config/
    │   ├── env.py          ← carga + validación de variables de entorno
    │   └── logger.py       ← formato y nivel únicos para todo el backend
    ├── sally/
    │   ├── live_bridge.py  ← SallyLiveAgent (clase única)
    │   ├── tools.py        ← 17 tools LangChain — fuente única de tools
    │   └── live_prompt.py  ← prompt de sistema completo
    ├── ecosystem/
    │   ├── calendar.py     ← Google Calendar API (read-only)
    │   ├── gmail.py        ← Gmail snapshot de urgentes
    │   ├── spotify.py      ← Spotify Web API (read + control)
    │   ├── sensors.py      ← suscriptor WS al simulador sensors
    │   └── wearable.py     ← suscriptor WS al simulador wearable
    └── websocket/
        └── manager.py      ← lista de conexiones activas + broadcast
```

---

## Arquitectura de runtime

```
                  ┌──────────────────────────────────────────────────────┐
                  │                       main.py                         │
                  │                                                       │
                  │   lifespan() → asyncio.create_task(...)               │
                  │   ─ _polling_loop      cada 15 s                      │
                  │   ─ _calendar_loop     cada 3 min                     │
                  │   ─ _spotify_loop      cada 30 s                      │
                  │   ─ _gmail_loop        cada 3 min                     │
                  │   ─ _wearable_ws_task  reactivo (push del simulador)  │
                  │   ─ _sensors_ws_task   reactivo (push del simulador)  │
                  │                                                       │
                  └──────┬───────────────────────────────────┬────────────┘
                         │                                   │
                         ▼ writes                            ▼ reads
                  ┌──────────────────────────────────────────┐
                  │  shared_state.live_state  ─  dict global │
                  └──────────────────────────────────────────┘
                         ▲                                   ▲
                         │ inject_context(state)             │ tools usan
                         │                                   │   _live_state
                  ┌──────┴───────────────────────────────────┴──────────┐
                  │                SallyLiveAgent                       │
                  │  ─ /ws/sally  (PCM bidireccional)                   │
                  │  ─ Gemini Live API (gemini-3.1-flash-live-preview)  │
                  │  ─ función _execute_tools → ConnectionManager       │
                  │     broadcast(SET_*) a todos los /ws conectados     │
                  └─────────────────────────────────────────────────────┘
```

### Triggers reactivos (no esperan al polling)

Cuando un slider del wearable o sensors cruza un umbral, el callback de su
WS subscriber dispara una inyección inmediata vía
`SallyLiveAgent.inject_system_message()` con el `trigger`:

| Trigger | Umbral | Reacción esperada |
|---|---|---|
| `stress_spike` | `stressLevel ≥ 7` cruzado al alza | Proponer `relax`. |
| `heart_rate_spike` | `heartRate ≥ 100` con coche parado | Preguntar bienestar, proponer `relax`. |
| `social_high` | `socialBattery ≥ 75` cruzado al alza | Proponer `amics` + plan cerca de la `location`. |
| `fuel_low` | `fuelLevel ≤ 25` cruzado a la baja | Sacar conversación de gasolinera/carga. |
| `fuel_critical` | `fuelLevel ≤ 10` cruzado a la baja | Urgencia: parar a repostar ya. |

Hay un rate limit de 6 s (`REACTIVE_POLL_MIN_INTERVAL_S`) para evitar que
arrastrar un slider sature al agente.

---

## Endpoints

### `GET /health`
Comprobación de disponibilidad. Responde `{"status":"ok","service":"sally-backend"}`.

### `WS /ws` — canal del ecosistema
- Acepta cualquier cliente, sólo escucha keep-alives.
- Envía `CONNECTED` y un primer `ECOSYSTEM_UPDATE` al conectar.
- Recibe `SET_*` de `SallyLiveAgent` cuando ejecuta un tool y los retransmite
  por broadcast a todos los clientes conectados (panel 3D).
- Si hay sesión Live activa, también dispara `inject_context()` para que
  Sally re-evalúe la cabina ahora que hay un cliente nuevo.

### `WS /ws/sally` — bridge de audio Gemini Live
- El cliente debe enviar `SESSION_START` antes de mandar audio.
- Audio entrante: PCM Int16 LE 16 kHz mono (chunks de 100 ms desde el
  AudioWorklet del frontend).
- Audio saliente: PCM Int16 LE 24 kHz mono (voz Kore de Gemini).
- Mensajes de control JSON: `INTERRUPT` (barge-in del frontend),
  `SESSION_END`. El backend responde con `LIVE_READY`, `LIVE_STATE`,
  `LIVE_ERROR`, y los `SET_*` cuando el agente ejecuta un tool.

### Sub-apps en producción

En la imagen de Cloud Run (`/Dockerfile` raíz), `backend/src/main.py`
monta los simuladores como sub-apps al final del archivo:

```python
from simulators.sensors  import app as sensors_app
from simulators.wearable import app as wearable_app
app.mount("/sensors",  sensors_app)
app.mount("/wearable", wearable_app)
app.mount("/", StaticFiles(directory=str(_static_dir), html=True))
```

En modo `compose` los imports fallan (los simuladores viven en
contenedores aparte) y el bloque se omite — sin efecto secundario.

---

## Catálogo de tools (`sally/tools.py`)

Todas son `@tool` de LangChain con esquema Pydantic. Se convierten a
`FunctionDeclaration` de Gemini en `_lc_tools_to_genai()` (en
`live_bridge.py`).

### Cabina — capa intrínseca (la principal)

| Tool | Args | Aplica |
|---|---|---|
| `set_interior_mode` | `mode: conduccion\|reunion\|relax\|amics` | Preset completo: volante + 4 asientos + mesa + luz + ventanas. |

### Cabina — capa puntual (sólo a petición)

| Tool | Args | Notas |
|---|---|---|
| `set_steering_wheel` | `position: extend\|retract` | |
| `set_seat_driver` / `_passenger` / `_rear_left` / `_rear_right` | `position: normal\|reclined\|rotated` | Sin lock por velocidad. |
| `set_table` | `open: bool` | |
| `set_inside_light` | `color`, `intensity 0-100` | Colores: green/blue/amber/red/off. |
| `set_cabin_temperature` | `degrees 16-26` | |
| `set_window_projection` | `window: left\|right\|front\|all`, `preset: OFF\|MOUNTAINS\|SUNSET\|PRESENTACIO` | |
| `set_fuel_level` | `percent 0-100` | Sólo cuando el conductor pide simular un nivel. |

### Gmail

| Tool | Args | Notas |
|---|---|---|
| `gmail_search` | `query`, `max_results 1-5` | Sintaxis Gmail: `is:unread`, `from:`, `subject:`. |
| `gmail_send` | `to`, `subject`, `body` | Después de enviar, Sally **debe** confirmar verbalmente. |

### Calendar

| Tool | Args | Notas |
|---|---|---|
| `calendar_list_upcoming` | `hours_ahead 1-72`, `max_results 1-10` | Refresh manual + actualiza `live_state`. |

### Spotify

| Tool | Args | Notas |
|---|---|---|
| `spotify_now_playing` | – | Refresca `spotifyTrack`, `spotifyGenre`, `spotifyIsPlaying`. |
| `spotify_play` | `query` | Busca y reproduce el primer match. Requiere device activo. |
| `spotify_pause` | – | |
| `spotify_resume` | – | |
| `spotify_skip` | – | |

### Cómo añadir una tool nueva

1. Define la función con `@tool` en `sally/tools.py`.
2. Añádela a la lista correspondiente (`CABIN_TOOLS`, `GMAIL_TOOLS`, etc.).
   `ALL_TOOLS` es la suma — se pasa automáticamente a Gemini.
3. Si afecta a la cabina visual, añade su mapping a `_TOOL_WS_TYPE` y, si
   tiene un payload no trivial, una rama en `tool_call_to_ws_action()`.
4. Documenta el comportamiento en `sally/live_prompt.py` para que Gemini
   sepa cuándo invocarla.

---

## Conectores al ecosistema (`ecosystem/`)

Cada conector expone funciones async que devuelven (o publican) snapshots
del estado externo. Si las credenciales no están configuradas, lanzan
`NotImplementedError` y el polling loop correspondiente lo trata como
"desactivado" sin matar el resto del backend.

| Conector | Función pública | Estado actualizado |
|---|---|---|
| `calendar.py` | `get_calendar_state()`, `list_upcoming_events()` | `calendar`, `nextEvent`, `upcomingEvents` |
| `gmail.py` | `get_gmail_snapshot()` | `urgentEmails` (lista de unread con subject:urgent + variantes) |
| `spotify.py` | `get_spotify_state()`, `search_and_play()`, `pause_playback()`, `resume_playback()`, `skip_track()` | `spotifyTrack`, `spotifyGenre`, `spotifyIsPlaying` |
| `sensors.py` | `sensors_ws_listener(callback)` | `fuelLevel`, `temperature`, `location` |
| `wearable.py` | `wearable_ws_listener(callback)` | `heartRate`, `sleepHours`, `stressLevel`, `steps`, `socialBattery` |

Las llamadas síncronas a librerías de Google se ejecutan en thread pool
(`asyncio.to_thread`) para no bloquear el event loop.

---

## Variables de entorno

| Variable | Default | Obligatoria | Descripción |
|---|---|---|---|
| `GOOGLE_API_KEY` | – | ✅ | Clave de [Google AI Studio](https://aistudio.google.com/apikey). Sin ella la sesión Live no arranca. |
| `GOOGLE_LIVE_MODEL` | `gemini-3.1-flash-live-preview` | ✗ | Override del modelo Live. |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | – | ✗ | OAuth para Calendar + Gmail (con scopes `calendar.readonly` + `gmail.readonly` + `gmail.send`). |
| `GMAIL_REFRESH_TOKEN` | – | ✗ | Sólo si tienes un token Gmail distinto del de Calendar. |
| `SPOTIFY_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | – | ✗ | Spotify Web API. Scopes: `user-read-currently-playing`, `user-read-playback-state`, `user-modify-playback-state`. |
| `WEARABLE_WS_URL` | – | – | URL del simulador wearable. Inyectada por compose o por el Dockerfile prod. |
| `SENSORS_WS_URL` | – | – | Idem para sensors. |
| `BACKEND_PORT` | `3001` | ✗ | Sólo dev. En Cloud Run se usa `$PORT`. |
| `LOG_LEVEL` | `INFO` | ✗ | `DEBUG` para ver inyecciones de contexto y dispatch de tools. |

`config/env.py` valida todo al arrancar y loguea qué conectores quedan
activos y cuáles desactivados.

---

## Logging

Formato:

```
2026-04-15 12:34:56 [INFO    ] sally.live_bridge — Live tool set_interior_mode({'mode': 'reunion'}) → Interior mode: reunion.
2026-04-15 12:35:01 [INFO    ] main — Polling — inject_context (clientes=1)
2026-04-15 12:35:01 [DEBUG   ] sally.live_bridge — inject_context: trigger=periodic
```

Para ver inyecciones de contexto y eventos de Gemini:

```powershell
$env:LOG_LEVEL="DEBUG"; uvicorn main:app --reload
```

---

## Arrancar fuera de Docker

```powershell
# Desde la raíz del repo
cd backend
python -m venv venv; .\venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd src
$env:GOOGLE_API_KEY="tu-clave-aistudio"
uvicorn main:app --host 0.0.0.0 --port 3001 --reload
```

Con esto sólo funcionan `/ws` y `/ws/sally` — los simuladores no estarán
disponibles. Para desarrollo completo usa `docker compose` desde la raíz.
