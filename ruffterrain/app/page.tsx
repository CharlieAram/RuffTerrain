"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import MapGrid, { type CellState } from "./components/MapGrid";
import VideoFeed, { type PersonDetection } from "./components/VideoFeed";
import { useCyberwave, type SafeScoutStatus } from "./hooks/useCyberwave";

const ROWS = 16;
const COLS = 24;

const DEMO_PEOPLE = [
  { x: 6, y: 3, injured: true },
  { x: 19, y: 5, injured: false },
  { x: 11, y: 9, injured: true },
  { x: 4, y: 13, injured: false },
  { x: 20, y: 12, injured: true },
];

function initGrid(): CellState[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, (): CellState => "danger")
  );
}

const RISK_COLORS: Record<string, string> = {
  safe: "text-emerald-400",
  low: "text-emerald-400",
  elevated: "text-amber-400",
  medium: "text-amber-400",
  caution: "text-amber-400",
  high: "text-red-400",
  unsafe: "text-red-400",
  none: "text-foreground/30",
};

const RISK_BG: Record<string, string> = {
  safe: "border-emerald-900/50 bg-emerald-950/20",
  low: "border-emerald-900/50 bg-emerald-950/20",
  elevated: "border-amber-900/50 bg-amber-950/20",
  medium: "border-amber-900/50 bg-amber-950/20",
  caution: "border-amber-900/50 bg-amber-950/20",
  high: "border-red-900/50 bg-red-950/20",
  unsafe: "border-red-900/50 bg-red-950/20",
};

function getRecommendationText(status: SafeScoutStatus): string {
  if (status.recommendation === "unsafe") {
    const parts: string[] = [];
    if (status.personDetected) parts.push("Downed person detected.");
    if (status.gasLevel === "high") parts.push(`Carbon monoxide elevated (${status.coReading} ppm).`);
    if (status.thermalRisk === "high") parts.push("Thermal hotspot nearby.");
    parts.push("Area unsafe for medic entry.");
    return parts.join(" ");
  }
  if (status.recommendation === "caution") {
    const parts: string[] = [];
    if (status.personDetected) parts.push(`Person detected (${status.posture}).`);
    parts.push("Proceed with caution.");
    return parts.join(" ");
  }
  return "No threats detected. Area safe for responder entry.";
}

export default function Home() {
  const [grid, setGrid] = useState(initGrid);
  const [robotPos, setRobotPos] = useState({ x: 0, y: 0 });
  const [demoMode, setDemoMode] = useState(false);
  const demoDir = useRef(1);
  const { status, telemetry, mqttConnected, runSimulation } = useCyberwave();
  const simCleanup = useRef<(() => void) | null>(null);
  const robotPosRef = useRef(robotPos);
  robotPosRef.current = robotPos;
  const lastCVLog = useRef(0);

  const clearRadius = useCallback((cx: number, cy: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (
            ny >= 0 && ny < ROWS &&
            nx >= 0 && nx < COLS &&
            next[ny][nx] === "danger"
          ) {
            if (demoMode) {
              const person = DEMO_PEOPLE.find((p) => p.x === nx && p.y === ny);
              next[ny][nx] = person
                ? person.injured ? "person-injured" : "person-ok"
                : "clear";
            } else {
              next[ny][nx] = "clear";
            }
          }
        }
      }
      return next;
    });
  }, [demoMode]);

  useEffect(() => {
    clearRadius(robotPos.x, robotPos.y);
  }, [robotPos, clearRadius]);

  // Derive found people from grid state — works for both demo + CV detections
  const foundPeople = useMemo(() => {
    const found: { x: number; y: number; injured: boolean }[] = [];
    grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === "person-injured") found.push({ x, y, injured: true });
        else if (cell === "person-ok") found.push({ x, y, injured: false });
      });
    });
    return found;
  }, [grid]);

  // CV detection → mark robot's current cell on the grid
  const handleCVDetection = useCallback((detections: PersonDetection[]) => {
    const now = Date.now();
    if (now - lastCVLog.current < 4000) return;
    lastCVLog.current = now;

    const best = detections.reduce((a, b) =>
      a.confidence > b.confidence ? a : b
    );
    const pos = robotPosRef.current;

    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      const { x, y } = pos;
      if (
        y >= 0 && y < ROWS &&
        x >= 0 && x < COLS &&
        next[y][x] !== "person-injured" &&
        next[y][x] !== "person-ok"
      ) {
        next[y][x] = best.injured ? "person-injured" : "person-ok";
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const moves: Record<string, [number, number]> = {
        w: [0, -1], arrowup: [0, -1],
        s: [0, 1], arrowdown: [0, 1],
        a: [-1, 0], arrowleft: [-1, 0],
        d: [1, 0], arrowright: [1, 0],
      };
      const dir = moves[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        setRobotPos((prev) => ({
          x: Math.max(0, Math.min(COLS - 1, prev.x + dir[0])),
          y: Math.max(0, Math.min(ROWS - 1, prev.y + dir[1])),
        }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      setRobotPos((prev) => {
        let nx = prev.x + demoDir.current;
        let ny = prev.y;
        if (nx >= COLS) {
          demoDir.current = -1;
          nx = COLS - 1;
          ny = prev.y + 2;
        } else if (nx < 0) {
          demoDir.current = 1;
          nx = 0;
          ny = prev.y + 2;
        }
        if (ny >= ROWS) return prev;
        return { x: nx, y: ny };
      });
    }, 80);
    return () => clearInterval(interval);
  }, [demoMode]);

  const cleared = grid.flat().filter((c) => c !== "danger").length;
  const total = ROWS * COLS;
  const pct = ((cleared / total) * 100).toFixed(1);

  const reset = () => {
    setDemoMode(false);
    if (simCleanup.current) simCleanup.current();
    setGrid(initGrid());
    setRobotPos({ x: 0, y: 0 });
    demoDir.current = 1;
  };

  const handleSimulate = () => {
    if (simCleanup.current) simCleanup.current();
    simCleanup.current = runSimulation();
  };

  const connectionLabel = mqttConnected ? "CYBERWAVE LIVE" : "OFFLINE";
  const connectionColor = mqttConnected ? "bg-emerald-500" : "bg-red-500";

  return (
    <div className="flex flex-col h-screen overflow-hidden font-mono">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-accent">
            RUFFTERRAIN
          </span>
          <span className="text-[10px] text-foreground/30 uppercase tracking-[0.2em] hidden sm:inline">
            Pre-Entry Safety Recon
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-foreground/50">ROBOT OFFLINE</span>
            <span className={`w-2 h-2 rounded-full ${connectionColor} ${mqttConnected ? "" : "animate-pulse"}`} />
            <span className="text-foreground/40">{connectionLabel}</span>
          </div>
          {!mqttConnected && (
            <button
              onClick={handleSimulate}
              className="px-3 py-1.5 text-xs rounded border border-amber-500/50 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              SIMULATE
            </button>
          )}
          <button
            onClick={() => setDemoMode((d) => !d)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
              demoMode
                ? "border-amber-400 text-amber-600 bg-amber-50"
                : "border-border text-foreground/50 hover:text-accent hover:border-accent"
            }`}
          >
            {demoMode ? "STOP DEMO" : "DEMO"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground/50 hover:text-red-500 hover:border-red-300 transition-colors cursor-pointer"
          >
            RESET
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 p-4">
          <MapGrid grid={grid} robotPos={robotPos} rows={ROWS} cols={COLS} />
        </div>

        <div className="w-[380px] flex flex-col border-l border-border shrink-0">
          <div className="h-[280px] p-3 shrink-0">
            <VideoFeed onDetection={handleCVDetection} />
          </div>

          <div className="flex-1 p-4 border-t border-border overflow-y-auto space-y-5">
            {/* SafeScout Mission Status */}
            <section>
              <h3 className="text-[10px] text-foreground/40 uppercase tracking-[0.15em] mb-2">
                Mission Status
              </h3>
              <div className="space-y-2">
                <HazardRow
                  label="Person Down"
                  value={status.personDetected ? `YES — ${status.posture}` : "NO"}
                  level={status.personDetected ? "high" : "safe"}
                />
                <HazardRow
                  label="Chemical Hazard"
                  value={`${status.gasLevel.toUpperCase()} — CO: ${status.coReading} ppm / CH₄: ${status.methaneReading}%`}
                  level={status.gasLevel}
                />
                <HazardRow
                  label="Thermal Hazard"
                  value={status.thermalRisk.toUpperCase()}
                  level={status.thermalRisk}
                />
              </div>
            </section>

            {/* Entry Recommendation */}
            <section>
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                Entry Recommendation
              </h3>
              <div className={`px-4 py-3 rounded border ${RISK_BG[status.recommendation] ?? "border-border"}`}>
                <div className={`text-sm font-bold uppercase ${RISK_COLORS[status.recommendation]}`}>
                  {status.recommendation === "unsafe" ? "DO NOT ENTER" :
                   status.recommendation === "caution" ? "PROCEED WITH CAUTION" :
                   "AREA CLEAR"}
                </div>
                <p className="text-[11px] text-foreground/50 mt-1 leading-relaxed">
                  {getRecommendationText(status)}
                </p>
              </div>
            </section>

            {/* Map scan progress */}
            <section>
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                Scan Progress
              </h3>
              <div className="space-y-2">
                <HazardRow
                  label="Person Down"
                  value={status.personDetected ? `YES — ${status.posture}` : "NO"}
                  level={status.personDetected ? "high" : "safe"}
                />
                <HazardRow
                  label="Chemical Hazard"
                  value={`${status.gasLevel.toUpperCase()} — CO: ${status.coReading} ppm / CH₄: ${status.methaneReading}%`}
                  level={status.gasLevel}
                />
                <HazardRow
                  label="Thermal Hazard"
                  value={status.thermalRisk.toUpperCase()}
                  level={status.thermalRisk}
                />
              </div>
            </section>

            {/* Entry Recommendation */}
            <section>
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                Entry Recommendation
              </h3>
              <div className={`px-4 py-3 rounded border ${RISK_BG[status.recommendation] ?? "border-border"}`}>
                <div className={`text-sm font-bold uppercase ${RISK_COLORS[status.recommendation]}`}>
                  {status.recommendation === "unsafe" ? "DO NOT ENTER" :
                   status.recommendation === "caution" ? "PROCEED WITH CAUTION" :
                   "AREA CLEAR"}
                </div>
                <p className="text-[11px] text-foreground/50 mt-1 leading-relaxed">
                  {getRecommendationText(status)}
                </p>
              </div>
            </section>

            {/* Map scan progress */}
            <section>
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                Scan Progress
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Cleared" value={`${pct}%`} accent="text-emerald-600" />
                <Stat label="Scanned" value={`${cleared}/${total}`} accent="text-cyan-600" />
                <Stat label="People" value={`${foundPeople.length}`} accent="text-sky-600" />
                <Stat
                  label="Injured"
                  value={`${foundPeople.filter((p) => p.injured).length}`}
                  accent="text-red-500"
                />
              </div>
              <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-cyan-500 transition-all duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </section>

            <section>
              <h3 className="text-[10px] text-foreground/40 uppercase tracking-[0.15em] mb-2">
                Controls
              </h3>
              <div className="flex flex-col items-center gap-1">
                <Key label="W" sub="&#9650;" />
                <div className="flex gap-1">
                  <Key label="A" sub="&#9664;" />
                  <Key label="S" sub="&#9660;" />
                  <Key label="D" sub="&#9654;" />
                </div>
              </div>
              <p className="text-[9px] text-foreground/30 text-center mt-2">
                Arrow keys also work
              </p>
            </section>

            {foundPeople.length > 0 && (
              <section>
                <h3 className="text-[10px] text-foreground/40 uppercase tracking-[0.15em] mb-2">
                  Detection Log
                </h3>
                <div className="space-y-1.5">
                  {foundPeople.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${
                        p.injured
                          ? "border-red-200 bg-red-50 text-red-600"
                          : "border-emerald-200 bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      <span>
                        {p.injured ? "\u26A0" : "\u2713"} Person @ ({p.x},{p.y})
                      </span>
                      <span>{p.injured ? "INJURED" : "OK"}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HazardRow({ label, value, level }: { label: string; value: string; level: string }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded border ${RISK_BG[level] ?? "border-border bg-background"}`}>
      <span className="text-[11px] text-foreground/50 uppercase">{label}</span>
      <span className={`text-xs font-bold ${RISK_COLORS[level] ?? "text-foreground/40"}`}>
        {value}
      </span>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-border bg-white">
      <div className="text-[9px] text-foreground/40 uppercase">{label}</div>
      <div className={`text-base font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function Key({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="w-10 h-10 flex flex-col items-center justify-center rounded-lg border border-border bg-white text-foreground/50 shadow-sm">
      <span className="text-[11px] leading-none">{label}</span>
      <span className="text-[8px] leading-none opacity-40">{sub}</span>
    </div>
  );
}
