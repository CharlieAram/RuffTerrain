export const ROWS = 12;
export const COLS = 12;

// Small forest clearing near Temescal Canyon, Pacific Palisades (~65 m × 60 m)
export const AREA = {
  north: 34.04930,
  south: 34.04870,
  west: -118.53430,
  east: -118.53360,
};

// Trail / fire-road paths through the search area (drawn as map polylines)
export const TRAILS: [number, number][][] = [
  // Main fire road — NW to SE diagonal
  [
    [34.04925, -118.53425],
    [34.04918, -118.53412],
    [34.04908, -118.53398],
    [34.04898, -118.53388],
    [34.04888, -118.53378],
    [34.04878, -118.53370],
  ],
  // Cross trail — SW to NE
  [
    [34.04878, -118.53420],
    [34.04888, -118.53408],
    [34.04898, -118.53398],
    [34.04910, -118.53386],
    [34.04920, -118.53375],
    [34.04928, -118.53365],
  ],
];

// Search perimeter aligned with trail corridor (irregular to follow terrain)
export const SEARCH_ZONE: [number, number][] = [
  // NW edge — tree line above main road
  [34.04927, -118.53428],
  [34.04928, -118.53412],
  [34.04929, -118.53398],
  // N edge — clearing boundary
  [34.04927, -118.53385],
  [34.04925, -118.53372],
  // NE corner
  [34.04920, -118.53364],
  [34.04912, -118.53362],
  // E edge — canyon rim
  [34.04902, -118.53363],
  [34.04892, -118.53362],
  [34.04882, -118.53364],
  // SE corner
  [34.04875, -118.53368],
  [34.04873, -118.53378],
  // S edge — drainage line
  [34.04872, -118.53392],
  [34.04874, -118.53406],
  // SW corner
  [34.04876, -118.53418],
  [34.04880, -118.53426],
  // W edge — ridge line
  [34.04890, -118.53429],
  [34.04900, -118.53430],
  [34.04912, -118.53430],
  [34.04922, -118.53429],
];

function pointInPolygon(
  lat: number,
  lng: number,
  poly: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const cellW = (AREA.east - AREA.west) / COLS;
const cellH = (AREA.north - AREA.south) / ROWS;

export const CELL_MASK: boolean[][] = Array.from({ length: ROWS }, (_, y) =>
  Array.from({ length: COLS }, (_, x) => {
    const lat = AREA.north - (y + 0.5) * cellH;
    const lng = AREA.west + (x + 0.5) * cellW;
    return pointInPolygon(lat, lng, SEARCH_ZONE);
  }),
);

export const ACTIVE_CELLS = CELL_MASK.flat().filter(Boolean).length;
