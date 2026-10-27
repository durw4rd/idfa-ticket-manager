'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal behaviour for a dialog portalled into <body>: everything else on the page becomes inert
 * (no focus, no clicks, hidden from screen readers), Tab cycles inside the dialog, Escape closes
 * it, page scroll is locked, and focus goes back to whatever opened it on close.
 * `ref` is the dialog element; its outermost ancestor under <body> stays interactive.
 */
export function useModal(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  // Kept in a ref so an inline onClose doesn't re-run the effect on every render
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;

    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let root: HTMLElement = dialog;
    while (root.parentElement && root.parentElement !== document.body) root = root.parentElement;
    const inerted = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element !== root && element instanceof HTMLElement && !element.hasAttribute('inert')
    );
    inerted.forEach((element) => element.setAttribute('inert', ''));
    dialog.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Focus that lands outside (e.g. tabbing back in from the browser's own UI) is pulled back in
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) dialog.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      inerted.forEach((element) => element.removeAttribute('inert'));
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, ref]);
}
