# SALLY · Sensors Simulator

Simulador minimalista de los sensores del coche (combustible/batería,
temperatura exterior, ubicación). Sirve dos roles:

1. **Fuente de datos para el backend** — el conector
   `backend/src/ecosystem/sensors.py` se suscribe vía WebSocket y recibe
   actualizaciones cada vez que cambia el estado.
2. **Backend para el `SensorsPanel` del frontend** — sliders de la UI
   hacen `POST /state` para inyectar nuevas lecturas.

> Para el contexto general, ver el [README raíz](../README.md).

---

## Estado simulado

```python
{
    "fuelLevel":   60,    # %     (0 – 100) — combustible o batería
    "temperature": 20,    # °C    (-10 – 45) — exterior
    "location":    "",    # texto libre — barrio o ciudad
}
```

Los rangos los enforzan los `min/max` de los sliders en
`frontend/src/components/SensorsPanel/index.jsx`. El backend del
simulador sólo guarda lo que llega.

---

## Endpoints

| Método | Path | Descripción |
|---|---|---|
| `GET`  | `/health` | Liveness (`{"status":"ok","service":"sally-sensors"}`). |
| `GET`  | `/state`  | Snapshot completo. |
| `POST` | `/state`  | Update parcial (cualquier subset de campos). Difunde el nuevo estado a todos los clientes WS. |
| `WS`   | `/ws`     | Push channel. Envía el estado actual al conectar y cada update posterior. |

### Body del `POST /state`

```json
{
  "fuelLevel": 22,
  "temperature": 8,
  "location": "Barcelona"
}
```

Todos los campos son opcionales. Sólo los presentes se actualizan.

### Mensaje `WS /ws`

```json
{
  "type": "STATE",
  "payload": { "fuelLevel": 22, "temperature": 8, "location": "Barcelona" }
}
```

---

## Despliegue

### Standalone (compose dev)

Levantado por `docker-compose.yml` como servicio independiente en el
puerto 3003. El backend lo encuentra con `SENSORS_WS_URL=ws://sensors:3003/ws`.

### Embebido (Cloud Run prod)

En la imagen all-in-one, `sensors/main.py` se copia a
`backend/src/simulators/sensors.py` y `backend/src/main.py` lo monta como
sub-app:

```python
app.mount("/sensors", sensors_app)
```

De cara al exterior pasa a vivir en:

| antes (compose) | después (Cloud Run) |
|---|---|
| `http://sensors:3003/state` | `https://<host>/sensors/state` |
| `ws://sensors:3003/ws`      | `wss://<host>/sensors/ws`      |

---

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `SENSORS_PORT` | 3003 | Sólo en standalone. En sub-app heredan el `$PORT` del backend. |

---

## Cómo arrancar suelto

```powershell
cd sensors
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3003 --reload
```
