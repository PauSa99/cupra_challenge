// SensorsPanel — simulador de sensores del coche
// Conectado al servicio sensors:3003 igual que WearablePanel con wearable:3002
import { useEffect, useRef, useState } from "react";
import { fetchSensorsState, postSensorsState } from "../../services/sensorsClient.js";
import { wsBase } from "../../services/origin.js";
import "./SensorsPanel.css";

const WS_URL = import.meta.env.VITE_SENSORS_WS_URL || wsBase("/sensors/ws", "ws://localhost:3003/ws");

const SENSORS = [
  {
    key:   "fuelLevel",
    label: "Fuel",
    unit:  "%",
    icon:  "⛽",
    min:   0,
    max:   100,
    step:  1,
    zones: [
      { max: 10,  label: "Critical", color: "#f44336" },
      { max: 25,  label: "Low",      color: "#ff9800" },
      { max: 60,  label: "Mid",      color: "#C8713A" },
      { max: 100, label: "Full",     color: "#4caf50" },
    ],
  },
  {
    key:   "temperature",
    label: "Ext. Temp",
    unit:  "°C",
    icon:  "◌",
    min:   -10,
    max:   45,
    step:  1,
    zones: [
      { max: 5,  label: "Cold", color: "#2196f3" },
      { max: 20, label: "Cool", color: "#4caf50" },
      { max: 30, label: "Warm", color: "#ff9800" },
      { max: 45, label: "Hot",  color: "#f44336" },
    ],
  },
];

function getZone(sensor, value) {
  for (const zone of sensor.zones) {
    if (value <= zone.max) return zone;
  }
  return sensor.zones[sensor.zones.length - 1];
}

export default function SensorsPanel() {
  const [values,    setValues]    = useState(null);
  const [connected, setConnected] = useState(false);
  const [status,    setStatus]    = useState(null); // "ok" | "error" | null
  const [loading,   setLoading]   = useState(false);
  const wsRef      = useRef(null);

  // Carga inicial del estado vía REST
  useEffect(() => {
    fetchSensorsState()
      .then(setValues)
      .catch((err) => console.error("[Sensors] Error cargando estado inicial:", err));
  }, []);

  // WebSocket — recibe actualizaciones en tiempo real
  useEffect(() => {
    let reconnectTimeout;

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "STATE") {
            setValues((prev) => prev ?? msg.payload);
          }
        } catch {
          // ignorar mensajes mal formados
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, []);

  function handleSlider(key, raw) {
    setValues((prev) => ({ ...prev, [key]: parseInt(raw, 10) }));
  }

  function handleLocation(value) {
    setValues((prev) => ({ ...prev, location: value }));
  }

  async function handleApply() {
    if (!values) return;
    setLoading(true);
    setStatus(null);
    try {
      const updated = await postSensorsState(values);
      setValues(updated);
      setStatus("ok");
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(null), 2500);
    }
  }

  if (!values) {
    return (
      <div className="sensors-panel">
        <div className="panel-title">
          <span>◈ Car Sensors</span>
          <span className="conn-dot offline" />
        </div>
        <div className="sensors-loading">Connecting to sensors…</div>
      </div>
    );
  }

  return (
    <div className="sensors-panel">
      <div className="panel-title">
        <span>◈ Car Sensors</span>
        <span className={`conn-dot ${connected ? "online" : "offline"}`} />
      </div>

      <div className="sensors-list">
        {SENSORS.map((sensor) => {
          const value = values[sensor.key] ?? sensor.min;
          const zone  = getZone(sensor, value);
          const pct   = ((value - sensor.min) / (sensor.max - sensor.min)) * 100;

          return (
            <div key={sensor.key} className="sensor-row">
              <div className="sensor-info">
                <span className="sensor-icon" style={{ color: zone.color }}>{sensor.icon}</span>
                <span className="sensor-label">{sensor.label}</span>
                <span className="sensor-zone" style={{ color: zone.color }}>{zone.label}</span>
                <span className="sensor-value" style={{ color: zone.color }}>
                  {value}
                  <span className="sensor-unit">{sensor.unit}</span>
                </span>
              </div>
              <div className="slider-track">
                <div className="slider-fill" style={{ width: `${pct}%`, background: zone.color }} />
                <input
                  type="range"
                  min={sensor.min}
                  max={sensor.max}
                  step={sensor.step}
                  value={value}
                  onChange={(e) => handleSlider(sensor.key, e.target.value)}
                  className="slider-input"
                />
              </div>
              <div className="slider-bounds">
                <span>{sensor.min}{sensor.unit}</span>
                <span>{sensor.max}{sensor.unit}</span>
              </div>
            </div>
          );
        })}

        {/* Ubicación — input de texto */}
        <div className="sensor-row">
          <div className="sensor-info">
            <span className="sensor-icon" style={{ color: "#888" }}>⌖</span>
            <span className="sensor-label">Location</span>
          </div>
          <input
            type="text"
            className="location-input"
            placeholder="e.g. Barcelona, Spain"
            value={values.location ?? ""}
            onChange={(e) => handleLocation(e.target.value)}
          />
        </div>
      </div>

      <div className="sensors-footer">
        <button
          className={`apply-btn ${loading ? "loading" : ""}`}
          onClick={handleApply}
          disabled={loading}
        >
          {loading ? "Applying…" : "Apply"}
        </button>
        {status === "ok"    && <span className="feedback ok">✓ Updated</span>}
        {status === "error" && <span className="feedback error">✗ Failed</span>}
      </div>
    </div>
  );
}
