/**
 * Cliente HTTP para la API del simulador de sensores del coche.
 * La URL base se configura via variable de entorno de Vite.
 */

import { httpBase } from "./origin";

const BASE_URL = import.meta.env.VITE_SENSORS_API_URL || httpBase("/sensors", "http://localhost:3003");

export async function fetchSensorsState() {
  const res = await fetch(`${BASE_URL}/state`);
  if (!res.ok) throw new Error(`GET /state failed: ${res.status}`);
  return res.json();
}

export async function postSensorsState(update) {
  const res = await fetch(`${BASE_URL}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`POST /state failed: ${res.status}`);
  return res.json();
}
