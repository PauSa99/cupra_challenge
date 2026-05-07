// Resolución de URLs de servicios según entorno.
//
// En `vite dev` (DEV=true) cada simulador vive en su propio puerto local
// (Docker Compose o uvicorn manual). En el build de producción todo cuelga
// del mismo origen — el backend de Cloud Run sirve frontend, /ws, /ws/sally,
// /sensors/* y /wearable/* desde la misma URL.

const isDev = import.meta.env.DEV;

export function httpBase(prodPath, devUrl) {
  if (isDev) return devUrl;
  return `${window.location.origin}${prodPath}`;
}

export function wsBase(prodPath, devUrl) {
  if (isDev) return devUrl;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}${prodPath}`;
}
