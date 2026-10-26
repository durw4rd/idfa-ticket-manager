import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'spark';
type Size = 'md' | 'sm' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/90',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'bg-surface text-danger border border-line-strong hover:border-danger',
  spark: 'bg-spark text-[#111] hover:brightness-95',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-5 text-base gap-2',
  sm: 'h-9 px-4 text-sm gap-1.5',
  icon: 'h-11 w-11 justify-center',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className = '') {
  return `inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition
    disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2
    focus-visible:outline-offset-2 focus-visible:outline-ink ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

interface CommonProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Button({
  variant,
  size,
  icon,
  children,
  className,
  type = 'button',
  ...props
}: CommonProps & ComponentProps<'button'>) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

/** A link that looks like a button. External links open in a new tab. */
export function ButtonLink({
  variant,
  size,
  icon,
  children,
  className,
  href,
  external,
  ...props
}: CommonProps & { href: string; external?: boolean } & Omit<ComponentProps<'a'>, 'href'>) {
  const classes = buttonClasses(variant, size, className);
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...props}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes} {...props}>
      {icon}
      {children}
    </Link>
  );
}
