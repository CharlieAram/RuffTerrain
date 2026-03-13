"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface Detection {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  confidence: number;
  injured: boolean;
}

const MOCK_SEQUENCE: (Detection | null)[] = [
  null,
  null,
  { x: 60, y: 40, w: 100, h: 150, label: "Person", confidence: 0.92, injured: false },
  { x: 60, y: 40, w: 100, h: 150, label: "Person", confidence: 0.94, injured: false },
  null,
  null,
  { x: 130, y: 30, w: 90, h: 140, label: "Person", confidence: 0.87, injured: true },
  { x: 130, y: 30, w: 90, h: 140, label: "Person", confidence: 0.91, injured: true },
  { x: 130, y: 30, w: 90, h: 140, label: "Person", confidence: 0.89, injured: true },
  null,
  null,
];

export default function VideoFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detection, setDetection] = useState<Detection | null>(null);
  const [hasCamera, setHasCamera] = useState(false);
  const seqIdx = useRef(0);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 400, height: 300 } })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
        }
      })
      .catch(() => setHasCamera(false));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDetection(MOCK_SEQUENCE[seqIdx.current % MOCK_SEQUENCE.length]);
      seqIdx.current++;
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, w, h);

    if (!detection) return;

    const color = detection.injured ? "#ef4444" : "#22c55e";
    const bLen = 14;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(detection.x, detection.y, detection.w, detection.h);

    ctx.setLineDash([]);
    ctx.lineWidth = 2.5;
    const corners = [
      [detection.x, detection.y, 1, 1],
      [detection.x + detection.w, detection.y, -1, 1],
      [detection.x, detection.y + detection.h, 1, -1],
      [detection.x + detection.w, detection.y + detection.h, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + bLen * dy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + bLen * dx, cy);
      ctx.stroke();
    }

    const text = `${detection.label} · ${detection.injured ? "INJURED" : "OK"} · ${(detection.confidence * 100).toFixed(0)}%`;
    ctx.font = "bold 10px monospace";
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = color;
    ctx.fillRect(detection.x, detection.y - 18, tw + 10, 16);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, detection.x + 5, detection.y - 6);
  }, [detection]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  return (
    <div className="relative h-full bg-panel rounded-lg border border-border overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-[10px] font-mono text-accent/60 uppercase tracking-widest">
          Robot Camera — CV Active
        </span>
        <span
          className={`text-[10px] font-mono ${detection ? "text-amber-400" : "text-foreground/30"}`}
        >
          {detection ? "● DETECTION" : "○ SCANNING"}
        </span>
      </div>
      <div className="relative flex-1 bg-black overflow-hidden">
        {hasCamera ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs font-mono text-foreground/20">
              AWAITING CAMERA FEED
            </span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none"
          style={{ animation: "scan 3s linear infinite" }}
        />
      </div>
    </div>
  );
}
