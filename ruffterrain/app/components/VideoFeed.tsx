"use client";

import { useRef, useEffect, useState } from "react";

export interface PersonDetection {
  confidence: number;
  injured: boolean;
  bbox: { x: number; y: number; w: number; h: number };
}

interface CocoSsdPrediction {
  class: string;
  score: number;
  bbox: [number, number, number, number];
}

interface Props {
  onDetection?: (detections: PersonDetection[]) => void;
}

export default function VideoFeed({ onDetection }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<{ detect: (video: HTMLVideoElement) => Promise<CocoSsdPrediction[]> } | null>(null);
  const animRef = useRef<number>(0);
  const lastDetectTime = useRef(0);
  const onDetectionRef = useRef(onDetection);
  onDetectionRef.current = onDetection;

  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hasCamera, setHasCamera] = useState(false);
  const [detectionCount, setDetectionCount] = useState(0);
  const [hasInjured, setHasInjured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await import("@tensorflow/tfjs");
        const cocoSsd = await import("@tensorflow-models/coco-ssd");
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (!cancelled) {
          modelRef.current = model;
          setModelStatus("ready");
        }
      } catch (e) {
        console.error("[CV] Model load failed:", e);
        if (!cancelled) setModelStatus("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasCamera(true);
        }
      })
      .catch((err) => {
        console.error("[Camera] getUserMedia failed:", err);
        setHasCamera(false);
      });
  }, []);

  useEffect(() => {
    if (modelStatus !== "ready" || !hasCamera) return;

    const detect = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const model = modelRef.current;

      if (!video || !canvas || !model || video.readyState < 2) {
        animRef.current = requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      if (now - lastDetectTime.current < 150) {
        animRef.current = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      try {
        const predictions = await model.detect(video);
        const people = predictions.filter(
          (p) => p.class === "person" && p.score > 0.45
        );

        const cw = canvas.offsetWidth;
        const ch = canvas.offsetHeight;
        canvas.width = cw * 2;
        canvas.height = ch * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        ctx.clearRect(0, 0, cw, ch);

        const scaleX = cw / video.videoWidth;
        const scaleY = ch / video.videoHeight;
        const detections: PersonDetection[] = [];

        for (const pred of people) {
          const [bx, by, bw, bh] = pred.bbox;
          const sx = bx * scaleX;
          const sy = by * scaleY;
          const sw = bw * scaleX;
          const sh = bh * scaleY;

          // Person must be clearly horizontal (lying down) to flag as potentially injured
          const injured = bw / bh > 1.5;

          detections.push({
            confidence: pred.score,
            injured,
            bbox: { x: sx, y: sy, w: sw, h: sh },
          });

          drawDetectionBox(ctx, sx, sy, sw, sh, injured, pred.score);
        }

        setDetectionCount(detections.length);
        setHasInjured(detections.some((d) => d.injured));

        if (detections.length > 0) {
          onDetectionRef.current?.(detections);
        }
      } catch {
        // skip frame on error
      }

      animRef.current = requestAnimationFrame(detect);
    };

    animRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(animRef.current);
  }, [modelStatus, hasCamera]);

  return (
    <div className="relative h-full bg-panel rounded-lg border border-border overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <span className="text-xs font-mono text-accent uppercase tracking-widest">
          Camera — CV{" "}
          {modelStatus === "ready"
            ? "Active"
            : modelStatus === "loading"
              ? "Loading\u2026"
              : "Error"}
        </span>
        <span
          className={`text-xs font-mono ${
            detectionCount > 0 ? "text-amber-400" : "text-foreground/50"
          }`}
        >
          {detectionCount > 0
            ? `● ${detectionCount} DETECTED`
            : "○ SCANNING"}
        </span>
      </div>

      <div className="relative flex-1 bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-cover ${hasCamera ? "" : "hidden"}`}
        />

        {!hasCamera && (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-sm font-mono text-zinc-500">
              AWAITING CAMERA FEED
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {modelStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <span className="text-sm font-mono text-cyan-300 animate-pulse">
              Loading CV Model&hellip;
            </span>
          </div>
        )}

        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none"
          style={{ animation: "scan 3s linear infinite" }}
        />

        {hasInjured && (
          <div className="absolute bottom-0 inset-x-0 px-4 py-2 bg-red-600/90 text-white text-xs font-mono text-center uppercase tracking-wider animate-pulse">
            ⚠ Potentially Injured Person Detected
          </div>
        )}
      </div>
    </div>
  );
}

function drawDetectionBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  injured: boolean,
  score: number
) {
  const color = injured ? "#ef4444" : "#22c55e";

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, h);

  ctx.setLineDash([]);
  ctx.lineWidth = 2.5;
  const bLen = Math.min(16, w * 0.2, h * 0.2);
  const corners: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + bLen * dy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + bLen * dx, cy);
    ctx.stroke();
  }

  const label = injured
    ? `POTENTIALLY INJURED ${(score * 100).toFixed(0)}%`
    : `OK ${(score * 100).toFixed(0)}%`;
  ctx.font = "bold 11px monospace";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = color + "cc";
  ctx.fillRect(x, y - 20, tw + 12, 18);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 6, y - 6);
}
