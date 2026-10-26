'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Bottom sheet for pickers, menus and confirmations. Closes on backdrop tap and Escape,
 * locks page scroll while open, and moves focus into the sheet.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Kept in a ref so an inline onClose doesn't re-run the open/close effect on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 animate-[fade_150ms_ease-out]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative w-full max-w-xl rounded-t-[1.25rem] bg-surface pb-safe outline-none
          animate-[rise_200ms_cubic-bezier(0.2,0.8,0.2,1)]"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-ink/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

/** A full-width row inside a Sheet, e.g. a menu item or a person to pick */
export function SheetOption({
  onClick,
  selected,
  icon,
  children,
  tone = 'default',
  disabled,
}: {
  onClick: () => void;
  selected?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center gap-3 rounded px-3 text-left text-base font-medium transition
        hover:bg-ink/5 disabled:opacity-40 ${tone === 'danger' ? 'text-danger' : 'text-ink'}
        ${selected ? 'bg-ink/5' : ''}`}
    >
      {icon}
      <span className="flex-1">{children}</span>
      {selected && <span className="h-2 w-2 rounded-full bg-spark ring-2 ring-ink/10" aria-label="Selected" />}
    </button>
  );
}
