# Despliegue en Cloud Run

Toda la aplicación (frontend + backend + simuladores) corre en **un único
servicio de Cloud Run**. El jurado recibe una sola URL.

## Requisitos previos

1. `gcloud` CLI instalado y autenticado (`gcloud auth login`).
2. Proyecto GCP seleccionado:
   ```powershell
   gcloud config set project cuprachallenge2026-494522
   ```
3. APIs habilitadas (sólo la primera vez):
   ```powershell
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
   ```
4. Tu `GOOGLE_API_KEY` de AI Studio a mano (no se sube al repo, se pasa
   como variable de entorno al servicio).

## Comando de despliegue

Desde la raíz del repo:

```powershell
gcloud run deploy sally `
  --source . `
  --region europe-southwest1 `
  --allow-unauthenticated `
  --memory 1Gi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 2 `
  --timeout 3600 `
  --concurrency 10 `
  --set-env-vars "GOOGLE_API_KEY=TU_CLAVE_AQUI,GOOGLE_LIVE_MODEL=gemini-3.1-flash-live-preview"
```

`--source .` hace que Cloud Build use el `Dockerfile` de la raíz, que ya
empaqueta todo en una imagen.

Al terminar, `gcloud` imprime la URL pública (algo como
`https://sally-xxxxxxxxxx-no.a.run.app`). **Esa es la URL para el jurado.**

## Flags explicados

| Flag | Por qué |
|------|---------|
| `--region europe-southwest1` | Madrid → latencia baja para evaluadores en España. |
| `--allow-unauthenticated` | El jurado entra desde el navegador sin credenciales GCP. |
| `--memory 1Gi --cpu 1` | Suficiente para FastAPI + sesión Live de Gemini. |
| `--min-instances 0` | Escala a cero cuando nadie testea → no se factura inactividad. |
| `--max-instances 2` | Tope para que no se descontrole el gasto. |
| `--timeout 3600` | Máximo de Cloud Run (60 min) — necesario para sesiones largas de voz. |
| `--concurrency 10` | Cada conexión Live consume bastante CPU; mejor no saturar una instancia. |

## Variables de entorno

Sólo se necesita una para que SALLY funcione:

- `GOOGLE_API_KEY` — clave de AI Studio (Gemini Live).
- `GOOGLE_LIVE_MODEL` — opcional, default `gemini-3.1-flash-live-preview`.

Las claves de Spotify y Google Calendar/Gmail **no se incluyen a propósito**:
los conectores correspondientes se desactivan automáticamente si las env vars
no están presentes (`backend/src/config/env.py`).

## Comprobaciones post-deploy

```powershell
# Logs en streaming
gcloud run services logs tail sally --region europe-southwest1

# Health check
curl https://TU-URL.run.app/health
```

Esperado: `{"status":"ok","service":"sally-backend"}`.

## Control de coste

El gran consumidor del presupuesto es **Gemini Live API**, no Cloud Run.
Crea una alerta de facturación:

```powershell
gcloud beta billing budgets create `
  --billing-account=$(gcloud beta billing accounts list --format="value(name)" --limit=1) `
  --display-name="SALLY 50€" `
  --budget-amount=50EUR `
  --threshold-rule=percent=50 `
  --threshold-rule=percent=90
```

Si quieres pararlo todo en cualquier momento sin perder el deploy:

```powershell
gcloud run services update sally --region europe-southwest1 --max-instances 0
```

Reactivar:

```powershell
gcloud run services update sally --region europe-southwest1 --max-instances 2
```
