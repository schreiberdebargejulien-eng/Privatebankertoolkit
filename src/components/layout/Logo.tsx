import { cn } from '@/lib/cn';

/** Monogramme : trois colonnes ascendantes sur un carré d'accent (identité sobre, sans texte). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-7 w-7 shrink-0', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-accent" />
      <g className="fill-accent-fg">
        <rect x="8.5" y="16" width="3.4" height="8" rx="1.1" />
        <rect x="14.3" y="12" width="3.4" height="12" rx="1.1" />
        <rect x="20.1" y="8" width="3.4" height="16" rx="1.1" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn('leading-none min-w-0', className)}>
      <div className="text-[13.5px] font-semibold tracking-tight text-fg truncate">Private Banker</div>
      <div className="text-[11px] text-muted mt-[3px] truncate">Toolkit</div>
    </div>
  );
}
