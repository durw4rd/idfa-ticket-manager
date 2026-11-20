// Shared look of the shareable posters (app/api/agenda/poster, app/api/films/review), drawn with next/og.
// Satori can't read CSS variables, so the colours are hex: the dark-mode values from app/globals.css.

import { createElement, type ReactElement } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';

export const POSTER_WIDTH = 1080;
export const POSTER_PAD = 72;
export const INK = '#111111';
export const PAPER = '#FAFAF7';
export const MUTED = '#9C9B94';
export const RULE = '#2A2A27';
export const SPARK = '#FFD600';
export const DANGER = '#FF6B5B'; // --danger in dark mode
export const CREW_HEX = ['#FF7057', '#6A92FF', '#38C496', '#BE80FF', '#FF66AA', '#30C4D8'];
export const POSTER_FOOTER_HEIGHT = 100;

/** Single line with an ellipsis */
export const ONE_LINE = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

/**
 * Satori draws nothing for forwardRef components, and lucide icons are two of them wrapped around a
 * plain <svg>. Unwrap down to that <svg> (lucide's render functions use no hooks, so calling them is safe).
 */
export function plainIcon(Icon: LucideIcon, props: LucideProps): ReactElement {
  let element = createElement(Icon, props) as ReactElement<Record<string, unknown>>;
  while (typeof element.type === 'object' && element.type && 'render' in element.type) {
    const render = (element.type as { render: (props: unknown, ref: null) => ReactElement }).render;
    element = render(element.props, null) as ReactElement<Record<string, unknown>>;
  }
  return element;
}

/** "1 screening", "3 screenings" */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
