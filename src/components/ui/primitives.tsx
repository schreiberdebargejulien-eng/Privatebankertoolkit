import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'icon' }>(
  ({ className, variant = 'secondary', size = 'md', ...p }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none select-none',
        size === 'md' && 'h-11 px-4 text-[15px]',
        size === 'sm' && 'h-9 px-3 text-sm',
        size === 'icon' && 'h-10 w-10',
        variant === 'primary' && 'bg-fg text-bg hover:opacity-90',
        variant === 'gold' && 'bg-gold text-night hover:brightness-105',
        variant === 'secondary' && 'bg-surface2 text-fg hover:bg-line/60',
        variant === 'ghost' && 'text-fg hover:bg-surface2',
        variant === 'danger' && 'bg-neg/10 text-neg hover:bg-neg/20',
        className,
      )}
      {...p}
    />
  ),
);
Button.displayName = 'Button';

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-surface border border-line/70 shadow-[0_1px_2px_rgba(16,28,44,0.04)]', className)} {...p} />;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between px-1 mb-2 mt-6', className)}>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'accent' | 'pos' | 'neg' | 'warn'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
      tone === 'muted' && 'bg-surface2 text-muted',
      tone === 'accent' && 'bg-accent/15 text-accent',
      tone === 'pos' && 'bg-pos/10 text-pos',
      tone === 'neg' && 'bg-neg/10 text-neg',
      tone === 'warn' && 'bg-warn/15 text-warn', className)}>{children}</span>
  );
}
