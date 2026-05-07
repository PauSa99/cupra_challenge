/**
 * Cliente HTTP para la API del simulador de wearable.
 * La URL base se configura via variable de entorno de Vite.
 */

import { httpBase } from "./origin";

const BASE_URL = import.meta.env.VITE_WEARABLE_API_URL || httpBase("/wearable", "http://localhost:3002");

export async function fetchState() {
  const res = await fetch(`${BASE_URL}/state`);
  if (!res.ok) throw new Error(`GET /state failed: ${res.status}`);
  return res.json();
}

export async function postState(update) {
  const res = await fetch(`${BASE_URL}/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`POST /state failed: ${res.status}`);
  return res.json();
}
