import { cn } from '@/lib/utils/cn';
import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-neutral-100 text-neutral-700',
  primary: 'bg-neutral-900 text-white',
  success: 'bg-neutral-100 text-neutral-700',
  warning: 'bg-neutral-200 text-neutral-800',
  danger: 'bg-neutral-800 text-neutral-100',
  info: 'bg-neutral-100 text-neutral-700',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
