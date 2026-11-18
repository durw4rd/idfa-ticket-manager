import { describe, expect, it } from 'vitest';
import { clampView, clusterPins, fitViewBox, MAP_HEIGHT, MAP_WIDTH, MIN_ZOOM_SPAN, project, WORLD, zoomView, type Pin } from './world-map';
import { countryByCode, inCountryBox } from './countries';

describe('project', () => {
  it('puts the prime meridian and the equator where expected', () => {
    const [x] = project(0, 0);
    expect(x).toBeCloseTo(MAP_WIDTH / 2, 5);
    expect(project(-180, 0)[0]).toBeCloseTo(0, 5);
    expect(project(180, 0)[0]).toBeCloseTo(MAP_WIDTH, 5);
  });

  it('keeps north up and the cropped latitudes on the map', () => {
    const [, amsterdam] = project(4.9, 52.37);
    const [, sydney] = project(151.2, -33.87);
    expect(amsterdam).toBeLessThan(sydney);
    expect(project(0, 78)[1]).toBeCloseTo(0, 5);
    expect(project(0, -56)[1]).toBeCloseTo(MAP_HEIGHT, 0);
  });
});

describe('fitViewBox', () => {
  const ASPECT = 3 / 2;

  it('shows the whole world, at the frame aspect, when there are no pins', () => {
    const view = fitViewBox([], ASPECT);
    expect(view.w).toBe(MAP_WIDTH);
    expect(view.w / view.h).toBeCloseTo(ASPECT);
    // Centred on the map, the extra height split above and below
    expect(view.y + view.h / 2).toBeCloseTo(MAP_HEIGHT / 2);
  });

  it('never zooms closer than the minimum span around a single pin', () => {
    const view = fitViewBox([project(69.17, 34.53)], ASPECT);
    expect(view.w).toBeGreaterThanOrEqual(90);
    expect(view.w / view.h).toBeCloseTo(ASPECT);
  });

  it('frames every pin with room to spare and keeps inside the map', () => {
    const points = [project(4.9, 52.37), project(-9.15, 38.72), project(35.2, 31.8)];
    const view = fitViewBox(points, ASPECT);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThan(view.x);
      expect(x).toBeLessThan(view.x + view.w);
      expect(y).toBeGreaterThan(view.y);
      expect(y).toBeLessThan(view.y + view.h);
    }
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
    expect(view.x + view.w).toBeLessThanOrEqual(MAP_WIDTH);
  });

  it('caps at the width of the world for pins far apart', () => {
    const view = fitViewBox([project(-170, 60), project(175, -40)], ASPECT);
    expect(view.w).toBe(MAP_WIDTH);
  });
});

describe('clusterPins', () => {
  const pins: Pin[] = [
    { id: 'amsterdam', point: project(4.9, 52.37) },
    { id: 'rotterdam', point: project(4.48, 51.92) },
    { id: 'kabul', point: project(69.17, 34.53) },
  ];

  it('merges pins too close to tap apart at world zoom', () => {
    const clusters = clusterPins(pins, WORLD, 375);
    expect(clusters).toHaveLength(2);
    expect(clusters.find((c) => c.ids.length === 2)?.ids.sort()).toEqual(['amsterdam', 'rotterdam']);
  });

  it('splits them when zoomed in far enough', () => {
    const [amsterdam, rotterdam] = pins;
    const view = { x: amsterdam.point[0] - 2, y: amsterdam.point[1] - 2, w: 4, h: 4 };
    expect(clusterPins([amsterdam, rotterdam], view, 375)).toHaveLength(2);
  });

  it('leaves no two markers too close to tap apart, even when a cluster centre drifts', () => {
    // Gaza, Jerusalem, Beirut, Baghdad, Tehran, Kharkiv: the case that left Gaza under a cluster
    const middleEast: Pin[] = [
      [34.47, 31.5],
      [35.21, 31.77],
      [35.5, 33.89],
      [47, 31],
      [51.42, 35.69],
      [36.23, 49.99],
    ].map(([lon, lat], i) => ({ id: String(i), point: project(lon, lat) }));
    for (const width of [320, 375, 390]) {
      const clusters = clusterPins(middleEast, WORLD, width);
      const scale = width / WORLD.w;
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const gap = Math.hypot(clusters[i].point[0] - clusters[j].point[0], clusters[i].point[1] - clusters[j].point[1]) * scale;
          expect(gap).toBeGreaterThanOrEqual(36);
        }
      }
      expect(clusters.flatMap((c) => c.ids).sort()).toEqual(['0', '1', '2', '3', '4', '5']);
    }
  });

  it('gives the same clusters whatever order the pins come in', () => {
    const a = clusterPins(pins, WORLD, 375).map((c) => c.ids.sort().join());
    const b = clusterPins([...pins].reverse(), WORLD, 375).map((c) => c.ids.sort().join());
    expect(b.sort()).toEqual(a.sort());
  });
});

describe('countries', () => {
  it('knows the codes the generated table had to map by hand', () => {
    expect(countryByCode('ps')?.name).toBe('Palestine');
    expect(countryByCode('XK')?.name).toBe('Kosovo');
    expect(countryByCode('FR')?.drawn).toBe(true);
    expect(countryByCode('NO')?.drawn).toBe(true);
    expect(countryByCode('CY')?.name).toBe('Cyprus');
    // Too small to draw, but still a place a film can be set
    expect(countryByCode('SG')?.drawn).toBe(false);
    expect(countryByCode('ZZ')).toBeNull();
  });

  it('accepts points in or just off a country and rejects ones elsewhere', () => {
    expect(inCountryBox('AF', 34.53, 69.17)).toBe(true);
    expect(inCountryBox('PT', 38.72, -9.15)).toBe(true);
    expect(inCountryBox('PT', 34.53, 69.17)).toBe(false);
    expect(inCountryBox('ZZ', 0, 0)).toBe(false);
    expect(inCountryBox('AF', NaN, 69)).toBe(false);
  });
});

describe('zoomView', () => {
  const view = { x: 400, y: 100, w: 200, h: 150 };

  it('keeps the point zoomed around in the same place on screen', () => {
    const [px, py] = [450, 130];
    const zoomed = zoomView(view, 2, px, py);
    expect(zoomed.w).toBe(100);
    expect((px - zoomed.x) / zoomed.w).toBeCloseTo((px - view.x) / view.w);
    expect((py - zoomed.y) / zoomed.h).toBeCloseTo((py - view.y) / view.h);
    expect(zoomed.w / zoomed.h).toBeCloseTo(view.w / view.h);
  });

  it('stops at the closest zoom and at the width of the world', () => {
    expect(zoomView(view, 1000, 500, 175).w).toBe(MIN_ZOOM_SPAN);
    expect(zoomView(view, 0.001, 500, 175).w).toBe(MAP_WIDTH);
  });
});

describe('clampView', () => {
  it('pulls a view panned off the map back so the map stays in it', () => {
    const clamped = clampView({ x: 5000, y: -900, w: 100, h: 75 });
    expect(clamped.x + clamped.w / 2).toBe(MAP_WIDTH);
    expect(clamped.y + clamped.h / 2).toBe(0);
    expect(clampView({ x: 10, y: 10, w: 100, h: 75 })).toEqual({ x: 10, y: 10, w: 100, h: 75 });
  });
});
