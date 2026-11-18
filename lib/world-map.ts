// Geometry for the film places map: the projection shared by scripts/generate-world-map.ts (which
// draws the countries) and the pins, and the pure framing and clustering logic the map component
// uses. No data, no DOM: the country table is lib/countries.ts, the outlines lib/world-map-paths.ts.

// Equal Earth (Šavrič, Patterson & Jenny, 2018): an equal-area projection that keeps the continents
// recognisable, so the spread of films isn't distorted toward the poles as on Web Mercator.
const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;

function equalEarth(lon: number, lat: number): [number, number] {
  const lambda = (lon * Math.PI) / 180;
  const theta = Math.asin(M * Math.sin((lat * Math.PI) / 180));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const x = (lambda * Math.cos(theta)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)));
  const y = theta * (A1 + A2 * t2 + t6 * (A3 + A4 * t2));
  return [x, y];
}

// The map shows latitudes NORTH…SOUTH: below that is ocean and Antarctica, above it only the Arctic
// islands, and leaving them out gives the inhabited world more of a phone's small screen
const NORTH = 78;
const SOUTH = -56;
const X_EDGE = equalEarth(180, 0)[0];
const Y_TOP = equalEarth(0, NORTH)[1];
const Y_BOTTOM = equalEarth(0, SOUTH)[1];

/** Width of the map in viewBox units; the height follows from the projection */
export const MAP_WIDTH = 1000;
const SCALE = MAP_WIDTH / (2 * X_EDGE);
export const MAP_HEIGHT = Math.round((Y_TOP - Y_BOTTOM) * SCALE * 10) / 10;

/** A longitude/latitude as a point on the map, in viewBox units (y grows downward) */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = equalEarth(lon, lat);
  return [(x + X_EDGE) * SCALE, (Y_TOP - y) * SCALE];
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const WORLD: ViewBox = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };

// The closest the map frames a set of places on its own: about the width of Western Europe, so a
// single film doesn't fill the screen. Zooming by hand can go closer, to MIN_ZOOM_SPAN; past that
// the simplified outlines get too coarse to read.
const MIN_SPAN = 90;
export const MIN_ZOOM_SPAN = 30;

/**
 * A view of the map with the given width:height `aspect` that frames `points` with some room
 * around them, never closer than MIN_SPAN, kept inside the map where it fits. With no points,
 * the whole world.
 */
export function fitViewBox(points: Array<[number, number]>, aspect: number, minSpan = MIN_SPAN): ViewBox {
  if (points.length === 0) {
    return frameAt(MAP_WIDTH / 2, MAP_HEIGHT / 2, MAP_WIDTH, MAP_HEIGHT, aspect);
  }
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  // Room for the pins themselves and their labels at the edges
  const padX = Math.max((maxX - minX) * 0.15, 12);
  const padY = Math.max((maxY - minY) * 0.15, 12);
  const w = Math.max(maxX - minX + 2 * padX, minSpan);
  const h = Math.max(maxY - minY + 2 * padY, minSpan / aspect);
  return frameAt((minX + maxX) / 2, (minY + maxY) / 2, w, h, aspect);
}

/** The smallest view of `aspect` centred on (cx, cy) that covers w×h, moved inside the map when it fits */
function frameAt(cx: number, cy: number, w: number, h: number, aspect: number): ViewBox {
  let width = w;
  let height = h;
  if (width / height < aspect) {
    width = height * aspect;
  } else {
    height = width / aspect;
  }
  // Never wider than the whole world: past that it only adds empty sea at the sides
  if (width > MAP_WIDTH) {
    width = MAP_WIDTH;
    height = width / aspect;
  }
  return {
    x: clampStart(cx - width / 2, width, MAP_WIDTH),
    y: clampStart(cy - height / 2, height, MAP_HEIGHT),
    w: width,
    h: height,
  };
}

function clampStart(start: number, size: number, total: number): number {
  if (size >= total) return (total - size) / 2;
  return Math.min(Math.max(start, 0), total - size);
}

/**
 * The view zoomed by `factor` (above 1 zooms in) around the map point (px, py), which stays where it
 * is on screen, kept between MIN_ZOOM_SPAN and the width of the world, and over the map.
 */
export function zoomView(view: ViewBox, factor: number, px: number, py: number): ViewBox {
  const aspect = view.w / view.h;
  const w = Math.min(Math.max(view.w / factor, MIN_ZOOM_SPAN), MAP_WIDTH);
  const scale = w / view.w;
  return clampView({ x: px - (px - view.x) * scale, y: py - (py - view.y) * scale, w, h: w / aspect });
}

/** The view moved so the map's centre stays inside it: no panning off into empty sea */
export function clampView(view: ViewBox): ViewBox {
  const cx = Math.min(Math.max(view.x + view.w / 2, 0), MAP_WIDTH);
  const cy = Math.min(Math.max(view.y + view.h / 2, 0), MAP_HEIGHT);
  return { ...view, x: cx - view.w / 2, y: cy - view.h / 2 };
}

/** Where a map point appears in a frame `widthPx` wide showing `view`, in CSS pixels */
export function toScreen([x, y]: [number, number], view: ViewBox, widthPx: number): [number, number] {
  const scale = widthPx / view.w;
  return [(x - view.x) * scale, (y - view.y) * scale];
}

export interface Pin {
  id: string;
  point: [number, number]; // Map units, from project()
}

export interface Cluster {
  ids: string[];
  point: [number, number]; // The mean of its pins
}

// Pins nearer than this on screen merge: 44px touch targets need about this much room
const CLUSTER_PX = 36;

/**
 * Pins as they can be tapped in a frame `widthPx` wide showing `view`: each one alone, or merged
 * with the pins too close to tell apart into one numbered cluster. Zooming in splits a cluster.
 * Deterministic: the same pins and view always give the same clusters.
 */
export function clusterPins(pins: Pin[], view: ViewBox, widthPx: number): Cluster[] {
  const scale = widthPx / view.w;
  const sorted = [...pins].sort((a, b) => a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.id.localeCompare(b.id));
  const clusters: Array<{ ids: string[]; sumX: number; sumY: number }> = [];
  for (const pin of sorted) {
    const near = clusters.find((cluster) => {
      const dx = (cluster.sumX / cluster.ids.length - pin.point[0]) * scale;
      const dy = (cluster.sumY / cluster.ids.length - pin.point[1]) * scale;
      return Math.hypot(dx, dy) < CLUSTER_PX;
    });
    if (near) {
      near.ids.push(pin.id);
      near.sumX += pin.point[0];
      near.sumY += pin.point[1];
    } else {
      clusters.push({ ids: [pin.id], sumX: pin.point[0], sumY: pin.point[1] });
    }
  }
  // A cluster's centre moves as pins join it, which can leave it overlapping a pin or cluster it
  // was clear of; merge those too, until every marker on screen has room to be tapped
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i];
        const b = clusters[j];
        const dx = (a.sumX / a.ids.length - b.sumX / b.ids.length) * scale;
        const dy = (a.sumY / a.ids.length - b.sumY / b.ids.length) * scale;
        if (Math.hypot(dx, dy) < CLUSTER_PX) {
          a.ids.push(...b.ids);
          a.sumX += b.sumX;
          a.sumY += b.sumY;
          clusters.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return clusters.map((cluster) => ({
    ids: cluster.ids,
    point: [cluster.sumX / cluster.ids.length, cluster.sumY / cluster.ids.length],
  }));
}

/** Points in between two views, for animating a move (t from 0 to 1, eased) */
export function interpolateView(from: ViewBox, to: ViewBox, t: number): ViewBox {
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const mix = (a: number, b: number) => a + (b - a) * eased;
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h) };
}

/** Great-circle distance in km, for checking a geocoder hit against the model's estimate */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}
