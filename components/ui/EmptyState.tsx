import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      {icon && <div className="mb-4 text-ink-3">{icon}</div>}
      <p className="font-display text-lg">{title}</p>
      {children && <p className="mt-1 max-w-xs text-sm text-ink-2">{children}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
