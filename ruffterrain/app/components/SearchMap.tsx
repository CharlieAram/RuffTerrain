"use client";

import { MapContainer, TileLayer, Rectangle, CircleMarker, Polygon } from "react-leaflet";
import type { LatLngBoundsExpression, PathOptions } from "leaflet";
import "leaflet/dist/leaflet.css";
import { AREA, SEARCH_ZONE, CELL_MASK } from "@/lib/searchZone";

export type CellState = "danger" | "clear" | "person-injured" | "person-ok";

interface Props {
  grid: CellState[][];
  robotPos: { x: number; y: number };
  rows: number;
  cols: number;
}

const CELL_STYLE: Record<CellState, PathOptions> = {
  danger: { color: "transparent", fillColor: "#dc2626", fillOpacity: 0.20, weight: 0 },
  clear: { color: "transparent", fillColor: "#22c55e", fillOpacity: 0.12, weight: 0 },
  "person-injured": { color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.50, weight: 1.5 },
  "person-ok": { color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.40, weight: 1.5 },
};

export default function SearchMap({ grid, robotPos, rows, cols }: Props) {
  const cellW = (AREA.east - AREA.west) / cols;
  const cellH = (AREA.north - AREA.south) / rows;

  const center: [number, number] = [
    (AREA.north + AREA.south) / 2,
    (AREA.east + AREA.west) / 2,
  ];

  const robotLatLng: [number, number] = [
    AREA.north - (robotPos.y + 0.5) * cellH,
    AREA.west + (robotPos.x + 0.5) * cellW,
  ];

  return (
    <MapContainer
      center={center}
      zoom={14}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

      {/* Search zone perimeter */}
      <Polygon
        positions={SEARCH_ZONE}
        pathOptions={{
          color: "#f97316",
          weight: 2.5,
          fill: false,
          opacity: 0.85,
        }}
      />

      {/* Grid cells (only inside polygon) */}
      {grid.flatMap((row, y) =>
        row.map((cell, x) => {
          if (!CELL_MASK[y]?.[x]) return null;
          const bounds: LatLngBoundsExpression = [
            [AREA.north - (y + 1) * cellH, AREA.west + x * cellW],
            [AREA.north - y * cellH, AREA.west + (x + 1) * cellW],
          ];
          return (
            <Rectangle
              key={`${x}-${y}`}
              bounds={bounds}
              pathOptions={CELL_STYLE[cell]}
            />
          );
        })
      )}

      {/* Robot marker */}
      <CircleMarker
        center={robotLatLng}
        radius={7}
        pathOptions={{
          color: "#22d3ee",
          fillColor: "#22d3ee",
          fillOpacity: 0.9,
          weight: 2,
        }}
      />
    </MapContainer>
  );
}
