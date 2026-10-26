import type { ComponentProps, ReactNode } from 'react';

export const inputClasses =
  'w-full h-11 rounded border border-line-strong bg-surface px-3 text-base text-ink placeholder:text-ink-3 ' +
  'focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:opacity-50';

/** A labelled text input. Pass `hint` for help text under the input. */
export function Field({
  label,
  hint,
  className = '',
  ...props
}: { label: string; hint?: ReactNode } & ComponentProps<'input'>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <input className={inputClasses} {...props} />
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

/** Inline message for errors (and the occasional success) */
export function Notice({ tone = 'error', children }: { tone?: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded border px-3 py-2 text-sm ${
        tone === 'error' ? 'border-danger/30 bg-danger/5 text-danger' : 'border-ok/30 bg-ok/5 text-ok'
      }`}
    >
      {children}
    </p>
  );
}
