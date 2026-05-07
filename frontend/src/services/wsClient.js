// services/wsClient.js
// Cliente WebSocket singleton — toda la app usa esta instancia
// El frontend es un receptor puro: solo consume mensajes del backend.

import { wsBase } from "./origin";

const WS_URL = import.meta.env.VITE_WS_URL || wsBase("/ws", "ws://localhost:3001/ws");

let socket    = null;
let listeners = [];

export const getSocket = () => socket;

// Registra un callback que se invocará con cada mensaje recibido.
// Devuelve una función para cancelar el registro.
export const addMessageListener = (fn) => {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
};

// Inicializa la conexión WebSocket.
// Si ya existe una conexión abierta la cierra antes de crear una nueva
// para evitar conexiones duplicadas durante reconexiones.
export const connectWS = (onOpen, onClose) => {
  if (socket) {
    socket.close();
    socket = null;
  }

  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    console.log("[WS] Conectado a Sally");
    onOpen?.();
  });

  socket.addEventListener("message", (event) => {
    try {
      const message = JSON.parse(event.data);
      listeners.forEach((fn) => fn(message));
    } catch {
      console.error("[WS] Error al parsear mensaje:", event.data);
    }
  });

  socket.addEventListener("close", () => {
    console.log("[WS] Conexión cerrada");
    socket = null;
    onClose?.();
  });

  socket.addEventListener("error", (err) => {
    console.error("[WS] Error:", err);
  });
};

// Envía un mensaje de voz del conductor al backend.
export const sendUserMessage = (text) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const turn_id = crypto.randomUUID();
    socket.send(JSON.stringify({ type: "USER_MESSAGE", payload: { text, turn_id } }));
  } else {
    console.warn("[WS] No se puede enviar USER_MESSAGE — socket no abierto");
  }
};

