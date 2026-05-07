# SALLY · Wearable Simulator

Simulador minimalista del wearable biométrico del conductor (frecuencia
cardíaca, sueño, estrés, pasos, batería social). Sirve dos roles:

1. **Fuente de datos para el backend** — el conector
   `backend/src/ecosystem/wearable.py` se suscribe vía WebSocket y recibe
   actualizaciones cada vez que cambia el estado.
2. **Backend para el `WearablePanel` del frontend** — sliders de la UI
   hacen `POST /state` para inyectar nuevas lecturas.

> Para el contexto general, ver el [README raíz](../README.md).

---

## Estado simulado

```python
{
    "heartRate":     75,   # BPM   (40 – 180)
    "sleepHours":    7.5,  # h     (0.0 – 12.0)
    "stressLevel":   3,    # /10   (1 – 10)
    "steps":         2500, # pasos (0 – 20 000)
    "socialBattery": 50,   # %     (0 – 100) — energía social del conductor
}
```

`socialBattery` es la métrica más característica de SALLY: cuando cruza
el 75 % al alza, el backend dispara un trigger reactivo `social_high`
para que el agente proponga modo `amics` y un plan cerca de la `location`
actual.

---

## Endpoints

| Método | Path | Descripción |
|---|---|---|
| `GET`  | `/health` | Liveness (`{"status":"ok","service":"sally-wearable"}`). |
| `GET`  | `/state`  | Snapshot completo. |
| `POST` | `/state`  | Update parcial (cualquier subset de campos). Difunde el nuevo estado a todos los clientes WS. |
| `WS`   | `/ws`     | Push channel. Envía el estado actual al conectar y cada update posterior. |

### Body del `POST /state`

```json
{
  "heartRate": 105,
  "stressLevel": 8,
  "socialBattery": 80
}
```

Todos los campos son opcionales. Sólo los presentes se actualizan.

### Mensaje `WS /ws`

```json
{
  "type": "STATE",
  "payload": { "heartRate": 105, "stressLevel": 8, "socialBattery": 80, ... }
}
```

---

## Triggers reactivos en el backend

Estos cambios disparan inyecciones inmediatas en la sesión Live (no
esperan al polling de 15 s):

| Cruce | Trigger emitido |
|---|---|
| `stressLevel` cruza 7 al alza | `stress_spike` |
| `heartRate` cruza 100 al alza | `heart_rate_spike` |
| `socialBattery` cruza 75 al alza | `social_high` |

Ver `backend/src/main.py::_make_wearable_callback` para los detalles.

---

## Despliegue

### Standalone (compose dev)

Levantado por `docker-compose.yml` como servicio independiente en el
puerto 3002. El backend lo encuentra con `WEARABLE_WS_URL=ws://wearable:3002/ws`.

### Embebido (Cloud Run prod)

En la imagen all-in-one, `wearable/main.py` se copia a
`backend/src/simulators/wearable.py` y `backend/src/main.py` lo monta como
sub-app:

```python
app.mount("/wearable", wearable_app)
```

De cara al exterior pasa a vivir en:

| antes (compose) | después (Cloud Run) |
|---|---|
| `http://wearable:3002/state` | `https://<host>/wearable/state` |
| `ws://wearable:3002/ws`      | `wss://<host>/wearable/ws`      |

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `WEARABLE_PORT` | 3002 | Sólo en standalone. En sub-app heredan el `$PORT` del backend. |

---

## Cómo arrancar suelto

```powershell
cd wearable
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3002 --reload
```
