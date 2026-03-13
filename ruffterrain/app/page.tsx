"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import type { CellState, InjuryPin } from "./components/SearchMap";
import VideoFeed from "./components/VideoFeed";
import { useBackend } from "./hooks/useBackend";
import { useCyberwave } from "./hooks/useCyberwave";
import { ROWS, COLS, CELL_MASK, ACTIVE_CELLS, AREA } from "@/lib/searchZone";

const SearchMap = dynamic(() => import("./components/SearchMap"), {
  ssr: false,
});

function initGrid(): CellState[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, (): CellState => "unsearched"),
  );
}

const CELL_SIZE_M = 5;
let pinIdCounter = 0;

export default function Home() {
  const [grid, setGrid] = useState(initGrid);
  const [robotPos, setRobotPos] = useState({ x: 3, y: 2 });
  const [injuries, setInjuries] = useState<InjuryPin[]>([]);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const robotPosRef = useRef(robotPos);
  robotPosRef.current = robotPos;
  const lastDetectionTime = useRef(0);

  const backend = useBackend();
  const { telemetry, mqttConnected } = useCyberwave();

  // --- SDK position tracking (MQTT) ---
  useEffect(() => {
    if (!mqttConnected || !telemetry.connected) return;
    const { x: wx, y: wy } = telemetry.position;
    const gridX = Math.round(COLS / 2 + wx / CELL_SIZE_M);
    const gridY = Math.round(ROWS / 2 - wy / CELL_SIZE_M);
    if (
      gridX >= 0 &&
      gridX < COLS &&
      gridY >= 0 &&
      gridY < ROWS &&
      CELL_MASK[gridY]?.[gridX]
    ) {
      setRobotPos({ x: gridX, y: gridY });
    }
  }, [mqttConnected, telemetry]);

  // --- Clear cells around robot ---
  const clearRadius = useCallback((cx: number, cy: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (
            ny >= 0 &&
            ny < ROWS &&
            nx >= 0 &&
            nx < COLS &&
            CELL_MASK[ny]?.[nx] &&
            next[ny][nx] === "unsearched"
          ) {
            next[ny][nx] = "clear";
          }
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    clearRadius(robotPos.x, robotPos.y);
  }, [robotPos, clearRadius]);

  // --- Handle CV detections → injury pins ---
  useEffect(() => {
    if (!cameraOn || !backend.detections.length) return;

    const now = Date.now();
    if (now - lastDetectionTime.current < 4000) return;

    const injured = backend.detections.filter((d) => d.label === "INJURED");
    if (!injured.length) return;

    lastDetectionTime.current = now;
    const pos = robotPosRef.current;
    const cellW = (AREA.east - AREA.west) / COLS;
    const cellH = (AREA.north - AREA.south) / ROWS;
    const lat = AREA.north - (pos.y + 0.5) * cellH;
    const lng = AREA.west + (pos.x + 0.5) * cellW;

    setInjuries((prev) => {
      const existing = prev.find(
        (p) => Math.abs(p.gridX - pos.x) <= 1 && Math.abs(p.gridY - pos.y) <= 1,
      );
      if (existing) {
        return prev.map((p) =>
          p.id === existing.id
            ? { ...p, count: p.count + injured.length, timestamp: now }
            : p,
        );
      }
      pinIdCounter++;
      return [
        ...prev,
        {
          id: `injury-${pinIdCounter}`,
          lat,
          lng,
          gridX: pos.x,
          gridY: pos.y,
          count: injured.length,
          timestamp: now,
        },
      ];
    });
  }, [backend.detections, cameraOn]);

  // --- Keyboard controls (fallback when robot offline) ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      const moves: Record<string, [number, number]> = {
        w: [0, -1],
        arrowup: [0, -1],
        s: [0, 1],
        arrowdown: [0, 1],
        a: [-1, 0],
        arrowleft: [-1, 0],
        d: [1, 0],
        arrowright: [1, 0],
      };
      const dir = moves[e.key.toLowerCase()];
      if (!dir) return;

      e.preventDefault();

      if (backend.robotConnected) {
        const cmds: Record<string, string> = {
          w: "forward",
          arrowup: "forward",
          s: "backward",
          arrowdown: "backward",
          a: "left",
          arrowleft: "left",
          d: "right",
          arrowright: "right",
        };
        backend.sendCommand(cmds[e.key.toLowerCase()]);
      } else {
        setRobotPos((prev) => {
          const nx = Math.max(0, Math.min(COLS - 1, prev.x + dir[0]));
          const ny = Math.max(0, Math.min(ROWS - 1, prev.y + dir[1]));
          if (!CELL_MASK[ny]?.[nx]) return prev;
          return { x: nx, y: ny };
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [backend.robotConnected, backend.sendCommand]);

  // --- Derived stats ---
  const cleared = grid
    .flat()
    .filter((c, i) => {
      const y = Math.floor(i / COLS);
      const x = i % COLS;
      return CELL_MASK[y]?.[x] && c === "clear";
    }).length;
  const pct =
    ACTIVE_CELLS > 0 ? ((cleared / ACTIVE_CELLS) * 100).toFixed(1) : "0";
  const totalInjured = injuries.reduce((sum, p) => sum + p.count, 0);

  const reset = () => {
    setGrid(initGrid());
    setRobotPos({ x: 3, y: 2 });
    setInjuries([]);
    setSelectedPin(null);
    setPanelOpen(false);
  };

  const handlePinClick = (id: string) => {
    setSelectedPin(id);
    setPanelOpen(true);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden font-mono">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-accent">
            RUFFTERRAIN
          </span>
          <span className="text-xs text-foreground/40 uppercase tracking-[0.15em] hidden sm:inline">
            Search &amp; Rescue Ops
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                backend.robotConnected
                  ? "bg-emerald-400"
                  : backend.connected
                    ? "bg-amber-400 animate-pulse"
                    : "bg-red-400 animate-pulse"
              }`}
            />
            <span className="text-foreground/50">
              {backend.robotConnected
                ? "ROBOT ONLINE"
                : backend.connected
                  ? "ROBOT OFFLINE — CV ACTIVE"
                  : "BACKEND OFFLINE"}
            </span>
          </div>
          <button
            onClick={() => setCameraOn((c) => !c)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
              cameraOn
                ? "border-accent/50 text-accent"
                : "border-border text-foreground/50 hover:text-accent hover:border-accent/50"
            }`}
          >
            {cameraOn ? "CAM ON" : "CAM OFF"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground/50 hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
          >
            RESET
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Map panel */}
        <div
          className={`p-3 border-r border-border transition-all duration-300 ${
            panelOpen ? "w-[45%]" : "w-[60%]"
          }`}
        >
          <div className="h-full rounded-lg overflow-hidden border border-border relative">
            <SearchMap
              grid={grid}
              robotPos={robotPos}
              rows={ROWS}
              cols={COLS}
              injuries={injuries}
              onPinClick={handlePinClick}
            />
            <div className="absolute top-3 left-3 z-[1000] bg-panel/95 backdrop-blur-sm px-3 py-1.5 rounded border border-border">
              <span className="text-xs text-accent uppercase tracking-widest">
                Forest Search Zone — Temescal Canyon
              </span>
            </div>
          </div>
        </div>

        {/* Camera + Stats panel */}
        <div
          className={`flex flex-col p-3 gap-3 transition-all duration-300 ${
            panelOpen ? "w-[30%]" : "w-[40%]"
          }`}
        >
          <div className="flex-1 min-h-0">
            {cameraOn ? (
              <VideoFeed
                frame={backend.frame}
                detections={backend.detections}
                cameraSource={backend.cameraSource}
                backendConnected={backend.connected}
              />
            ) : (
              <div className="h-full bg-panel rounded-lg border border-border flex items-center justify-center">
                <span className="text-sm font-mono text-zinc-500 uppercase">
                  Camera Disabled
                </span>
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-2">
            <div className="flex gap-2">
              <Stat label="Cleared" value={`${pct}%`} accent="text-emerald-400" />
              <Stat
                label="Scanned"
                value={`${cleared}/${ACTIVE_CELLS}`}
                accent="text-cyan-400"
              />
              <Stat
                label="Injured"
                value={`${totalInjured}`}
                accent="text-red-400"
              />
              <Stat
                label="Pins"
                value={`${injuries.length}`}
                accent="text-amber-400"
              />
            </div>
            {!backend.robotConnected && (
              <div className="px-3 py-2 rounded border border-border bg-panel text-[10px] text-foreground/40 text-center uppercase tracking-wider">
                Use W A S D or arrow keys to move the robot
              </div>
            )}
          </div>
        </div>

        {/* Injury log panel (slides in on pin click) */}
        {panelOpen && (
          <div className="w-[25%] border-l border-border bg-panel flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-mono text-red-400 uppercase tracking-widest">
                Injury Log
              </span>
              <button
                onClick={() => {
                  setPanelOpen(false);
                  setSelectedPin(null);
                }}
                className="text-foreground/40 hover:text-foreground text-xs cursor-pointer"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {injuries.length === 0 ? (
                <div className="text-center text-xs text-foreground/30 py-8">
                  No injuries detected yet.
                  <br />
                  Pins appear when the CV model detects injured persons.
                </div>
              ) : (
                injuries.map((pin) => (
                  <div
                    key={pin.id}
                    onClick={() => setSelectedPin(pin.id)}
                    className={`px-3 py-2.5 rounded border cursor-pointer transition-colors ${
                      selectedPin === pin.id
                        ? "border-red-500/60 bg-red-500/15"
                        : "border-border hover:border-red-500/30 hover:bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-red-400 font-bold">
                        ⚠ INJURED PERSON{pin.count > 1 ? "S" : ""}
                      </span>
                      <span className="text-[10px] text-foreground/40">
                        {new Date(pin.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-[10px] text-foreground/50 space-y-0.5">
                      <div>
                        Count:{" "}
                        <span className="text-red-300">{pin.count}</span>
                      </div>
                      <div>
                        Grid: ({pin.gridX}, {pin.gridY})
                      </div>
                      <div>
                        Coords: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-4 py-3 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground/40">Total Injured</span>
                <span className="text-red-400 font-bold">{totalInjured}</span>
              </div>
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-foreground/40">Locations</span>
                <span className="text-amber-400 font-bold">
                  {injuries.length}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="flex-1 px-3 py-2 rounded border border-border bg-panel">
      <div className="text-[9px] text-foreground/40 uppercase tracking-wide">
        {label}
      </div>
      <div className={`text-sm font-bold ${accent}`}>{value}</div>
    </div>
  );
}
