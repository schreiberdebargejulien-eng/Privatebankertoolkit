/** @type {import('tailwindcss').Config} */
/*
 * Design system — tous les jetons (couleurs, rayons, ombres, typographie, mouvement)
 * sont définis en variables CSS dans src/styles/index.css et seulement référencés ici.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        pos: 'rgb(var(--pos) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: '0 0 0 3px rgb(var(--accent) / 0.18)',
      },
      fontSize: {
        '2xs': ['11px', { lineHeight: '14px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        md: ['15px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '26px' }],
        '2xl': ['24px', { lineHeight: '30px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['38px', { lineHeight: '42px' }],
      },
      transitionTimingFunction: {
        apple: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: { 160: '160ms', 240: '240ms' },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97) translateY(-4px)' }, to: { opacity: '1', transform: 'none' } },
        'value-in': { from: { opacity: '0.35', transform: 'translateY(3px)' }, to: { opacity: '1', transform: 'none' } },
        flash: { '0%': { backgroundColor: 'rgb(var(--accent) / 0.10)' }, '100%': { backgroundColor: 'transparent' } },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 240ms ease-out both',
        'scale-in': 'scale-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'value-in': 'value-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        flash: 'flash 900ms ease-out both',
        'value-flash': 'value-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both, flash 900ms ease-out both',
        'sheet-up': 'sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
};
