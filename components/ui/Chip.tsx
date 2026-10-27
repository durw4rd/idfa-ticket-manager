import type { ComponentProps, ReactNode } from 'react';

/** A toggle pill, used for filters. Selected chips are inked. */
export function Chip({
  selected,
  icon,
  count,
  children,
  className = '',
  ...props
}: {
  selected: boolean;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border pl-1.5 pr-3 text-sm font-semibold transition
        ${icon ? '' : 'pl-3'}
        ${selected ? 'border-ink bg-ink text-paper' : 'border-line-strong bg-surface text-ink hover:border-ink'} ${className}`}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className={`tabular-nums ${selected ? 'text-paper/60' : 'text-ink-3'}`}>{count}</span>
      )}
    </button>
  );
}
