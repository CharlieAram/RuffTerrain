export const ROWS = 20;
export const COLS = 32;

export const AREA = {
  north: 34.068,
  south: 34.032,
  west: -118.590,
  east: -118.528,
};

// Irregular polygon tracing the woodland / wildfire search perimeter
// across Pacific Palisades hill terrain — ridgelines, canyons, and
// the wildland-urban interface along the southern edge.
export const SEARCH_ZONE: [number, number][] = [
  // Northern ridgeline — jagged peaks and saddles (west → east)
  [34.0648, -118.5852],
  [34.0672, -118.5810],
  [34.0650, -118.5772],
  [34.0678, -118.5728],
  [34.0655, -118.5685],
  [34.0676, -118.5642],
  [34.0662, -118.5598],
  [34.0680, -118.5552],
  [34.0665, -118.5508],
  [34.0672, -118.5462],
  [34.0652, -118.5420],
  [34.0638, -118.5378],

  // Northeast descent into canyons
  [34.0615, -118.5348],
  [34.0588, -118.5332],
  [34.0570, -118.5350],
  [34.0548, -118.5322],
  [34.0522, -118.5308],

  // East edge — irregular canyon mouths
  [34.0490, -118.5312],
  [34.0458, -118.5328],
  [34.0430, -118.5345],

  // South — wildland-urban interface
  [34.0402, -118.5370],
  [34.0388, -118.5405],
  [34.0370, -118.5438],
  [34.0380, -118.5465],
  [34.0355, -118.5498],
  [34.0342, -118.5535],
  [34.0335, -118.5572],
  [34.0340, -118.5618],
  [34.0335, -118.5655],
  [34.0350, -118.5690],

  // Southwest — canyon country
  [34.0368, -118.5722],
  [34.0390, -118.5758],
  [34.0410, -118.5788],

  // West edge — moderately irregular
  [34.0442, -118.5812],
  [34.0478, -118.5830],
  [34.0510, -118.5845],
  [34.0545, -118.5858],
  [34.0575, -118.5865],
  [34.0608, -118.5868],
  [34.0632, -118.5862],
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
