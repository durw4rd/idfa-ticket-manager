'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/** A line that folds its content away until it's tapped. Closed to start with. */
export function Disclosure({
  label,
  children,
  className = '',
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="hit-44 -my-1 flex items-center gap-1 py-1 text-sm font-semibold text-ink-2 hover:text-ink"
      >
        {label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
