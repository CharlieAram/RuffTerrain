"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface CVDetection {
  bbox: [number, number, number, number];
  label: "OK" | "INJURED";
  confidence: number;
}

export interface BackendState {
  connected: boolean;
  robotConnected: boolean;
  cameraSource: string;
  frame: string | null;
  detections: CVDetection[];
  sendCommand: (command: string) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_BACKEND_WS ?? "ws://localhost:8000/ws";

export function useBackend(): BackendState {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [robotConnected, setRobotConnected] = useState(false);
  const [cameraSource, setCameraSource] = useState("none");
  const [frame, setFrame] = useState<string | null>(null);
  const [detections, setDetections] = useState<CVDetection[]>([]);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "frame") {
            if (msg.frame) setFrame(msg.frame);
            if (msg.detections) setDetections(msg.detections);
            if (msg.camera_source) setCameraSource(msg.camera_source);
          } else if (msg.type === "status") {
            setRobotConnected(msg.robot_connected ?? false);
            setCameraSource(msg.camera_source ?? "none");
          }
        } catch {
          /* ignore malformed messages */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    } catch {
      reconnectTimer.current = setTimeout(connect, 3000);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendCommand = useCallback((command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", command }));
    }
  }, []);

  return {
    connected,
    robotConnected,
    cameraSource,
    frame,
    detections,
    sendCommand,
  };
}
