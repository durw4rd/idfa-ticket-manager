'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentProps } from 'react';

/**
 * A textarea that grows with its text, so the whole of it stays visible. `rows` is the minimum
 * height. Controlled only: the height is re-measured whenever `value` changes, and when the
 * box gets narrower or wider (rotating the phone re-wraps the text).
 */
export function AutoTextarea({ value, className = '', ...props }: { value: string } & ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    // Collapse first, or scrollHeight never shrinks when text is deleted
    element.style.height = 'auto';
    // scrollHeight leaves out the border, which border-box sizing counts
    element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
  }, []);

  useLayoutEffect(fit, [fit, value]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // Only width changes matter; fitting changes the height, which would otherwise loop
    let width = element.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (element.offsetWidth !== width) {
        width = element.offsetWidth;
        fit();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={`w-full resize-none overflow-hidden rounded border border-line-strong bg-surface px-3 py-2.5 text-base text-ink
        placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
