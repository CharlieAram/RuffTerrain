"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import MapGrid, { type CellState } from "./components/MapGrid";
import VideoFeed from "./components/VideoFeed";

const ROWS = 16;
const COLS = 24;

interface Person {
  x: number;
  y: number;
  injured: boolean;
}

const DEMO_PEOPLE: Person[] = [
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

export default function Home() {
  const [grid, setGrid] = useState(initGrid);
  const [robotPos, setRobotPos] = useState({ x: 0, y: 0 });
  const [demoMode, setDemoMode] = useState(false);
  const demoDir = useRef(1);

  const clearRadius = useCallback((cx: number, cy: number) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS && next[ny][nx] === "danger") {
            const person = DEMO_PEOPLE.find((p) => p.x === nx && p.y === ny);
            next[ny][nx] = person
              ? person.injured ? "person-injured" : "person-ok"
              : "clear";
          }
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    clearRadius(robotPos.x, robotPos.y);
  }, [robotPos, clearRadius]);

  const foundPeople = useMemo(() => {
    return DEMO_PEOPLE.filter((p) => {
      const cell = grid[p.y]?.[p.x];
      return cell === "person-injured" || cell === "person-ok";
    });
  }, [grid]);

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
        if (ny >= ROWS) {
          return prev;
        }
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
    setGrid(initGrid());
    setRobotPos({ x: 0, y: 0 });
    demoDir.current = 1;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden font-mono">
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-accent">RUFFTERRAIN</span>
          <span className="text-[10px] text-foreground/30 uppercase tracking-[0.2em] hidden sm:inline">
            Search &amp; Rescue Ops
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-foreground/40">ROBOT OFFLINE</span>
          </div>
          <button
            onClick={() => setDemoMode((d) => !d)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
              demoMode
                ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
                : "border-border text-foreground/40 hover:text-accent hover:border-accent/50"
            }`}
          >
            {demoMode ? "STOP DEMO" : "DEMO"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground/40 hover:text-red-400 hover:border-red-500/50 transition-colors cursor-pointer"
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
            <VideoFeed />
          </div>

          <div className="flex-1 p-4 border-t border-border overflow-y-auto space-y-5">
            <section>
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                Mission Status
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Cleared" value={`${pct}%`} accent="text-emerald-400" />
                <Stat label="Scanned" value={`${cleared}/${total}`} accent="text-cyan-400" />
                <Stat label="People" value={`${foundPeople.length}`} accent="text-sky-400" />
                <Stat
                  label="Injured"
                  value={`${foundPeople.filter((p) => p.injured).length}`}
                  accent="text-red-400"
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
              <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
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
              <p className="text-[9px] text-foreground/20 text-center mt-2">
                Arrow keys also work
              </p>
            </section>

            {foundPeople.length > 0 && (
              <section>
                <h3 className="text-[10px] text-foreground/30 uppercase tracking-[0.15em] mb-2">
                  Detection Log
                </h3>
                <div className="space-y-1.5">
                  {foundPeople.map((p, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between px-3 py-2 rounded text-xs border ${
                        p.injured
                          ? "border-red-900/50 bg-red-950/20 text-red-400"
                          : "border-emerald-900/50 bg-emerald-950/20 text-emerald-400"
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

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="px-3 py-2 rounded border border-border bg-background">
      <div className="text-[9px] text-foreground/30 uppercase">{label}</div>
      <div className={`text-base font-bold ${accent}`}>{value}</div>
    </div>
  );
}

function Key({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="w-10 h-10 flex flex-col items-center justify-center rounded border border-border bg-background text-foreground/50">
      <span className="text-[11px] leading-none">{label}</span>
      <span className="text-[8px] leading-none opacity-40">{sub}</span>
    </div>
  );
}
