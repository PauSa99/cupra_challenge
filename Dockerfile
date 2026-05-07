# Dockerfile — imagen all-in-one de producción para Cloud Run.
# Empaqueta el build estático del frontend, el backend FastAPI y los dos
# simuladores (sensors + wearable, montados como sub-apps de FastAPI) dentro
# de un único contenedor. Toda la app responde desde una sola URL.
#
# Para desarrollo local seguir usando docker-compose con backend/Dockerfile.

# ── Stage 1: build del frontend ───────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /web

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# ── Stage 2: imagen final con Python + backend + simuladores + dist/ ──────────
FROM python:3.12-slim AS production

WORKDIR /app

# requirements del backend ya cubren los del wearable + sensors (mismo fastapi/uvicorn)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Código del backend
COPY backend/src/ /app/src/

# Empaquetar sensors/main.py y wearable/main.py como subpaquete `simulators`
# (que main.py importa con `from simulators.sensors import app as sensors_app`)
RUN mkdir -p /app/src/simulators && touch /app/src/simulators/__init__.py
COPY sensors/main.py /app/src/simulators/sensors.py
COPY wearable/main.py /app/src/simulators/wearable.py

# Build estático del frontend producido en el stage 1
COPY --from=frontend-build /web/dist /app/static

ENV PYTHONPATH=/app/src
ENV ENV=production

# Cloud Run inyecta $PORT (8080 por defecto). Construimos las URLs de los
# simuladores en runtime para que apunten a este mismo proceso, sea cual sea
# el puerto asignado.
EXPOSE 8080

CMD ["sh", "-c", "export WEARABLE_WS_URL=${WEARABLE_WS_URL:-ws://localhost:${PORT:-8080}/wearable/ws}; export SENSORS_WS_URL=${SENSORS_WS_URL:-ws://localhost:${PORT:-8080}/sensors/ws}; exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
