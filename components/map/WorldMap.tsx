'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Minus, Plus, Scan } from 'lucide-react';
import { COUNTRY_SHAPES } from '@/lib/world-map-paths';
import {
  clampView,
  clusterPins,
  fitViewBox,
  interpolateView,
  MAP_HEIGHT,
  MAP_WIDTH,
  MIN_ZOOM_SPAN,
  toScreen,
  zoomView,
  type Cluster,
  type ViewBox,
} from '@/lib/world-map';
import { Button } from '@/components/ui/Button';

export interface MapPin {
  id: string;
  point: [number, number]; // Map units (project in lib/world-map.ts)
  label: string; // Place name, or the country for a film placed in the country as a whole
  ariaLabel: string;
  count: number; // Films at this place
  mine: boolean; // The viewer holds a ticket for one of them
}

const MOVE_MS = 280;
// Names of pins that aren't selected show only this far in (a fraction of the world's width) and
// with this few pins in view; zoomed out, they'd cover each other and the pins
const LABEL_ZOOM = 0.5;
const MAX_LABELS = 8;
const LABEL_HEIGHT = 22;
// Room a marker takes on screen, kept clear of labels
const MARKER_PX = 28;
// A press that moves less than this is a tap, not a drag
const TAP_SLOP_PX = 6;
const DOUBLE_TAP_MS = 300;
// Overlays inside the map (buttons, the details panel) mark themselves with this, so pressing,
// scrolling or dragging on them doesn't move the map
export const MAP_OVERLAY = 'data-map-overlay';

type Gesture =
  | { kind: 'press'; start: [number, number]; startView: ViewBox; onPin: boolean }
  | { kind: 'pan'; start: [number, number]; startView: ViewBox }
  | { kind: 'pinch'; startView: ViewBox; distance: number; mid: [number, number] };

/**
 * The film places map: simplified country outlines, places as pins, and overlays (`children`) on
 * top. It fills its parent. Zoom and pan like any map: drag, pinch, double-tap or the wheel, plus
 * zoom and fit buttons. Pins too close to tap apart merge into numbered clusters, which zoom in
 * when tapped. Pins and labels are HTML over the SVG, so text stays sharp and taps hit 44px.
 */
export default function WorldMap({
  pins,
  countries,
  selectedIds,
  onSelect,
  fitPoints,
  fitKey,
  bottomInset = 0,
  children,
}: {
  pins: MapPin[];
  countries: Set<string>; // Countries with films, shaded
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  fitPoints: Array<[number, number]>; // Every pin, for the opening view and the fit button
  fitKey: string; // A new key fits the map to fitPoints again (e.g. another person's films)
  bottomInset?: number; // Pixels covered at the bottom (the details panel), kept clear of a selected pin
  children?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<ViewBox | null>(null);
  const viewRef = useRef<ViewBox | null>(null);
  viewRef.current = view;
  const raf = useRef(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setSize({ width: root.clientWidth, height: root.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const width = size?.width ?? 0;
  const height = size?.height ?? 0;
  const aspect = width && height ? width / height : 3 / 4;

  const stopMoving = () => cancelAnimationFrame(raf.current);
  const moveTo = useCallback((target: ViewBox) => {
    cancelAnimationFrame(raf.current);
    const from = viewRef.current;
    if (!from || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setView(target);
      return;
    }
    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / MOVE_MS);
      setView(interpolateView(from, target, t));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  // The opening view fits the films; a new fitKey (another person's films) fits again
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!width || !height) return;
    const fitted = fitViewBox(fitPoints, aspect);
    if (fittedFor.current === null) {
      setView(fitted);
    } else if (fittedFor.current !== fitKey) {
      moveTo(fitted);
    }
    fittedFor.current = fitKey;
    // fitPoints changes with fitKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, width, height]);

  // A resize (rotating the phone) keeps the centre and zoom, at the frame's new shape
  useEffect(() => {
    const current = viewRef.current;
    if (!current || !width || !height) return;
    const cx = current.x + current.w / 2;
    const cy = current.y + current.h / 2;
    const h = current.w / aspect;
    if (Math.abs(h - current.h) > 0.01) setView({ x: cx - current.w / 2, y: cy - h / 2, w: current.w, h });
  }, [width, height, aspect]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  /** A point on screen (relative to the map) in map units */
  const toMap = (x: number, y: number, v: ViewBox): [number, number] => [v.x + (x / width) * v.w, v.y + (y / width) * v.w];
  const local = (event: { clientX: number; clientY: number }): [number, number] => {
    const rect = rootRef.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };

  const zoomAt = (factor: number, x = width / 2, y = height / 2) => {
    const current = viewRef.current;
    if (!current) return;
    const [px, py] = toMap(x, y, current);
    moveTo(zoomView(current, factor, px, py));
  };

  // Wheel and trackpad zoom around the pointer. Not a React handler: it has to be able to stop
  // the page scrolling, which needs a non-passive listener.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element).closest(`[${MAP_OVERLAY}]`)) return;
      const current = viewRef.current;
      if (!current) return;
      event.preventDefault();
      cancelAnimationFrame(raf.current);
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const scale = current.w / rect.width;
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setView(zoomView(current, factor, current.x + x * scale, current.y + y * scale));
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  // Drag to pan, pinch to zoom, tap the map to clear the selection, double-tap to zoom in
  const pointers = useRef(new Map<number, [number, number]>());
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  // Keeps a drag or pinch going when a finger leaves the map; a pointer the browser no longer
  // tracks (lifted already) can't be captured, which is fine
  const capture = (id: number) => {
    try {
      rootRef.current?.setPointerCapture(id);
    } catch {
      // Nothing to keep
    }
  };

  const startPinch = () => {
    const [a, b] = Array.from(pointers.current.values());
    gesture.current = {
      kind: 'pinch',
      startView: viewRef.current!,
      distance: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])),
      mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    };
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if ((event.target as Element).closest(`[${MAP_OVERLAY}]`) || !viewRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stopMoving();
    pointers.current.set(event.pointerId, local(event));
    if (pointers.current.size === 1) {
      gesture.current = {
        kind: 'press',
        start: local(event),
        startView: viewRef.current,
        onPin: !!(event.target as Element).closest('button'),
      };
    } else if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) capture(id);
      startPinch();
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    const position = local(event);
    pointers.current.set(event.pointerId, position);
    const current = gesture.current;
    if (!current || !width) return;

    if (current.kind === 'press') {
      const moved = Math.hypot(position[0] - current.start[0], position[1] - current.start[1]);
      if (moved < TAP_SLOP_PX) return;
      // Only now take the pointer: capturing on press would stop taps reaching the pins
      capture(event.pointerId);
      gesture.current = { kind: 'pan', start: current.start, startView: current.startView };
    }
    const active = gesture.current!;
    if (active.kind === 'pan') {
      const scale = active.startView.w / width;
      setView(
        clampView({
          ...active.startView,
          x: active.startView.x - (position[0] - active.start[0]) * scale,
          y: active.startView.y - (position[1] - active.start[1]) * scale,
        })
      );
    } else if (active.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1]));
      const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const start = active.startView;
      const w = Math.min(Math.max((start.w * active.distance) / distance, MIN_ZOOM_SPAN), MAP_WIDTH);
      // The map point that was under the fingers' midpoint stays under it
      const [px, py] = toMap(active.mid[0], active.mid[1], start);
      setView(clampView({ x: px - (mid[0] / width) * w, y: py - (mid[1] / width) * w, w, h: w / (start.w / start.h) }));
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const current = gesture.current;

    if (current?.kind === 'pinch') {
      suppressClick.current = true;
      // One finger lifted: carry on as a drag with the other
      const rest = Array.from(pointers.current.values())[0];
      gesture.current = rest ? { kind: 'pan', start: rest, startView: viewRef.current! } : null;
    } else if (current?.kind === 'pan') {
      suppressClick.current = true;
      gesture.current = null;
    } else if (current?.kind === 'press') {
      gesture.current = null;
      if (!current.onPin && event.type === 'pointerup') {
        const [x, y] = local(event);
        const previous = lastTap.current;
        if (previous && event.timeStamp - previous.at < DOUBLE_TAP_MS && Math.hypot(x - previous.x, y - previous.y) < 30) {
          lastTap.current = null;
          zoomAt(2, x, y);
        } else {
          lastTap.current = { at: event.timeStamp, x, y };
          onSelect([]);
        }
      }
    }
    if (suppressClick.current) setTimeout(() => (suppressClick.current = false), 0);
  };

  const shown = view ?? WORLD_FALLBACK;
  // Clusters follow the view, so they split as you zoom in and merge as you zoom out
  const clusters = useMemo(
    () => (width ? clusterPins(pins.map(({ id, point }) => ({ id, point })), shown, width) : []),
    [pins, shown, width]
  );
  const pinById = useMemo(() => new Map(pins.map((pin) => [pin.id, pin])), [pins]);
  const selected = new Set(selectedIds);

  const visible = clusters.filter((cluster) => {
    const [x, y] = toScreen(cluster.point, shown, width);
    return x >= -22 && x <= width + 22 && y >= -22 && y <= height + 22;
  });
  const labels = chooseLabels(visible, pinById, shown, width, selected);

  /** Select places, and move the map if the details panel would cover them */
  const select = (members: MapPin[]) => {
    onSelect(members.map((pin) => pin.id));
    const current = viewRef.current;
    if (!current || !height) return;
    const ys = members.map((pin) => toScreen(pin.point, current, width)[1]);
    const lowest = Math.max(...ys);
    const clearUntil = (height - bottomInset) * 0.85;
    if (lowest > clearUntil || Math.min(...ys) < 0) {
      // Put them in the middle of the part of the map the panel leaves visible
      const target = (height - Math.max(bottomInset, height * 0.45)) / 2;
      const shift = ((ys.reduce((a, b) => a + b, 0) / ys.length - target) / width) * current.w;
      moveTo(clampView({ ...current, y: current.y + shift }));
    }
  };

  /** Zoom in on a cluster; one whose places are too close to split even fully zoomed is selected instead */
  const openCluster = (members: MapPin[]) => {
    const points = members.map((pin) => pin.point);
    const next = fitViewBox(points, aspect, MIN_ZOOM_SPAN);
    if (clusterPins(members.map(({ id, point }) => ({ id, point })), next, width).length === 1) {
      select(members);
    } else {
      moveTo(next);
    }
  };

  const atClosest = shown.w <= MIN_ZOOM_SPAN + 0.5;
  const atWorld = shown.w >= MAP_WIDTH - 0.5;

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full touch-none select-none overflow-hidden bg-surface"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // A drag that ends on a pin isn't a tap on it
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      {view && (
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`World map with ${pins.length} ${pins.length === 1 ? 'place' : 'places'}`}
        >
          <rect x={-MAP_WIDTH} y={-MAP_HEIGHT} width={MAP_WIDTH * 3} height={MAP_HEIGHT * 3} className="fill-surface" />
          {COUNTRY_SHAPES.map((shape) => (
            <path
              key={shape.code}
              d={shape.d}
              className={`${countries.has(shape.code) ? 'fill-ink/15' : 'fill-line'} stroke-surface`}
              strokeWidth={0.75}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      )}

      {view &&
        visible.map((cluster) => {
          const [x, y] = toScreen(cluster.point, view, width);
          const members = cluster.ids.map((id) => pinById.get(id)!);
          const isSelected = members.every((pin) => selected.has(pin.id));
          if (members.length > 1) {
            const count = members.reduce((sum, pin) => sum + pin.count, 0);
            const mine = members.some((pin) => pin.mine);
            return (
              <button
                key={cluster.ids.join('|')}
                type="button"
                style={{ left: x, top: y }}
                aria-pressed={isSelected}
                className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${isSelected ? 'z-10' : ''}`}
                aria-label={`${count} films at ${members.length} places: ${members.map((pin) => pin.label).join(', ')}`}
                onClick={() => (isSelected ? onSelect([]) : openCluster(members))}
              >
                <span
                  className={`flex items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums shadow-sm
                    ${isSelected ? 'h-8 min-w-8' : 'h-7 min-w-7'} bg-ink text-paper ring-2 ${mine ? 'ring-spark' : 'ring-surface'}`}
                >
                  {count}
                </span>
              </button>
            );
          }
          const pin = members[0];
          return (
            <button
              key={pin.id}
              type="button"
              style={{ left: x, top: y }}
              aria-label={pin.ariaLabel}
              aria-pressed={isSelected}
              className={`absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center ${isSelected ? 'z-10' : ''}`}
              onClick={() => (isSelected ? onSelect([]) : select([pin]))}
            >
              <span
                className={`block rounded-full shadow-sm transition-all ${isSelected ? 'h-4 w-4' : 'h-3 w-3'} ${
                  pin.mine ? 'bg-spark ring-2 ring-ink' : 'bg-ink ring-2 ring-surface'
                }`}
              />
              {pin.count > 1 && (
                <span className="absolute right-1 top-1 rounded-full bg-surface px-1 text-[10px] font-bold leading-4 tabular-nums text-ink shadow-sm">
                  {pin.count}
                </span>
              )}
            </button>
          );
        })}

      {/* Place names: not buttons themselves (the pin is), and never in the way of a tap */}
      {labels.map(({ key, text, x, top, emphasis }) => (
        <span
          key={key}
          aria-hidden
          style={{ left: x, top }}
          className={`pointer-events-none absolute max-w-[10rem] -translate-x-1/2 truncate rounded-full px-2 text-xs font-semibold leading-[22px] shadow-sm ${
            emphasis ? 'z-20 bg-ink text-paper' : 'bg-surface/95 text-ink'
          }`}
        >
          {text}
        </span>
      ))}

      <div {...{ [MAP_OVERLAY]: '' }} className="absolute right-2 top-2 z-30 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="shadow-sm"
          aria-label="Zoom in"
          disabled={atClosest}
          icon={<Plus className="h-5 w-5" aria-hidden />}
          onClick={() => zoomAt(2)}
        />
        <Button
          variant="secondary"
          size="icon"
          className="shadow-sm"
          aria-label="Zoom out"
          disabled={atWorld}
          icon={<Minus className="h-5 w-5" aria-hidden />}
          onClick={() => zoomAt(0.5)}
        />
        <Button
          variant="secondary"
          size="icon"
          className="shadow-sm"
          aria-label="Show all films"
          title="Show all films"
          icon={<Scan className="h-5 w-5" aria-hidden />}
          onClick={() => moveTo(fitViewBox(fitPoints, aspect))}
        />
      </div>

      {children}
    </div>
  );
}

const WORLD_FALLBACK: ViewBox = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };

/**
 * Which names show: the selection's always (a selected cluster gets "Rotterdam +1"), and zoomed in
 * with few pins in view the others too. A name never covers another name or a marker; it goes
 * above its pin, or below when there's no room above.
 */
function chooseLabels(
  visible: Cluster[],
  pinById: Map<string, MapPin>,
  view: ViewBox,
  width: number,
  selected: Set<string>
): Array<{ key: string; text: string; x: number; top: number; emphasis: boolean }> {
  if (!width) return [];
  const markers = visible.map((cluster) => {
    const [x, y] = toScreen(cluster.point, view, width);
    return { cluster, x, y };
  });
  const showOthers = view.w <= MAP_WIDTH * LABEL_ZOOM && markers.filter((m) => m.cluster.ids.length === 1).length <= MAX_LABELS;
  const isSelected = (cluster: Cluster) => cluster.ids.every((id) => selected.has(id));

  const taken = markers.map(({ x, y }) => ({
    left: x - MARKER_PX / 2,
    right: x + MARKER_PX / 2,
    top: y - MARKER_PX / 2,
    bottom: y + MARKER_PX / 2,
  }));
  const labels: Array<{ key: string; text: string; x: number; top: number; emphasis: boolean }> = [];
  const ordered = [...markers].sort((a, b) => Number(isSelected(b.cluster)) - Number(isSelected(a.cluster)));
  for (const { cluster, x, y } of ordered) {
    const emphasis = isSelected(cluster);
    if (!emphasis && (!showOthers || cluster.ids.length > 1)) continue;
    const pins = cluster.ids.map((id) => pinById.get(id)!);
    const text = pins.length > 1 ? `${pins[0].label} +${pins.length - 1}` : pins[0].label;
    // Roughly the rendered width of 12px semibold text, capped like the label's max-width
    const half = Math.min(160, text.length * 6.6 + 16) / 2;
    const left = Math.min(Math.max(x, half), width - half);
    const above = y - 12 - LABEL_HEIGHT;
    const top = above < 0 ? y + 12 : above;
    const box = { left: left - half, right: left + half, top, bottom: top + LABEL_HEIGHT };
    const own = markers.findIndex((m) => m.cluster === cluster);
    const overlaps = taken.some(
      (other, index) => index !== own && box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
    );
    if (overlaps && !emphasis) continue;
    taken.push(box);
    labels.push({ key: `label:${cluster.ids.join('|')}`, text, x: left, top, emphasis });
  }
  return labels;
}
