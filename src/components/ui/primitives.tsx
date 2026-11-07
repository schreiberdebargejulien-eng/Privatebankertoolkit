import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/* =========================================================================
 * Primitives du design system. Aucun style propre à une page : toute
 * surface, action ou étiquette de l'application passe par ces composants.
 * ========================================================================= */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  ({ className, variant = 'secondary', size = 'md', type = 'button', ...p }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none whitespace-nowrap',
        'transition-[background-color,box-shadow,color,transform,opacity] duration-160 ease-apple active:scale-[0.98]',
        'disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-3 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5',
        size === 'md' && 'h-10 px-3.5 text-[14px] [&_svg]:h-4 [&_svg]:w-4',
        size === 'lg' && 'h-11 px-4 text-[15px] [&_svg]:h-4 [&_svg]:w-4',
        size === 'icon' && 'h-10 w-10 [&_svg]:h-[18px] [&_svg]:w-[18px]',
        size === 'icon-sm' && 'h-8 w-8 rounded-md [&_svg]:h-4 [&_svg]:w-4',
        variant === 'primary' && 'bg-accent text-accent-fg shadow-xs hover:bg-accent/90',
        variant === 'secondary' && 'bg-surface text-fg shadow-xs hairline hover:bg-surface2',
        variant === 'subtle' && 'bg-surface2 text-fg hover:bg-line/70',
        variant === 'ghost' && 'text-fg/80 hover:bg-surface2 hover:text-fg',
        variant === 'danger' && 'bg-neg/10 text-neg hover:bg-neg/15',
        className,
      )}
      {...p}
    />
  ),
);
Button.displayName = 'Button';

/** Surface élémentaire : fond blanc, bordure fine, ombre minimale. */
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl bg-surface hairline shadow-xs', className)} {...p} />;
}

/** Petite étiquette capitale, pour titrer un groupe à l'intérieur d'une surface. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('text-[11px] font-semibold uppercase tracking-[0.07em] text-muted', className)}>{children}</div>;
}

/** Titre de section de page (sentence case, à la manière d'Apple). */
export function SectionTitle({ children, action, className, description }: { children: ReactNode; action?: ReactNode; className?: string; description?: ReactNode }) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mt-10 mb-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-semibold tracking-tight text-fg leading-tight">{children}</h2>
        {description && <p className="text-[13px] text-muted mt-1 leading-snug">{description}</p>}
      </div>
      {action && <div className="shrink-0 text-[13px]">{action}</div>}
    </div>
  );
}

/** Lien d'action discret placé dans un en-tête de section. */
export function TextAction({ className, ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={cn('text-[13px] font-medium text-accent hover:text-accent/80 transition-colors', className)} {...p} />;
}

export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'accent' | 'pos' | 'neg' | 'warn'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 h-5 text-[11px] font-medium whitespace-nowrap',
      tone === 'muted' && 'bg-surface2 text-muted',
      tone === 'accent' && 'bg-accent/10 text-accent',
      tone === 'pos' && 'bg-pos/10 text-pos',
      tone === 'neg' && 'bg-neg/10 text-neg',
      tone === 'warn' && 'bg-warn/10 text-warn', className)}>{children}</span>
  );
}

/** Pastille d'icône monochrome ; `active` passe à l'accent. */
export function IconTile({ icon: Icon, size = 'md', active, className }: { icon: LucideIcon; size?: 'sm' | 'md' | 'lg'; active?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center rounded-lg transition-colors',
      size === 'sm' && 'h-7 w-7 rounded-md [&_svg]:h-[15px] [&_svg]:w-[15px]',
      size === 'md' && 'h-9 w-9 [&_svg]:h-[17px] [&_svg]:w-[17px]',
      size === 'lg' && 'h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5',
      active ? 'bg-accent text-accent-fg' : 'bg-surface2 text-fg/70', className)}>
      <Icon strokeWidth={1.75} />
    </span>
  );
}

/** Surface de formulaire titrée (groupe de champs, éditeur de lignes). */
export function FormCard({ title, description, children, className, action }: { title?: ReactNode; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={cn('p-4 md:p-5', className)}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold tracking-tight text-fg">{title}</h3>}
            {description && <p className="text-[12.5px] text-muted mt-0.5 leading-snug">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Card>
  );
}

/** Libellé compact pour les champs des éditeurs de lignes. */
export const MINI_LABEL = 'block space-y-1.5 text-[12px] font-medium text-muted';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-md bg-surface2 hairline text-[11px] font-medium text-muted font-sans', className)}>{children}</kbd>;
}

/** État vide sobre. */
export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
      <Icon className="mx-auto h-5 w-5 text-faint" strokeWidth={1.75} />
      <div className="mt-2.5 text-[14px] font-medium text-fg">{title}</div>
      {children && <div className="mt-1 text-[13px] text-muted leading-snug max-w-sm mx-auto">{children}</div>}
    </div>
  );
}
