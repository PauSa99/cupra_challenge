# SALLY · CUPRA Born AI Agent

> Un agente de IA que integra el coche en el ecosistema digital del conductor
> y adapta el habitáculo en tiempo real según el contexto.

SALLY es la voz de un CUPRA Born eléctrico imaginado para 2030. Habla con el
conductor en castellano (o el idioma que detecte) por voz nativa — sin TTS,
sin subtítulos — y reacciona de forma proactiva a su estado biométrico, su
calendario, sus correos, su música y los sensores del propio coche. Cuando
detecta que conviene cambiar el ambiente de la cabina (modo conducción,
reunión, relax o amics), lo propone, espera el sí del conductor y aplica el
preset completo: volante + 4 asientos + mesa plegable + iluminación
ambiental + proyección en las ventanas.

Proyecto presentado al **CUPRA Challenge 2026**.

---

## Demo

🌐 La demo pública vive en Cloud Run (Madrid). El enlace concreto se entrega
al jurado por privado. Para correr en local sigue [Setup local](#setup-local).

📺 Funcionalidades visibles en la demo:

- Coche 3D interactivo (React Three Fiber) que reacciona a las decisiones
  del agente: ambiente LED, posición de asientos, despliegue de mesa,
  proyecciones panorámicas en las ventanas.
- Panel izquierdo — botón Call / Hang para abrir la conversación de voz con
  Gemini Live API. Latencia conversacional ≈ 600 ms; barge-in real (cortar
  a Sally se nota).
- Panel derecho — sliders para simular el wearable (FC, sueño, estrés,
  pasos, batería social) y los sensores del coche (combustible, temperatura
  exterior, ubicación). Mover los sliders dispara reacciones inmediatas en
  Sally.

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + Vite)                              │
│                                                                              │
│   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐    │
│   │  CarScene3D    │  │  SallyPanel    │  │  WearablePanel +           │    │
│   │  (R3F + Drei)  │  │  Call / Hang + │  │  SensorsPanel (sliders)    │    │
│   │                │  │  waveform      │  │                            │    │
│   └───────┬────────┘  └────────┬───────┘  └────────┬───────────────────┘    │
│           │                    │                   │                         │
│           ▼                    ▼                   ▼                         │
│   ┌───────────────┐    ┌────────────────┐   ┌──────────────────────────┐    │
│   │ useVehicleStore│    │ useSallyLive    │   │ /sensors/state HTTP      │    │
│   │ (zustand)     │    │ (audio worklet) │   │ /wearable/state HTTP     │    │
│   └───────────────┘    └────────┬────────┘   └──────────────────────────┘    │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                  WS /ws (SET_*, ECOSYSTEM_UPDATE)     WS /ws/sally (audio PCM)
                                  │                                  │
┌─────────────────────────────────┼──────────────────────────────────┼─────────┐
│                          BACKEND (FastAPI)                         ▼         │
│                                  │                                            │
│   ┌─────────────────┐   ┌────────▼─────────┐   ┌────────────────────────┐    │
│   │ ConnectionMgr   │◄──┤ websocket /ws    │   │  websocket /ws/sally   │    │
│   │ broadcast SET_* │   └──────────────────┘   │  (PCM bidireccional)   │    │
│   └────────┬────────┘                          └───────────┬────────────┘    │
│            │                                               ▼                  │
│            │                                  ┌─────────────────────────┐    │
│            │                                  │   SallyLiveAgent        │    │
│            │                                  │   ─ Gemini Live API     │    │
│            │                                  │   ─ voz Kore (24 kHz)   │    │
│            │                                  │   ─ 17 tools LangChain  │    │
│            │                                  │   ─ system prompt CUPRA │    │
│            ▼                                  └─────────┬───────────────┘    │
│   ┌───────────────────────────────────────────┐         │                    │
│   │  shared_state.live_state (dict global)    │◄────────┘ inject_context()   │
│   └───────────────┬───────────────────────────┘                              │
│                   ▲ writes                                                   │
│   ┌───────────────┴────────────────────────────────────────────────────┐    │
│   │  Polling loops (asyncio.create_task en lifespan)                   │    │
│   │   ─ _polling_loop       cada 15 s   → inject_context(state)        │    │
│   │   ─ _calendar_loop      cada 3 min  → ecosystem/calendar.py        │    │
│   │   ─ _spotify_loop       cada 30 s   → ecosystem/spotify.py         │    │
│   │   ─ _gmail_loop         cada 3 min  → ecosystem/gmail.py           │    │
│   │   ─ _wearable_ws_task   reactivo    → ecosystem/wearable.py        │    │
│   │   ─ _sensors_ws_task    reactivo    → ecosystem/sensors.py         │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   En producción (single-container Cloud Run) los simuladores se montan       │
│   como sub-apps: /sensors → simulators.sensors  /wearable → simulators.wear  │
└──────────────────────────────────────────────────────────────────────────────┘
                                  ▲              ▲
                  WS push reactivo │              │ WS push reactivo
                                  │              │
                       ┌──────────┴───┐    ┌─────┴────────────┐
                       │  WEARABLE    │    │  SENSORS         │
                       │  Simulator   │    │  Simulator       │
                       │  (FastAPI)   │    │  (FastAPI)       │
                       └──────────────┘    └──────────────────┘
```

### Pieza única de inteligencia

Hay **un único agente**, `SallyLiveAgent` (`backend/src/sally/live_bridge.py`),
que mantiene la sesión Gemini Live activa mientras el conductor habla. Los
polling loops no toman decisiones — sólo le inyectan al agente snapshots
del estado del coche (`inject_context`) o triggers reactivos urgentes
(`inject_system_message`). Gemini decide qué tools llamar y cuándo hablar.

### Capa de tools

LangChain `@tool` se usa **sólo como definición** — los esquemas Pydantic
se convierten a `FunctionDeclaration` de Gemini en `_lc_tools_to_genai()`.
17 tools en total:

| Categoría | Tools | Cuándo se usan |
|---|---|---|
| **Cabina — modos intrínsecos** (1) | `set_interior_mode` | Capa principal. Sally propone uno de los 4 modos (`conduccion`, `reunion`, `relax`, `amics`) y aplica un preset completo del habitáculo. |
| **Cabina — ajustes puntuales** (10) | `set_steering_wheel`, `set_seat_*` (×4), `set_table`, `set_inside_light`, `set_cabin_temperature`, `set_window_projection`, `set_fuel_level` | Sólo cuando el conductor lo pide ("esconde la mesa", "luz ámbar al 60"). |
| **Gmail** (2) | `gmail_search`, `gmail_send` | Búsqueda y envío real. |
| **Calendar** (1) | `calendar_list_upcoming` | Refresh manual de la agenda. |
| **Spotify** (5) | `spotify_now_playing`, `spotify_play`, `spotify_pause`, `spotify_resume`, `spotify_skip` | Lectura + control activo. |

---

## Stack

| Capa | Tecnologías |
|---|---|
| Frontend | React 18, Vite 5, Three.js + @react-three/fiber + drei + postprocessing, Zustand, @ricky0123/vad-web |
| Backend | Python 3.12, FastAPI 0.115, uvicorn[standard], google-genai (Gemini Live), langchain-core, websockets, httpx |
| Servicios externos | Google AI Studio (Gemini 3.1 Flash Live), Google Calendar API, Gmail API, Spotify Web API |
| Infra dev | Docker Compose (4 servicios) |
| Infra prod | Google Cloud Run, contenedor único |

---

## Estructura del repo

```
cupra_challenge/
├── README.md                      ← este fichero
├── DEPLOY.md                      ← cómo desplegar a Cloud Run
├── Dockerfile                     ← imagen all-in-one para producción
├── docker-compose.yml             ← orquestación dev (4 servicios)
├── docker-compose.dev.yml         ← override con hot-reload
├── .env.example                   ← plantilla de variables (ninguna sensible)
│
├── frontend/                      ← React + Vite
│   ├── README.md
│   ├── Dockerfile                 ← build dev (vite dev) + stage producción (nginx)
│   ├── public/
│   │   ├── audio-capture-worklet.js   ← AudioWorklet PCM 16 kHz
│   │   ├── models/*.glb               ← carrocería, asientos, dashboard, mesa
│   │   └── projections/*.mp4          ← vídeos de las ventanas
│   └── src/
│       ├── App.jsx                ← layout y router de mensajes WS
│       ├── components/
│       │   ├── CarScene3D/        ← escena R3F (canvas, luz, post-procesado)
│       │   ├── SallyPanel/        ← Call / Hang + waveform
│       │   ├── WearablePanel/     ← sliders biométricos
│       │   ├── SensorsPanel/      ← sliders del coche
│       │   ├── EcosystemBar/      ← barra inferior con resumen
│       │   └── DevPanel/          ← atajos de prueba
│       ├── hooks/
│       │   ├── useSallyLive.js    ← captura mic 16 kHz + playback 24 kHz + VAD
│       │   └── useWebSocket.js    ← reconexión con backoff exponencial
│       ├── services/
│       │   ├── origin.js          ← resolución de URL dev vs prod
│       │   ├── wsClient.js        ← /ws (ecosistema)
│       │   ├── sallyLiveClient.js ← /ws/sally (audio binario)
│       │   ├── sensorsClient.js   ← REST /sensors
│       │   └── wearableClient.js  ← REST /wearable
│       └── store/                 ← zustand (vehicle, ecosystem, sally)
│
├── backend/                       ← FastAPI
│   ├── README.md
│   ├── Dockerfile                 ← imagen dev con hot reload
│   ├── requirements.txt
│   └── src/
│       ├── main.py                ← entrypoint, polling loops, endpoints WS
│       ├── shared_state.py        ← dict global compartido entre tools y polling
│       ├── config/
│       │   ├── env.py
│       │   └── logger.py
│       ├── sally/
│       │   ├── live_bridge.py     ← SallyLiveAgent (Gemini Live)
│       │   ├── tools.py           ← 17 tools LangChain
│       │   └── live_prompt.py     ← system prompt completo
│       ├── ecosystem/
│       │   ├── calendar.py        ← Google Calendar
│       │   ├── gmail.py           ← Gmail snapshot
│       │   ├── spotify.py         ← Spotify Web API
│       │   ├── sensors.py         ← suscriptor WS al simulador sensors
│       │   └── wearable.py        ← suscriptor WS al simulador wearable
│       └── websocket/
│           └── manager.py         ← lista de conexiones + broadcast
│
├── sensors/                       ← simulador FastAPI (combustible, temp, ubicación)
│   ├── README.md
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
│
├── wearable/                      ← simulador FastAPI (FC, sueño, estrés…)
│   ├── README.md
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py
│
└── auth_scripts/                  ← scripts auxiliares para obtener refresh tokens
    ├── auth_google.py
    └── auth_spoty.py
```

Cada subdirectorio tiene su propio README con detalles internos.

---

## Setup local

### Requisitos

- Docker Desktop corriendo.
- Una `GOOGLE_API_KEY` de [Google AI Studio](https://aistudio.google.com/apikey).
- Opcional: credenciales OAuth de Google (Calendar/Gmail) y Spotify si quieres
  probar los conectores reales. Ver [`auth_scripts/`](auth_scripts/) para
  obtenerlas. Si no las pones, esos conectores se desactivan y el resto sigue
  funcionando.

### Pasos

```powershell
# 1. Clonar
git clone https://github.com/<tu-usuario>/cupra_challenge.git
cd cupra_challenge

# 2. Variables de entorno
cp .env.example .env
# Edita .env y rellena al menos GOOGLE_API_KEY=…

# 3. Levantar todo
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Servicios accesibles:

| Servicio  | URL                       |
|-----------|---------------------------|
| Frontend  | http://localhost:5173     |
| Backend   | http://localhost:3001     |
| Wearable  | http://localhost:3002     |
| Sensors   | http://localhost:3003     |

> El frontend tiene hot-reload (Vite). El backend recarga al guardar
> cualquier `.py` en `backend/src/`.

### Comandos útiles

```powershell
# Logs de un solo servicio
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f backend

# Reconstruir un servicio
docker compose -f docker-compose.yml -f docker-compose.dev.yml build backend

# Parar todo
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

---

## Despliegue

Producción corre como **un único contenedor en Cloud Run** (frontend
empaquetado en `/`, backend en `/ws` y `/ws/sally`, simuladores en
`/sensors` y `/wearable`). Esto da una sola URL pública para mandar al
jurado, sin coordinar CORS ni varios servicios.

Comando exacto y consideraciones de presupuesto en [DEPLOY.md](DEPLOY.md).

---

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `GOOGLE_API_KEY` | ✅ | Clave de AI Studio (Gemini Live). |
| `GOOGLE_LIVE_MODEL` | ✗ | Default `gemini-3.1-flash-live-preview`. |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | ✗ | OAuth para Calendar + Gmail. Si falta cualquiera, los dos se desactivan. |
| `GMAIL_REFRESH_TOKEN` | ✗ | Token específico para Gmail (si difiere del de Calendar). |
| `SPOTIFY_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | ✗ | Spotify Web API. Si falta, los 5 tools de Spotify se desactivan. |
| `BACKEND_PORT`, `FRONTEND_PORT`, `WEARABLE_PORT`, `SENSORS_PORT` | ✗ | Sólo para dev local. |
| `WEARABLE_WS_URL`, `SENSORS_WS_URL` | ✗ | Inyectadas por compose; en Cloud Run apuntan a localhost. |
| `LOG_LEVEL` | ✗ | `INFO` por defecto. |

Plantilla en [`.env.example`](.env.example).

---

## Mensajes WebSocket

### `/ws` — canal del ecosistema

**Backend → frontend**

| Tipo | Payload | Significado |
|---|---|---|
| `CONNECTED` | `{ msg }` | Handshake inicial. |
| `ECOSYSTEM_UPDATE` | snapshot de `live_state` | Snapshot completo del ecosistema. Cada tick periódico o evento reactivo. |
| `SET_INTERIOR_MODE` | `{ mode }` | Activar uno de los 4 modos (preset completo). |
| `SET_INSIDE_LIGHT` | `{ color, intensity }` | Color del LED ambiente. |
| `SET_STEERING_WHEEL` | `{ position }` | `extend` / `retract`. |
| `SET_SEAT_DRIVER` / `SET_SEAT_PASSENGER` / `SET_SEAT_REAR_LEFT` / `SET_SEAT_REAR_RIGHT` | `{ position }` | `normal` / `reclined` / `rotated`. |
| `SET_TABLE_OPEN` | `{ open }` | Mesa plegable. |
| `SET_CABIN_TEMPERATURE` | `{ degrees }` | 16–26 °C. |
| `SET_WINDOW_PROJECTION` | `{ window, preset }` | Vídeo en una ventana. |
| `SET_FUEL_LEVEL` | `{ percent }` | Lectura simulada de batería. |

El frontend no envía nada por `/ws` — sólo escucha. La voz va por
`/ws/sally`, los sliders por REST.

### `/ws/sally` — bridge de audio Gemini Live

**Frontend → backend**

| Forma | Contenido | Significado |
|---|---|---|
| binary | PCM Int16 LE 16 kHz mono | Trozos de 100 ms del micrófono. |
| `SESSION_START` | `{ session_id }` | Abre la sesión Live. |
| `INTERRUPT` | – | Barge-in detectado por VAD local. |
| `SESSION_END` | – | Cuelga. |

**Backend → frontend**

| Forma | Contenido |
|---|---|
| binary | PCM Int16 LE 24 kHz mono — voz Kore. |
| `LIVE_READY` | Sesión abierta. |
| `LIVE_STATE` | `{ state: idle\|connecting\|listening\|processing\|speaking }`. |
| `SET_*` | Igual que en `/ws` (también se envían aquí para no depender del orden). |
| `LIVE_ERROR` | `{ msg }`. |

---

## Seguridad

Antes de subir o compartir el repo, comprobar que:

1. `.env` está en `.gitignore` (ya lo está).
2. Las credenciales OAuth (`*.json` de Google) están **fuera** del repo. El
   repo no las necesita para correr — se generan con `auth_scripts/` y se
   ponen en `.env`.
3. `.cache` (token de Spotify dejado por `spotipy`) está en `.gitignore`.
4. Ninguna API key aparece hardcodeada — `grep -r "AIza" .` debe devolver
   sólo `.env` (que está ignorado).

El despliegue inyecta `GOOGLE_API_KEY` con `--set-env-vars` (no se imprime
en logs ni se persiste en la imagen).

---

## Roadmap / ideas pendientes

- Detección de hablante (¿conduce o copiloto?) para personalizar tono.
- Multi-zona climática (front/rear independientes).
- Integración con asistencia de conducción real (mock por ahora).
- Voz personalizable por conductor (clonado breve).

---

## Licencia

Pendiente de definir con CUPRA.

## Autora

Pau Sala — concurso CUPRA Challenge 2026.
