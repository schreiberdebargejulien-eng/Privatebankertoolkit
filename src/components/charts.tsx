/**
 * Graphiques (Recharts) — palette catégorielle validée (contrôle CVD / contraste),
 * sélectionnée pour chaque thème. Une vue tableau accompagne toujours le graphique.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSettings } from '@/lib/settings';
import { compact, money, pct } from '@/lib/format';
import { useReducedMotion } from '@/lib/hooks';

/*
 * Palette catégorielle sobre, menée par le bleu d'accent. Validée (scripts dataviz) :
 * bande de luminance, chroma, séparation daltonisme ΔE ≥ 8 entre voisins, contraste ≥ 3:1,
 * en clair (surface #FFFFFF) comme en sombre (surface #1E1E21). Ordre fixe, jamais permuté.
 */
const LIGHT = ['#3A6BAA', '#C9673F', '#1F9A76', '#AD8418', '#C25E8C', '#3F8A35', '#7563C4'];
const DARK = ['#5F90CF', '#DA7448', '#13A48F', '#B88A16', '#C9628F', '#3E8A33', '#8C7AD6'];

export function usePalette() {
  const { resolvedTheme } = useSettings();
  const reduced = useReducedMotion();
  const dark = resolvedTheme === 'dark';
  return {
    series: dark ? DARK : LIGHT,
    grid: dark ? 'rgba(255,255,255,0.07)' : 'rgba(23,25,28,0.06)',
    axis: dark ? '#9C9CA4' : '#6A7079',
    surface: dark ? '#1E1E21' : '#FFFFFF',
    text: dark ? '#F2F2F4' : '#17191C',
    neg: dark ? '#EE7872' : '#B8423C',
    animate: !reduced,
  };
}

export interface Series { key: string; label: string }

function TooltipBox({ active, payload, label, xLabel, valueFormat }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string | number; xLabel?: (l: string | number) => string; valueFormat: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-surface/95 backdrop-blur-md hairline px-3 py-2.5 shadow-lg text-[12px] min-w-[160px]">
      <div className="font-semibold mb-1.5 text-fg">{xLabel ? xLabel(label!) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-fg/75 leading-5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="flex-1">{p.name}</span>
          <span className="tnum font-medium text-fg">{valueFormat(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

const legendStyle = { fontSize: 12, paddingTop: 10 } as const;
const ANIM = { animationDuration: 500, animationEasing: 'ease-out' as const };

export function ChartTitle({ children }: { children: string }) {
  return <div className="pb-3 text-[14px] font-semibold tracking-tight text-fg">{children}</div>;
}

export function LineSeriesChart({ data, x, series, title, xLabel = (v) => `Année ${v}`, valueFormat = money, yFormat = compact, height = 220, area = false, stacked = false, refY }: {
  data: Record<string, number | string>[];
  x: string;
  series: Series[];
  title: string;
  xLabel?: (v: string | number) => string;
  valueFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  height?: number;
  area?: boolean;
  stacked?: boolean;
  refY?: number;
}) {
  const p = usePalette();
  const common = (
    <>
      <CartesianGrid stroke={p.grid} vertical={false} />
      <XAxis dataKey={x} tick={{ fill: p.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: p.grid }} minTickGap={16} />
      <YAxis tick={{ fill: p.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={yFormat} />
      <Tooltip content={<TooltipBox xLabel={xLabel} valueFormat={valueFormat} />} cursor={{ stroke: p.axis, strokeDasharray: '3 3' }} />
      {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
      {refY !== undefined && <ReferenceLine y={refY} stroke={p.axis} strokeDasharray="4 4" />}
    </>
  );
  return (
    <div>
      <ChartTitle>{title}</ChartTitle>
      <ResponsiveContainer width="100%" height={height}>
        {area ? (
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, k) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId={stacked ? '1' : undefined} stroke={p.series[k]} strokeWidth={2} fill={p.series[k]} fillOpacity={stacked ? 0.5 : 0.08} activeDot={{ r: 4, stroke: p.surface, strokeWidth: 2 }} dot={false} isAnimationActive={p.animate} {...ANIM} />
            ))}
          </AreaChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            {common}
            {series.map((s, k) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={p.series[k]} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: p.surface, strokeWidth: 2 }} isAnimationActive={p.animate} {...ANIM} />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function BarSeriesChart({ data, x, series, title, valueFormat = money, yFormat = compact, height = 220, stacked = false, xLabel, colorByValue = false }: {
  data: Record<string, number | string>[];
  x: string;
  series: Series[];
  title: string;
  valueFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  height?: number;
  stacked?: boolean;
  xLabel?: (v: string | number) => string;
  /** Colore chaque barre selon le signe (une seule série). */
  colorByValue?: boolean;
}) {
  const p = usePalette();
  return (
    <div>
      <ChartTitle>{title}</ChartTitle>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke={p.grid} vertical={false} />
          <XAxis dataKey={x} tick={{ fill: p.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: p.grid }} interval="preserveStartEnd" minTickGap={8} />
          <YAxis tick={{ fill: p.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={58} tickFormatter={yFormat} />
          <Tooltip content={<TooltipBox valueFormat={valueFormat} xLabel={xLabel} />} cursor={{ fill: p.grid }} />
          {series.length > 1 && <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />}
          <ReferenceLine y={0} stroke={p.axis} strokeOpacity={0.5} />
          {series.map((s, k) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? '1' : undefined} fill={p.series[k]} radius={stacked ? 0 : [4, 4, 0, 0]} stroke={p.surface} strokeWidth={stacked ? 1 : 0} maxBarSize={32} isAnimationActive={p.animate} {...ANIM}>
              {colorByValue && data.map((d, i) => <Cell key={i} fill={(d[s.key] as number) < 0 ? p.neg : p.series[0]} />)}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DonutChart({ data, title, valueFormat = money }: { data: { label: string; value: number }[]; title: string; valueFormat?: (v: number) => string }) {
  const p = usePalette();
  const total = data.reduce((a, d) => a + d.value, 0);
  const filtered = data.filter((d) => d.value > 0);
  return (
    <div>
      <ChartTitle>{title}</ChartTitle>
      <div className="flex flex-col items-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={filtered} dataKey="value" nameKey="label" innerRadius={62} outerRadius={88} paddingAngle={1.5} stroke={p.surface} strokeWidth={2} isAnimationActive={p.animate} {...ANIM}>
              {filtered.map((d) => <Cell key={d.label} fill={p.series[data.indexOf(d) % p.series.length]} />)}
            </Pie>
            <Tooltip content={<TooltipBox valueFormat={valueFormat} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-1 gap-1.5 w-full px-1 pt-1">
          {data.map((d, k) => (
            <div key={d.label} className="flex items-center gap-2 text-[12.5px] py-0.5">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.series[k % p.series.length] }} />
              <span className="flex-1 text-fg/80 truncate">{d.label}</span>
              <span className="tnum text-muted">{pct(total ? d.value / total : 0, 1)}</span>
              <span className="tnum font-medium w-28 text-right text-fg">{valueFormat(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
