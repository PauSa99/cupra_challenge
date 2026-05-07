# backend/Dockerfile

FROM python:3.12-slim AS development

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Añade src/ al path para que los imports internos funcionen sin prefijo
ENV PYTHONPATH=/app/src

EXPOSE 3001

# uvicorn encuentra main.py a través de PYTHONPATH
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${BACKEND_PORT:-3001} --reload --reload-dir /app/src"]
