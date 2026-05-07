// EcosystemBar — barra inferior con el estado del ecosistema en tiempo real
import React from "react";
import { useEcosystemStore } from "../../store/useEcosystemStore";
import { useSallyStore }     from "../../store/useSallyStore";
import "./EcosystemBar.css";

const fmt = (value, unit) => (value != null ? `${value}${unit}` : "—");

export default function EcosystemBar() {
  const {
    calendar, heartRate, sleepHours, stressLevel, socialBattery,
    temperature, fuelLevel, location, spotifyGenre,
  } = useEcosystemStore();
  const connected = useSallyStore(s => s.connected);

  return (
    <div className="ecosystem-bar">
      <div className="ecosystem-items">
        <EcoItem label="Calendario"  value={fmt(calendar,      " min")} />
        <EcoItem label="FC"          value={fmt(heartRate,     " bpm")} />
        <EcoItem label="Sueño"       value={fmt(sleepHours,    "h")}    />
        <EcoItem label="Estrés"      value={fmt(stressLevel,   "/10")}  />
        <EcoItem label="Social"      value={fmt(socialBattery, "%")}    />
        <EcoItem label="Ext."        value={fmt(temperature,   "°C")}   />
        <EcoItem label="Combustible" value={fmt(fuelLevel,     "%")}    />
        <EcoItem label="Ubicación"   value={location    ?? "—"}         />
        <EcoItem label="Spotify"     value={spotifyGenre ?? "—"}        />
      </div>
      <div className={`ecosystem-status ${connected ? "online" : "offline"}`}>
        <span className="status-dot" />
        {connected ? "Sally online" : "Conectando…"}
      </div>
    </div>
  );
}

function EcoItem({ label, value }) {
  return (
    <div className="eco-item">
      <span className="eco-label">{label}</span>
      <span className="eco-value">{value}</span>
    </div>
  );
}
