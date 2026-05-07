// hooks/useWebSocket.js
// Hook de React para gestionar la conexión WebSocket con reconexión automática
// Usa backoff exponencial para no saturar el servidor si está caído

import { useEffect, useRef, useCallback } from "react";
import { connectWS, addMessageListener } from "../services/wsClient";

const INITIAL_DELAY_MS = 1000;  // primer reintento tras 1 segundo
const MAX_DELAY_MS     = 30000; // máximo 30 segundos entre reintentos
const BACKOFF_FACTOR   = 2;     // cada fallo dobla el tiempo de espera

export function useWebSocket(onMessage) {
  const delayRef  = useRef(INITIAL_DELAY_MS);
  const timerRef  = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    connectWS(
      // onOpen — resetea el backoff cuando la conexión tiene éxito
      () => { delayRef.current = INITIAL_DELAY_MS; },

      // onClose — programa un reintento con backoff exponencial
      () => {
        if (!mountedRef.current) return;
        const delay = delayRef.current;
        console.log(`[WS] Reintentando en ${delay / 1000}s...`);
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) connect();
        }, delay);
        delayRef.current = Math.min(delay * BACKOFF_FACTOR, MAX_DELAY_MS);
      }
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Registra el listener de mensajes y guarda la función de limpieza
    const removeListener = addMessageListener(onMessage);

    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
      removeListener();
    };
  }, [connect, onMessage]);
}
