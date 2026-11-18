/**
 * Builds the film places map's data from Natural Earth (public domain, naturalearthdata.com):
 *   lib/countries-data.ts   every country's code, name, centre and bounding box (lon/lat), for
 *                           checking and picking places; includes the ones too small to draw
 *   lib/world-map-paths.ts  simplified, projected outlines for the map (only the /map page loads it)
 * Run with: npm run generate-world-map
 * One-off: the output is committed. Re-run only to change the simplification or the projection.
 */

import { writeFileSync } from 'node:fs';
import { MAP_HEIGHT, MAP_WIDTH, project } from '../lib/world-map';

const BASE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
// 110m outlines are drawn; 50m adds the countries too small for that scale (Singapore, Malta…)
const DRAWN_URL = `${BASE}/ne_110m_admin_0_countries.geojson`;
const DETAILED_URL = `${BASE}/ne_50m_admin_0_countries.geojson`;

// Douglas-Peucker tolerance and the smallest island kept, in map units (the map is 1000 wide)
const TOLERANCE = 0.45;
const MIN_RING_AREA = 1.2;

// Regions without their own ISO code are drawn as part of the country they're commonly shown with
const MERGE_INTO: Record<string, string> = { 'N. Cyprus': 'CY', Somaliland: 'SO' };
// Natural Earth's English names, where a shorter or more usual one reads better in the app
const NAME_OVERRIDES: Record<string, string> = {
  US: 'United States',
  CN: 'China',
  BS: 'Bahamas',
  GM: 'Gambia',
  CI: "Côte d'Ivoire",
  CD: 'DR Congo',
  CG: 'Republic of the Congo',
  CZ: 'Czechia',
  MK: 'North Macedonia',
  SZ: 'Eswatini',
  TL: 'Timor-Leste',
  FM: 'Micronesia',
  VA: 'Vatican City',
  MO: 'Macao',
};
const SKIP = new Set(['AQ', 'TF', 'HM', 'GS', 'IO']); // Antarctica and uninhabited southern islands

type Position = [number, number];
type Ring = Position[];
interface Feature {
  properties: Record<string, any>;
  geometry: { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };
}

async function load(url: string): Promise<Feature[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.json()).features;
}

function polygonsOf(feature: Feature): Ring[][] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}

function codeOf(feature: Feature): string | null {
  const name = feature.properties.NAME as string;
  if (MERGE_INTO[name]) return MERGE_INTO[name];
  const code = feature.properties.ISO_A2_EH as string;
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

function bboxOf(rings: Ring[]): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  return [w, s, e, n].map((value) => Math.round(value * 100) / 100) as [number, number, number, number];
}

function area(points: Position[]): number {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  }
  return Math.abs(sum / 2);
}

function simplify(points: Position[], tolerance: number): Position[] {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = points[first];
    const [bx, by] = points[last];
    const length = Math.hypot(bx - ax, by - ay);
    let index = -1;
    let max = tolerance;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const distance =
        length === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length;
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** A ring as a compact SVG subpath: absolute start, then relative steps in tenths of a unit */
function toPath(points: Position[]): string {
  const tenths = points.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)]);
  const steps: string[] = [];
  for (let i = 1; i < tenths.length; i++) {
    const dx = tenths[i][0] - tenths[i - 1][0];
    const dy = tenths[i][1] - tenths[i - 1][1];
    if (dx || dy) steps.push(`${dx / 10} ${dy / 10}`.replace(/(^| )(-?)0\./g, '$1$2.'));
  }
  if (steps.length < 2) return '';
  return `M${tenths[0][0] / 10} ${tenths[0][1] / 10}l${steps.join(' ')}z`;
}

async function main() {
  const [drawn, detailed] = await Promise.all([load(DRAWN_URL), load(DETAILED_URL)]);

  interface Entry {
    code: string;
    name: string;
    center: [number, number];
    bbox: [number, number, number, number];
    paths: string[];
    main: { area: number; box: [number, number, number, number] } | null;
  }
  const countries = new Map<string, Entry>();

  // Regions merged into a country come after it, so the country's own name and centre are kept
  const isMerged = (feature: Feature) => feature.properties.NAME in MERGE_INTO;
  const ordered = [...drawn.filter((f) => !isMerged(f)), ...drawn.filter(isMerged)];

  for (const feature of ordered) {
    const code = codeOf(feature);
    if (!code || SKIP.has(code)) continue;
    const box = bboxOf(polygonsOf(feature).map((polygon) => polygon[0]));
    const merged = countries.get(code);
    if (merged) {
      merged.bbox = [
        Math.min(merged.bbox[0], box[0]),
        Math.min(merged.bbox[1], box[1]),
        Math.max(merged.bbox[2], box[2]),
        Math.max(merged.bbox[3], box[3]),
      ];
    }
    const entry: Entry = merged ?? {
      code,
      name: NAME_OVERRIDES[code] ?? feature.properties.NAME_EN,
      center: [Math.round(feature.properties.LABEL_X * 100) / 100, Math.round(feature.properties.LABEL_Y * 100) / 100],
      bbox: box,
      paths: [],
      main: null,
    };
    for (const polygon of polygonsOf(feature)) {
      // Outer rings only: lakes are too small to see at this scale
      const projected = polygon[0].map(([lon, lat]) => project(lon, Math.max(Math.min(lat, 84), -60)));
      const ringArea = area(projected);
      const xs = projected.map(([x]) => x);
      const ys = projected.map(([, y]) => y);
      const box: [number, number, number, number] = [
        Math.round(Math.min(...xs)),
        Math.round(Math.min(...ys)),
        Math.round(Math.max(...xs)),
        Math.round(Math.max(...ys)),
      ];
      if (!entry.main || ringArea > entry.main.area) entry.main = { area: ringArea, box };
      if (ringArea < MIN_RING_AREA) continue;
      const path = toPath(simplify(projected, TOLERANCE));
      if (path) entry.paths.push(path);
    }
    countries.set(code, entry);
  }

  // Too small to draw at 110m (Singapore, Malta…): no outline, but a centre and box so places
  // there can still be picked, checked and pinned
  for (const feature of detailed) {
    const code = codeOf(feature);
    if (!code || SKIP.has(code)) continue;
    const detailedBox = bboxOf(polygonsOf(feature).map((polygon) => polygon[0]));
    const known = countries.get(code);
    if (known) {
      // The 110m outlines leave out small islands (the Azores, Madeira), so the box used to check
      // places takes the detailed geometry as well; the drawn outline stays at 110m
      known.bbox = [
        Math.min(known.bbox[0], detailedBox[0]),
        Math.min(known.bbox[1], detailedBox[1]),
        Math.max(known.bbox[2], detailedBox[2]),
        Math.max(known.bbox[3], detailedBox[3]),
      ];
      continue;
    }
    if (MERGE_INTO[feature.properties.NAME]) continue;
    countries.set(code, {
      code,
      name: NAME_OVERRIDES[code] ?? feature.properties.NAME_EN,
      center: [Math.round(feature.properties.LABEL_X * 100) / 100, Math.round(feature.properties.LABEL_Y * 100) / 100],
      bbox: detailedBox,
      paths: [],
      main: null,
    });
  }

  const sorted = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const header = `// Generated by scripts/generate-world-map.ts from Natural Earth (public domain). Don't edit by hand.\n`;

  const data =
    header +
    `// Every country a film can be set in: ISO 3166-1 alpha-2 code (XK for Kosovo), English name, label\n` +
    `// point [lon, lat] and bounding box [west, south, east, north]. drawn: has an outline on the map.\n\n` +
    `export interface CountryData {\n  code: string;\n  name: string;\n  center: [number, number];\n  bbox: [number, number, number, number];\n  drawn: boolean;\n}\n\n` +
    `export const COUNTRY_DATA: CountryData[] = [\n` +
    sorted
      .map(
        (c) =>
          `  { code: '${c.code}', name: ${JSON.stringify(c.name)}, center: [${c.center.join(', ')}], bbox: [${c.bbox.join(', ')}], drawn: ${c.paths.length > 0} },`
      )
      .join('\n') +
    `\n];\n`;
  writeFileSync('lib/countries-data.ts', data);

  const shapes = sorted.filter((c) => c.paths.length > 0);
  const paths =
    header +
    `// Country outlines for the map, projected with project() in lib/world-map.ts onto a\n` +
    `// ${MAP_WIDTH}×${MAP_HEIGHT} viewBox. main: bounding box of the largest landmass [x0, y0, x1, y1],\n` +
    `// for framing a country without its far-off islands (France without French Guiana).\n\n` +
    `export const COUNTRY_SHAPES: Array<{ code: string; d: string; main: [number, number, number, number] }> = [\n` +
    shapes.map((c) => `  { code: '${c.code}', main: [${c.main!.box.join(', ')}], d: '${c.paths.join('')}' },`).join('\n') +
    `\n];\n`;
  writeFileSync('lib/world-map-paths.ts', paths);

  console.log(`${sorted.length} countries, ${shapes.length} drawn`);
  console.log(`lib/countries-data.ts ${(data.length / 1024).toFixed(1)} KB, lib/world-map-paths.ts ${(paths.length / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
