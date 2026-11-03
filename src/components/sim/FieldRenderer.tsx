import { useId } from 'react';
import type { InputField, Values } from '@/simulators/types';
import { DateInput, FieldShell, NumberInput, Segmented, Select, Slider, TextInput, Toggle } from '@/components/ui/fields';
import { currencySymbol } from '@/lib/format';

export function FieldRenderer({ field, values, set }: { field: InputField; values: Values; set: (p: Values) => void }) {
  const id = useId();
  const v = values[field.key];
  const onChange = (x: unknown) => set({ [field.key]: x });
  switch (field.kind) {
    case 'money':
      return (
        <FieldShell label={field.label} hint={field.hint} htmlFor={id}>
          <NumberInput id={id} value={v} onChange={onChange} suffix={currencySymbol()} allowNegative={(field.min ?? 0) < 0} />
          {field.slider && <Slider value={v} {...field.slider} onChange={onChange} />}
        </FieldShell>
      );
    case 'percent':
      return (
        <FieldShell label={field.label} hint={field.hint} htmlFor={id}>
          <NumberInput id={id} value={v} onChange={onChange} suffix="%" scale={100} />
          {field.slider && <Slider value={v} {...field.slider} scale={100} onChange={onChange} />}
        </FieldShell>
      );
    case 'number':
      return (
        <FieldShell label={field.label} hint={field.hint} htmlFor={id}>
          <NumberInput id={id} value={v} onChange={onChange} suffix={field.unit} allowNegative={(field.min ?? 0) < 0} />
          {field.slider && <Slider value={v} {...field.slider} onChange={onChange} />}
        </FieldShell>
      );
    case 'select':
      return <FieldShell label={field.label} hint={field.hint} htmlFor={id}><Select id={id} value={v} onChange={onChange} options={field.options} /></FieldShell>;
    case 'segmented':
      return <FieldShell label={field.label} hint={field.hint}><Segmented value={v} onChange={onChange} options={field.options} /></FieldShell>;
    case 'toggle':
      return <Toggle checked={!!v} onChange={onChange} label={field.label} hint={field.hint} />;
    case 'date':
      return <FieldShell label={field.label} hint={field.hint} htmlFor={id}><DateInput id={id} value={v} onChange={onChange} /></FieldShell>;
    case 'text':
      return <FieldShell label={field.label} hint={field.hint} htmlFor={id}><TextInput id={id} value={v ?? ''} onChange={onChange} maxLength={field.maxLength} placeholder={field.placeholder} /></FieldShell>;
  }
}

/** Valeur lisible d'un champ pour le rapport (hypothèses saisies). */
export function displayFieldValue(field: InputField, v: unknown, fmt: { money: (n: number) => string; pct: (n: number, d?: number) => string; num: (n: number, d?: number) => string; date: (s: string) => string }): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (field.kind) {
    case 'money': return fmt.money(v as number);
    case 'percent': return fmt.pct(v as number, field.digits ?? 2);
    case 'number': return `${fmt.num(v as number, 4)}${field.unit ? ' ' + field.unit : ''}`;
    case 'select': case 'segmented': return field.options.find((o) => o.value === v)?.label ?? String(v);
    case 'toggle': return v ? 'Oui' : 'Non';
    case 'date': return fmt.date(v as string);
    case 'text': return String(v);
  }
}
