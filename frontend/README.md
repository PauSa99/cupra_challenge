# SALLY · Frontend

UI del agente: una escena 3D del CUPRA Born en React Three Fiber, un panel
de voz para hablar con Sally por Gemini Live, y dos paneles laterales para
inyectar lecturas del wearable y los sensores.

> Para una visión global del proyecto y la arquitectura completa, ver el
> [README raíz](../README.md).

---

## Stack

| Capa | Librería | Para qué |
|---|---|---|
| Framework | React 18 + Vite 5 | SPA con HMR. |
| 3D | three 0.168 + @react-three/fiber 8 + drei + postprocessing | Escena del coche, materiales PBR, HDRI, bloom, vignette. |
| Estado | zustand 4 | 3 stores: vehicle / ecosystem / sally. |
| Audio | Web Audio API + AudioWorklet + @ricky0123/vad-web | Captura mic 16 kHz, playback 24 kHz, VAD para barge-in. |
| WS | nativo | `WebSocket` directo, sin librería. |

Cero TypeScript a propósito — el proyecto es un demo veloz.

---

## Estructura

```
frontend/
├── Dockerfile               ← stage development (vite dev) + production (nginx)
├── index.html
├── package.json
├── vite.config.js
├── public/
│   ├── audio-capture-worklet.js     ← AudioWorklet: Float32 → Int16 PCM, 100 ms
│   ├── models/
│   │   ├── car_shell.glb            ← carrocería X-ray (no tocar)
│   │   ├── seat.glb                 ← asiento individual (×4)
│   │   ├── interior_car.glb         ← interior del habitáculo
│   │   ├── car_dashboard.glb        ← dashboard
│   │   ├── steering_wheel.glb
│   │   ├── foldable_table.glb
│   │   └── full_screen.glb
│   └── projections/
│       ├── mountains.mp4            ← ventanas: AMICS
│       ├── sunset.mp4               ← ventanas: RELAX
│       ├── presentacio.mp4          ← ventanas: REUNION
│       └── tablet_image.jpg
└── src/
    ├── main.jsx                ← entry: createRoot
    ├── App.jsx                 ← layout + router de mensajes WS /ws
    ├── App.css / index.css
    ├── components/
    │   ├── CarScene3D/         ← escena R3F (canvas + post-procesado)
    │   ├── SallyPanel/         ← Call/Hang + waveform
    │   ├── WearablePanel/      ← sliders biométricos
    │   ├── SensorsPanel/       ← sliders del coche
    │   ├── EcosystemBar/       ← barra inferior de resumen
    │   └── DevPanel/           ← atajos para forzar acciones (debug)
    ├── hooks/
    │   ├── useSallyLive.js     ← orquesta toda la sesión Live (audio + WS)
    │   └── useWebSocket.js     ← reconexión con backoff exponencial
    ├── services/
    │   ├── origin.js           ← resolución de URL (dev → localhost, prod → window.location)
    │   ├── wsClient.js         ← /ws (ecosistema)
    │   ├── sallyLiveClient.js  ← /ws/sally (binario PCM + JSON)
    │   ├── sensorsClient.js    ← REST /sensors (GET/POST /state)
    │   └── wearableClient.js   ← REST /wearable (GET/POST /state)
    └── store/
        ├── useVehicleStore.js   ← estado de la cabina + INTERIOR_MODES
        ├── useEcosystemStore.js ← snapshot de calendar, gmail, sensors, wearable, spotify
        └── useSallyStore.js     ← estado de la sesión Live + log de Sally
```

---

## Escena 3D (`components/CarScene3D/`)

```
CarScene3D/
├── index.jsx              ← Canvas + OrbitControls + Environment + EffectComposer
├── SceneCamera.jsx        ← cámara con presets (OVERVIEW / INTERIOR / DRIVER / REAR)
├── SallyLighting.jsx      ← luces direccionales y de relleno
├── InteriorScene.jsx      ← compone todos los overlays reactivos
├── CarBody.jsx            ← carrocería X-ray (geometría exterior)
├── Dashboard.jsx          ← consola de instrumentos
├── SteeringWheel.jsx      ← volante con animación extend/retract
├── Seats.jsx              ← 4 asientos con spring physics (rotación, reclinación, xOffset, zPos)
├── FoldableTable.jsx      ← mesa que se despliega y crece según preset
├── AmbientStrips.jsx      ← bandas LED ambiente (color y emisión)
├── WindowProjections.jsx  ← vídeo plano sobre cada ventana
├── constants.js           ← stiffness/damping de springs, escalas
├── materials.js           ← materiales PBR reutilizables
└── utils.js               ← helpers de transformación
```

Configuración del Canvas:

- `dpr={[1, 1.5]}` — limita pixel ratio para no quemar GPU en pantallas 4K.
- `toneMapping=4` (`ACESFilmicToneMapping`) y exposure `1.1` para look
  cinemático suave.
- HDRI `warehouse` de drei como fondo de luz indirecta.
- `EffectComposer` con `Bloom` (mipmapBlur, threshold 0.45) y `Vignette`
  (offset 0.18, oscuridad 0.65) para sensación premium.
- `ContactShadows` falso bajo el coche para anclarlo visualmente sin
  necesidad de raytracing.

Los GLB en `public/models/` son la fuente de verdad de la geometría.
**`car_shell.glb` no se toca.** El interior se modifica vía spring physics
en el componente `Seats3D`/`FoldableTable`/`SteeringWheel` reaccionando al
estado de Zustand.

---

## Stores (Zustand)

### `useVehicleStore` — estado de la cabina

Define los 4 modos intrínsecos como objetos completos:

```js
INTERIOR_MODES = {
  MODO_CONDUCCION: { steering, seatDriver, ..., ambientColor: 'blue', windows: ALL_OFF },
  MODO_REUNION:    { steering: 'retract', seats rotados, mesa abierta grande, verde, PRESENTACIO },
  MODO_RELAX:      { reclinado, ámbar, SUNSET },
  MODO_AMICS:      { asientos en círculo, mesa abierta, rojo, MOUNTAINS },
}
```

`setInteriorMode('reunion')` aplica el preset entero. Cada setter individual
(`setAmbientLight`, `setSeatDriver`, …) marca `activeMode: null` para
indicar que la cabina ya no encaja con un modo "puro".

`SEAT_PRESETS`:

| Preset | rotación | reclinación | descripción |
|---|---|---|---|
| `normal` | 0 | 0 | postura de conducción |
| `reclined` | 0 | -0.32 | echado hacia atrás |
| `rotated` | π | 0 | mirando atrás |

### `useEcosystemStore`

Recibe `ECOSYSTEM_UPDATE` (snapshot completo de `live_state` del backend) y
expone los campos para los paneles laterales y la `EcosystemBar`.

### `useSallyStore`

Estado de la sesión Live: `liveSessionState`
(`idle | connecting | listening | processing | speaking`), `liveConnected`,
log de mensajes de Sally.

---

## Audio bidireccional (`hooks/useSallyLive.js`)

El hook orquesta toda la sesión Live. Esquema:

```
            ┌─────────────────────────────────────────────────────────┐
            │                       useSallyLive                      │
            │                                                         │
            │   Captura (16 kHz):                                     │
            │     getUserMedia → AudioContext(16000) →                │
            │     MediaStreamSource → AudioWorklet(pcm-capture-       │
            │     processor) → Int16 PCM 100 ms → sendBinary()        │
            │                                                         │
            │   VAD paralelo (en el mismo stream):                    │
            │     @ricky0123/vad-web → onSpeechStart →                │
            │     si Sally hablaba: cancelPlayback() + INTERRUPT      │
            │                                                         │
            │   Playback (24 kHz):                                    │
            │     onmessage(binary) → Int16Array → AudioBufferSource  │
            │     scheduled gapless con LOOKAHEAD=100ms               │
            │                                                         │
            │   Mensajes JSON:                                        │
            │     LIVE_READY / LIVE_STATE / SET_* / LIVE_ERROR        │
            └─────────────────────────────────────────────────────────┘
```

- **¿Por qué dos `AudioContext`?** El input de Gemini Live es 16 kHz y el
  output es 24 kHz. Web Audio no permite mezclar sample rates en un mismo
  contexto.
- **AudioWorklet**, no `ScriptProcessorNode` — éste último está deprecated
  y mete latencia variable.
- **Gapless playback**: cada chunk PCM se programa con `source.start(at)`
  y `at` se mantiene en `scheduledUntilRef.current`, así no hay clicks
  entre buffers consecutivos.
- **Barge-in**: el VAD local detecta voz humana al instante; cuando Sally
  estaba hablando, paramos los `BufferSource` y mandamos `INTERRUPT` por
  el WS. El servidor también tiene su propio VAD (Gemini end-of-speech),
  así que el barge-in funciona aunque el local no llegue a tiempo.

---

## Resolución de URL (`services/origin.js`)

Single source of truth para "dónde está cada servicio". Lógica:

```js
const isDev = import.meta.env.DEV;

httpBase(prodPath, devUrl) → isDev ? devUrl : `${origin}${prodPath}`;
wsBase  (prodPath, devUrl) → isDev ? devUrl : `${ws|wss}://${host}${prodPath}`;
```

| Cliente | dev | producción |
|---|---|---|
| `wsClient` | `ws://localhost:3001/ws` | `wss://<host>/ws` |
| `sallyLiveClient` | `ws://localhost:3001/ws/sally` | `wss://<host>/ws/sally` |
| `sensorsClient` | `http://localhost:3003` | `https://<host>/sensors` |
| `wearableClient` | `http://localhost:3002` | `https://<host>/wearable` |
| `SensorsPanel` WS | `ws://localhost:3003/ws` | `wss://<host>/sensors/ws` |
| `WearablePanel` WS | `ws://localhost:3002/ws` | `wss://<host>/wearable/ws` |

Esto permite que el **mismo build** funcione en localhost y en Cloud Run
sin variables de entorno por entorno.

---

## Variables de entorno (Vite)

Todas opcionales. Si no se ponen, `origin.js` calcula la URL automáticamente.

| Variable | Descripción |
|---|---|
| `VITE_WS_URL` | URL completa del WS de ecosistema. |
| `VITE_WS_SALLY_URL` | URL completa del WS de audio. |
| `VITE_SENSORS_API_URL` | Base HTTP del simulador de sensores. |
| `VITE_WEARABLE_API_URL` | Base HTTP del simulador de wearable. |
| `VITE_SENSORS_WS_URL` | WS del simulador de sensores. |
| `VITE_WEARABLE_WS_URL` | WS del simulador de wearable. |
| `FRONTEND_PORT` | Puerto del dev server (default `5173`). |

Prefijo `VITE_` obligatorio para que Vite las exponga en el bundle.

---

## Comandos

```powershell
# Dependencias
cd frontend
npm install

# Dev server (HMR)
npm run dev

# Build estático (a /dist)
npm run build

# Preview del build
npm run preview
```

En producción, el `Dockerfile` raíz del repo construye el bundle y lo
copia a `/app/static/` dentro del contenedor del backend, que lo sirve
desde `/`.

---

## Mensajes WS recibidos (`App.jsx`)

`App.jsx` es el router central de mensajes del backend. Los procesa en un
`switch` y dispara los setters de los stores correspondientes:

| Mensaje | Acción |
|---|---|
| `CONNECTED` | `setConnected(true)`, log "Sally online". |
| `SET_INTERIOR_MODE` | `setInteriorMode(MODO_<MODE>)`. Aplica preset completo. |
| `SET_INSIDE_LIGHT` | `setAmbientLight(color)`. |
| `SET_STEERING_WHEEL` | `setSteering(position)`. |
| `SET_SEAT_*` | Cada uno actualiza el asiento correspondiente desde `SEAT_PRESETS`. |
| `SET_TABLE_OPEN` | `setTableOpen(bool)`. |
| `SET_CABIN_TEMPERATURE` | `setTemperature(degrees)`. |
| `SET_WINDOW_PROJECTION` | `setWindowPreset(window, preset)`. Si `window=all`, todas. |
| `SET_FUEL_LEVEL` | `updateEcosystem({ fuelLevel })`. |
| `ECOSYSTEM_UPDATE` | `updateEcosystem(snapshot completo)`. |
| `SALLY_*` (legacy) | Compatibilidad con `applySallyAction` antiguo. |

Los mensajes de `/ws/sally` los procesa directamente `useSallyLive.js`,
no pasan por `App.jsx`.
