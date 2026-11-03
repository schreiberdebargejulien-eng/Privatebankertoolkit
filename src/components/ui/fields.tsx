import { useEffect, useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 6 });

export function parseFrNumber(s: string): number | null {
  const cleaned = s.replace(/[\s  ]/g, '').replace(/[€%]/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function FieldShell({ label, hint, htmlFor, children, error }: { label: string; hint?: string; htmlFor?: string; children: ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-muted leading-tight">{label}</label>
      {children}
      {error ? <p className="text-xs text-neg">{error}</p> : hint ? <p className="text-xs text-muted/80 leading-snug">{hint}</p> : null}
    </div>
  );
}

const inputBase = 'w-full h-12 rounded-xl bg-surface2/70 border border-transparent px-3 text-[16px] text-fg placeholder:text-muted/60 outline-none transition focus:border-accent/60 focus:bg-surface';

/** Champ numérique tactile : clavier décimal iOS, séparateurs français, suffixe d'unité. */
export function NumberInput({ value, onChange, suffix, scale = 1, id, allowNegative = true, placeholder }: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  /** Facteur d'affichage (100 pour les pourcentages stockés en décimal). */
  scale?: number;
  id?: string;
  allowNegative?: boolean;
  placeholder?: string;
}) {
  const toDisplay = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : fmt.format(Math.round(v * scale * 1e8) / 1e8));
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(toDisplay(value));
  useEffect(() => { if (!focused) setText(toDisplay(value)); /* eslint-disable-next-line */ }, [value, focused]);
  return (
    <div className="relative">
      <input
        id={id}
        className={cn(inputBase, 'tnum', suffix && (suffix.length <= 2 ? 'pr-8' : 'pr-14'))}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={(e) => { setFocused(true); setText(text.replace(/[\s  ]/g, '')); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => { setFocused(false); setText(toDisplay(value)); }}
        onChange={(e) => {
          let t = e.target.value;
          if (!allowNegative) t = t.replace('-', '');
          setText(t);
          const n = parseFrNumber(t);
          onChange(n === null ? null : n / scale);
        }}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Slider({ value, min, max, step, onChange, scale = 1 }: { value: number | null; min: number; max: number; step: number; onChange: (v: number) => void; scale?: number }) {
  return (
    <input
      type="range"
      className="w-full h-6 -mt-0.5"
      min={min}
      max={max}
      step={step}
      value={value === null ? min : Math.min(max, Math.max(min, value * scale))}
      onChange={(e) => onChange(Number(e.target.value) / scale)}
      aria-hidden
      tabIndex={-1}
    />
  );
}

export function Select<T extends string | number>({ value, onChange, options, id }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; id?: string }) {
  return (
    <div className="relative">
      <select
        id={id}
        className={cn(inputBase, 'appearance-none pr-10')}
        value={String(value)}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-surface2/70 p-1 gap-1" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 min-h-10 rounded-lg px-2 text-[14px] font-medium transition leading-tight',
            o.value === value ? 'bg-surface text-fg shadow-sm' : 'text-muted')}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4 min-h-12 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-[15px] text-fg leading-tight">{label}</span>
        {hint && <span className="block text-xs text-muted mt-0.5 leading-snug">{hint}</span>}
      </span>
      <span className="relative shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block h-[30px] w-[50px] rounded-full bg-line transition peer-checked:bg-accent" />
        <span className="absolute left-[3px] top-[3px] h-6 w-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function DateInput({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  return <input id={id} type="date" className={cn(inputBase, 'tnum')} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function TextInput({ value, onChange, id, maxLength, placeholder }: { value: string; onChange: (v: string) => void; id?: string; maxLength?: number; placeholder?: string }) {
  return <input id={id} className={inputBase} value={value} maxLength={maxLength} placeholder={placeholder} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
}
