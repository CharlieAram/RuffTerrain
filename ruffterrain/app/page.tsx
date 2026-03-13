"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import type { CellState } from "./components/SearchMap";
import VideoFeed, { type PersonDetection } from "./components/VideoFeed";
import { ROWS, COLS, CELL_MASK, ACTIVE_CELLS } from "@/lib/searchZone";

const SearchMap = dynamic(() => import("./components/SearchMap"), { ssr: false });

const DEMO_PEOPLE = [
  { x: 5, y: 2, injured: true },
  { x: 12, y: 3, injured: false },
  { x: 8, y: 5, injured: true },
  { x: 5, y: 7, injured: false },
  { x: 11, y: 7, injured: true },
];

function initGrid(): CellState[][] {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, (): CellState => "danger")
  );
}

export default function Home() {
  const [grid, setGrid] = useState(initGrid);
  const [robotPos, setRobotPos] = useState({ x: 7, y: 4 });
  const [demoMode, setDemoMode] = useState(false);
  const demoDir = useRef(1);
  const robotPosRef = useRef(robotPos);
  robotPosRef.current = robotPos;
  const lastCVLog = useRef(0);

  const clearRadius = useCallback(
    (cx: number, cy: number) => {
      setGrid((prev) => {
        const next = prev.map((r) => [...r]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (
              ny >= 0 && ny < ROWS &&
              nx >= 0 && nx < COLS &&
              CELL_MASK[ny]?.[nx] &&
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
    },
    [demoMode]
  );

  useEffect(() => {
    clearRadius(robotPos.x, robotPos.y);
  }, [robotPos, clearRadius]);

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
        CELL_MASK[y]?.[x] &&
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
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    const interval = setInterval(() => {
      setRobotPos((prev) => {
        let nx = prev.x + demoDir.current;
        let ny = prev.y;
        if (nx >= COLS || !CELL_MASK[ny]?.[nx]) {
          demoDir.current = -1;
          nx = prev.x;
          ny = prev.y + 1;
        } else if (nx < 0 || !CELL_MASK[ny]?.[nx]) {
          demoDir.current = 1;
          nx = prev.x;
          ny = prev.y + 1;
        }
        if (ny >= ROWS) return prev;
        if (!CELL_MASK[ny]?.[nx]) {
          nx = prev.x + demoDir.current;
          if (nx < 0 || nx >= COLS || !CELL_MASK[ny]?.[nx]) return prev;
        }
        return { x: nx, y: ny };
      });
    }, 120);
    return () => clearInterval(interval);
  }, [demoMode]);

  const cleared = grid.flat().filter((c, i) => {
    const y = Math.floor(i / COLS);
    const x = i % COLS;
    return CELL_MASK[y]?.[x] && c !== "danger";
  }).length;
  const pct = ACTIVE_CELLS > 0 ? ((cleared / ACTIVE_CELLS) * 100).toFixed(1) : "0";

  const reset = () => {
    setDemoMode(false);
    setGrid(initGrid());
    setRobotPos({ x: 7, y: 4 });
    demoDir.current = 1;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden font-mono">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2.5 border-b border-border bg-panel shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight text-accent">RUFFTERRAIN</span>
          <span className="text-xs text-foreground/40 uppercase tracking-[0.15em] hidden sm:inline">
            Search &amp; Rescue Ops
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-foreground/50">ROBOT OFFLINE</span>
          </div>
          <button
            onClick={() => setDemoMode((d) => !d)}
            className={`px-3 py-1.5 text-xs rounded border transition-colors cursor-pointer ${
              demoMode
                ? "border-amber-500/60 text-amber-300 bg-amber-500/15"
                : "border-border text-foreground/50 hover:text-accent hover:border-accent/50"
            }`}
          >
            {demoMode ? "STOP DEMO" : "DEMO"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded border border-border text-foreground/50 hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
          >
            RESET
          </button>
        </div>
      </header>

      {/* Main — 50/50 */}
      <div className="flex flex-1 min-h-0">
        {/* Map */}
        <div className="w-1/2 p-3 border-r border-border">
          <div className="h-full rounded-lg overflow-hidden border border-border relative">
            <SearchMap grid={grid} robotPos={robotPos} rows={ROWS} cols={COLS} />
            <div className="absolute top-3 left-3 z-[1000] bg-panel/95 backdrop-blur-sm px-3 py-1.5 rounded border border-border">
              <span className="text-xs text-accent uppercase tracking-widest">
                Pacific Palisades — Wildfire Zone
              </span>
            </div>
          </div>
        </div>

        {/* Camera + Stats */}
        <div className="w-1/2 flex flex-col p-3 gap-3">
          <div className="flex-1 min-h-0">
            <VideoFeed onDetection={handleCVDetection} />
          </div>

          <div className="shrink-0 space-y-2">
            <div className="flex gap-2">
              <Stat label="Cleared" value={`${pct}%`} accent="text-emerald-400" />
              <Stat label="Scanned" value={`${cleared}/${ACTIVE_CELLS}`} accent="text-cyan-400" />
              <Stat label="People" value={`${foundPeople.length}`} accent="text-sky-400" />
              <Stat
                label="Injured"
                value={`${foundPeople.filter((p) => p.injured).length}`}
                accent="text-red-400"
              />
            </div>

            {foundPeople.length > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-1">
                {foundPeople.map((p, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 rounded text-xs border ${
                      p.injured
                        ? "border-red-500/30 bg-red-500/10 text-red-300"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    <span>
                      {p.injured ? "\u26A0" : "\u2713"} Person @ grid ({p.x},{p.y})
                    </span>
                    <span>{p.injured ? "POTENTIALLY INJURED" : "OK"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex-1 px-3 py-2 rounded border border-border bg-panel">
      <div className="text-[9px] text-foreground/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-bold ${accent}`}>{value}</div>
    </div>
  );
}
