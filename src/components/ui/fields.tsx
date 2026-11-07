import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Espaces (y compris insécables) insérées par le formatage fr-FR. */
const SPACES = /[\s\u00a0\u202f]/g;

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

/** Inverse le signe d’une saisie en cours (« 12,5 » ↔ « -12,5 »), en conservant le reste du texte. */
export function toggleSign(s: string): string {
  const t = s.trimStart();
  return t.startsWith('-') ? t.slice(1) : '-' + t;
}

/**
 * Champ numérique tactile : clavier décimal iOS, séparateurs français, suffixe d'unité.
 * Le clavier décimal mobile n’offre pas de signe moins : un bouton « ± » placé dans le champ
 * inverse le signe sans fermer le clavier (le focus reste sur la saisie). Par défaut, il n’est
 * affiché que sur les champs en pourcentage ; `signButton` permet de le forcer ou de le masquer.
 */
export function NumberInput({ value, onChange, suffix, scale = 1, id, allowNegative = true, signButton, placeholder }: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  suffix?: string;
  /** Facteur d'affichage (100 pour les pourcentages stockés en décimal). */
  scale?: number;
  id?: string;
  allowNegative?: boolean;
  /** Affiche le bouton « ± » (par défaut : seulement pour un suffixe « % »). */
  signButton?: boolean;
  placeholder?: string;
}) {
  const showSign = allowNegative && (signButton ?? suffix === '%');
  const toDisplay = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '' : fmt.format(Math.round(v * scale * 1e8) / 1e8));
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(toDisplay(value));
  const inputRef = useRef<HTMLInputElement>(null);
  /** Vrai quand le focus vient du bouton « ± » : on ne sélectionne alors pas tout le texte. */
  const keepCaret = useRef(false);
  useEffect(() => { if (!focused) setText(toDisplay(value)); /* eslint-disable-next-line */ }, [value, focused]);

  const commit = (t: string) => {
    setText(t);
    const n = parseFrNumber(t);
    onChange(n === null ? null : n / scale);
  };

  const flipSign = () => {
    const input = inputRef.current;
    const base = (focused ? text : toDisplay(value)).replace(SPACES, '');
    const next = toggleSign(base);
    if (!focused && input) { keepCaret.current = true; input.focus(); }
    commit(next);
    requestAnimationFrame(() => { if (input) input.setSelectionRange(next.length, next.length); });
  };

  return (
    <div className="relative">
      {showSign && (
        <button
          type="button"
          aria-label="Changer le signe (positif / négatif)"
          title="Changer le signe"
          tabIndex={-1}
          // Empêche le bouton de prendre le focus : le clavier mobile reste ouvert.
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={flipSign}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 h-9 w-9 rounded-lg text-[17px] font-semibold leading-none text-muted bg-surface/70 border border-line/70 active:bg-line transition"
        >±</button>
      )}
      <input
        ref={inputRef}
        id={id}
        className={cn(inputBase, 'tnum', showSign && 'pl-12', suffix && (suffix.length <= 2 ? 'pr-8' : 'pr-14'))}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          if (keepCaret.current) { keepCaret.current = false; return; }
          setText(text.replace(SPACES, ''));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => { setFocused(false); setText(toDisplay(value)); }}
        onChange={(e) => {
          let t = e.target.value;
          if (!allowNegative) t = t.replace('-', '');
          commit(t);
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
