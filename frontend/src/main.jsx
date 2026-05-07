// main.jsx — punto de entrada de la aplicación React
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { useVehicleStore, SEAT_PRESETS, INTERIOR_MODES } from "./store/useVehicleStore";
import { useEcosystemStore } from "./store/useEcosystemStore";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.env.DEV) {
  const v = () => useVehicleStore.getState();
  const e = () => useEcosystemStore.getState();

  // Maps a position string ("normal" | "reclined" | "rotated") to a SEAT_PRESETS config.
  const seat = (pos) => ({ ...(SEAT_PRESETS[pos] ?? SEAT_PRESETS.normal) });

  window.sally = {
    // Setters individuales — equivalen exactamente a recibir el mensaje WS del backend.
    setLight:        (color)    => v().setAmbientLight(color),
    setSteering:     (position) => v().setSteering(position),
    setSeatDriver:   (position) => v().setSeatDriver(seat(position)),
    setSeatPass:     (position) => v().setSeatPassenger(seat(position)),
    setSeatRearL:    (position) => v().setSeatRearLeft(seat(position)),
    setSeatRearR:    (position) => v().setSeatRearRight(seat(position)),
    setTable:        (open)     => v().setTableOpen(Boolean(open)),
    setTemp:         (degrees)  => v().setTemperature(degrees),
    setWindow:       (win, p)   => v().setWindowPreset(win, p),
    setFuel:         (val)      => e().updateEcosystem({ fuelLevel: val }),
    setHeart:        (val)      => e().updateEcosystem({ heartRate: val }),

    // Modos intrínsecos completos — el mismo preset que aplica set_interior_mode.
    mode:    (name) => v().setInteriorMode(`MODO_${name.toUpperCase()}`),
    drive:   () => v().setInteriorMode("MODO_CONDUCCION"),
    meeting: () => v().setInteriorMode("MODO_REUNION"),
    relax:   () => v().setInteriorMode("MODO_RELAX"),
    amics:   () => v().setInteriorMode("MODO_AMICS"),
    stress:  () => { v().setAmbientLight("green"); e().updateEcosystem({ heartRate: 98, stressLevel: 8 }); },
    lowFuel: () => e().updateEcosystem({ fuelLevel: 12 }),
    social:  () => e().updateEcosystem({ socialBattery: 85, location: "Barcelona" }),
    reset:   () => { v().setInteriorMode("MODO_CONDUCCION"); v().setTemperature(22); e().updateEcosystem({ fuelLevel: 60 }); },

    help: () => {
      console.group("%cSALLY DEV", "color:#C8713A;font-weight:bold");
      console.log("Modos:    sally.drive()  sally.meeting()  sally.relax()  sally.amics()  sally.reset()");
      console.log("Setters:  sally.setLight('blue')  sally.setSteering('retract')  sally.setSeatDriver('rotated')");
      console.log("          sally.setSeatPass('rotated')  sally.setTable(true)  sally.setWindow('left','MOUNTAINS')");
      console.log("          sally.setFuel(15)  sally.setHeart(95)  sally.setTemp(20)  sally.lowFuel()  sally.social()");
      console.log("Disponibles:", Object.keys(INTERIOR_MODES).join(", "));
      console.groupEnd();
    },
  };

  console.info(
    "%cSALLY DEV%c  Escribe sally.help() para ver los comandos disponibles.",
    "background:#C8713A;color:#fff;font-weight:bold;padding:2px 6px;border-radius:3px",
    "color:#C8713A"
  );
}
