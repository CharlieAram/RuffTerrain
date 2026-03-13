export const ROWS = 10;
export const COLS = 16;

export const AREA = {
  north: 34.068,
  south: 34.032,
  west: -118.590,
  east: -118.528,
};

// Irregular polygon representing the wildfire search perimeter
export const SEARCH_ZONE: [number, number][] = [
  [34.064, -118.582],
  [34.067, -118.568],
  [34.066, -118.550],
  [34.063, -118.538],
  [34.056, -118.531],
  [34.046, -118.530],
  [34.038, -118.536],
  [34.034, -118.548],
  [34.033, -118.565],
  [34.036, -118.576],
  [34.043, -118.584],
  [34.055, -118.586],
];

function pointInPolygon(lat: number, lng: number, poly: [number, number][]): boolean {
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
  })
);

export const ACTIVE_CELLS = CELL_MASK.flat().filter(Boolean).length;
