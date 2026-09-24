import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'glass' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variantCls: Record<Variant, string> = {
  primary: 'btn-primary',
  glass: 'btn-glass',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

const sizeCls: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: '',
  lg: 'px-6 py-3 text-base',
};

export function Button({
  variant = 'glass',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cn(variantCls[variant], sizeCls[size], className)} {...rest}>
      {children}
    </button>
  );
}
