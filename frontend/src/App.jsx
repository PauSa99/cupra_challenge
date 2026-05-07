// App.jsx — layout principal de Sally (3 paneles)
import React, { useCallback } from "react";
import SallyPanel    from "./components/SallyPanel";
import EcosystemBar  from "./components/EcosystemBar";
import WearablePanel from "./components/WearablePanel";
import SensorsPanel  from "./components/SensorsPanel";
import CarScene3D    from "./components/CarScene3D";
import DevPanel      from "./components/DevPanel";
import { useWebSocket }      from "./hooks/useWebSocket";
import { useVehicleStore, SEAT_PRESETS } from "./store/useVehicleStore";
import { useEcosystemStore } from "./store/useEcosystemStore";
import { useSallyStore }     from "./store/useSallyStore";
import "./App.css";

// Maps a position string ("normal" | "reclined" | "rotated") to a complete
// SEAT_PRESETS config. Falls back to "normal" so unknown values don't break
// the seat config (the Seat component reads numeric fields off the object).
const seatConfigFromPosition = (position) =>
  ({ ...(SEAT_PRESETS[position] ?? SEAT_PRESETS.normal) });

function App() {
  const {
    setAmbientLight, setSteering, setTemperature,
    setSeatDriver, setSeatPassenger, setSeatRearLeft, setSeatRearRight,
    setTableOpen, setWindowPreset, setInteriorMode,
  } = useVehicleStore();
  const { updateEcosystem } = useEcosystemStore();
  const { applySallyAction, setConnected, addToLog, setIsThinking, appendStreamingText } = useSallyStore();

  const handleMessage = useCallback(
    (msg) => {
      switch (msg.type) {
        case "CONNECTED":
          setConnected(true);
          addToLog("Sally online");
          break;

        // ── Intrinsic mode (multi-subsystem preset) ───────────────────────
        case "SET_INTERIOR_MODE": {
          // Backend mode names are lowercase ("reunion", "conduccion"…).
          // The store keys the modes under MODO_<UPPER>.
          const key = `MODO_${(msg.payload.mode ?? "").toUpperCase()}`;
          setInteriorMode(key);
          addToLog(`Modo aplicado: ${msg.payload.mode}`);
          break;
        }

        // ── Subsystem tweaks (general tools) ──────────────────────────────
        case "SET_INSIDE_LIGHT":
          setAmbientLight(msg.payload.color);
          break;
        case "SET_STEERING_WHEEL":
          setSteering(msg.payload.position);
          break;
        case "SET_SEAT_DRIVER":
          setSeatDriver(seatConfigFromPosition(msg.payload.position));
          break;
        case "SET_SEAT_PASSENGER":
          setSeatPassenger(seatConfigFromPosition(msg.payload.position));
          break;
        case "SET_SEAT_REAR_LEFT":
          setSeatRearLeft(seatConfigFromPosition(msg.payload.position));
          break;
        case "SET_SEAT_REAR_RIGHT":
          setSeatRearRight(seatConfigFromPosition(msg.payload.position));
          break;
        case "SET_TABLE_OPEN":
          setTableOpen(Boolean(msg.payload.open));
          break;
        case "SET_CABIN_TEMPERATURE":
          setTemperature(msg.payload.degrees);
          break;
        case "SET_WINDOW_PROJECTION": {
          const { window, preset } = msg.payload;
          if (window === "all") {
            setWindowPreset("left",  preset);
            setWindowPreset("right", preset);
            setWindowPreset("front", preset);
          } else if (window) {
            setWindowPreset(window, preset);
          }
          break;
        }
        case "SET_FUEL_LEVEL":
          updateEcosystem({ fuelLevel: Number(msg.payload.percent) });
          break;

        case "SALLY_START":
          setIsThinking(true);
          break;
        case "SALLY_CHUNK":
          appendStreamingText(msg.payload.text);
          break;
        case "SALLY_REASONING":
          addToLog(msg.payload.text);
          break;

        // ── Ecosistema y compatibilidad ───────────────────────────────────
        case "ECOSYSTEM_UPDATE":
          updateEcosystem(msg.payload);
          break;
        case "SALLY_ACTION":
          // Fallback: algunos clientes legacy pueden seguir mandando el dump completo
          applySallyAction(msg.payload);
          if (msg.payload.reasoning) addToLog(msg.payload.reasoning);
          break;

        default:
          break;
      }
    },
    [
      applySallyAction, updateEcosystem, setConnected, addToLog,
      setAmbientLight, setSteering, setTemperature,
      setSeatDriver, setSeatPassenger, setSeatRearLeft, setSeatRearRight,
      setTableOpen, setWindowPreset, setInteriorMode,
      setIsThinking, appendStreamingText,
    ]
  );

  useWebSocket(handleMessage);

  return (
    <div className="app">
      <header className="app-header">SALLY · CUPRA BORN AI AGENT</header>

      <main className="app-main">
        {/* ── Izquierda: Sally (conversación + controles) ── */}
        <aside className="panel sidebar-left">
          <SallyPanel />
        </aside>

        {/* ── Centro: coche 3D (prioridad máxima, columna completa) ── */}
        <section className="panel panel-car">
          <CarScene3D />
        </section>

        {/* ── Derecha: wearable + sensores apilados ── */}
        <aside className="sidebar-right">
          <div className="panel sidebar-panel">
            <WearablePanel />
          </div>
          <div className="panel sidebar-panel">
            <SensorsPanel />
          </div>
        </aside>
      </main>

      <footer className="app-footer">
        <EcosystemBar />
      </footer>

      <DevPanel />
    </div>
  );
}

export default App;
