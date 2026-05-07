// WearablePanel — simulador de wearable integrado en el panel principal
// Migrado desde wearable-frontend/src con el mismo comportamiento
import { useEffect, useRef, useState } from "react";
import { fetchState, postState } from "../../services/wearableClient.js";
import { wsBase } from "../../services/origin.js";
import "./WearablePanel.css";

const WS_URL = import.meta.env.VITE_WEARABLE_WS_URL || wsBase("/wearable/ws", "ws://localhost:3002/ws");

const METRICS = [
  {
    key:   "heartRate",
    label: "Heart Rate",
    unit:  "bpm",
    min:   40,
    max:   180,
    step:  1,
    icon:  "♥",
    zones: [
      { max: 60,  label: "Resting",  color: "#4caf50" },
      { max: 90,  label: "Normal",   color: "#C8713A" },
      { max: 120, label: "Elevated", color: "#ff9800" },
      { max: 180, label: "High",     color: "#f44336" },
    ],
  },
  {
    key:   "sleepHours",
    label: "Sleep",
    unit:  "h",
    min:   0,
    max:   12,
    step:  0.5,
    icon:  "☾",
    zones: [
      { max: 5,  label: "Deprived",  color: "#f44336" },
      { max: 7,  label: "Low",       color: "#ff9800" },
      { max: 9,  label: "Good",      color: "#4caf50" },
      { max: 12, label: "Excellent", color: "#2196f3" },
    ],
  },
  {
    key:   "stressLevel",
    label: "Stress",
    unit:  "/10",
    min:   1,
    max:   10,
    step:  1,
    icon:  "⚡",
    zones: [
      { max: 3,  label: "Calm",     color: "#4caf50" },
      { max: 6,  label: "Moderate", color: "#ff9800" },
      { max: 10, label: "High",     color: "#f44336" },
    ],
  },
  {
    key:   "steps",
    label: "Steps",
    unit:  "",
    min:   0,
    max:   20000,
    step:  100,
    icon:  "◉",
    zones: [
      { max: 3000,  label: "Sedentary",   color: "#f44336" },
      { max: 7500,  label: "Low",         color: "#ff9800" },
      { max: 10000, label: "Active",      color: "#4caf50" },
      { max: 20000, label: "Very active", color: "#2196f3" },
    ],
  },
  {
    key:   "socialBattery",
    label: "Social",
    unit:  "%",
    min:   0,
    max:   100,
    step:  1,
    icon:  "☻",
    zones: [
      { max: 20,  label: "Drained",  color: "#f44336" },
      { max: 50,  label: "Low",      color: "#ff9800" },
      { max: 75,  label: "Balanced", color: "#4caf50" },
      { max: 100, label: "High",     color: "#2196f3" },
    ],
  },
];

function getZone(metric, value) {
  for (const zone of metric.zones) {
    if (value <= zone.max) return zone;
  }
  return metric.zones[metric.zones.length - 1];
}

export default function WearablePanel() {
  const [state, setWearableState] = useState(null);
  const [values, setValues]       = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus]       = useState(null); // "ok" | "error" | null
  const [loading, setLoading]     = useState(false);
  const wsRef = useRef(null);

  // Carga inicial del estado vía REST
  useEffect(() => {
    fetchState()
      .then((s) => { setWearableState(s); setValues(s); })
      .catch((err) => console.error("[Wearable] Error cargando estado inicial:", err));
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
            setWearableState(msg.payload);
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
    const metric = METRICS.find((m) => m.key === key);
    const value  = metric.step < 1 ? parseFloat(raw) : parseInt(raw, 10);
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleApply() {
    if (!values) return;
    setLoading(true);
    setStatus(null);
    try {
      const updated = await postState(values);
      setWearableState(updated);
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
      <div className="wearable-panel">
        <div className="panel-title">
          <span>◈ Wearable</span>
          <span className="conn-dot offline" />
        </div>
        <div className="wearable-loading">Connecting to wearable…</div>
      </div>
    );
  }

  return (
    <div className="wearable-panel">
      <div className="panel-title">
        <span>◈ Wearable</span>
        <span className={`conn-dot ${connected ? "online" : "offline"}`} />
      </div>

      <div className="metrics-list">
        {METRICS.map((metric) => {
          const value = values[metric.key] ?? metric.min;
          const zone  = getZone(metric, value);
          const pct   = ((value - metric.min) / (metric.max - metric.min)) * 100;

          return (
            <div key={metric.key} className="metric-row">
              <div className="metric-info">
                <span className="metric-icon" style={{ color: zone.color }}>{metric.icon}</span>
                <span className="metric-label">{metric.label}</span>
                <span className="metric-zone" style={{ color: zone.color }}>{zone.label}</span>
                <span className="metric-value" style={{ color: zone.color }}>
                  {metric.step < 1 ? value.toFixed(1) : value}
                  <span className="metric-unit">{metric.unit}</span>
                </span>
              </div>
              <div className="slider-track">
                <div className="slider-fill" style={{ width: `${pct}%`, background: zone.color }} />
                <input
                  type="range"
                  min={metric.min}
                  max={metric.max}
                  step={metric.step}
                  value={value}
                  onChange={(e) => handleSlider(metric.key, e.target.value)}
                  className="slider-input"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="wearable-footer">
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
