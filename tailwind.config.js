/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'] },
      colors: {
        night: { DEFAULT: '#101C2C', 2: '#1D3553', 3: '#16263B' },
        paper: '#F7F8FA',
        mist: '#8993A1',
        gold: { DEFAULT: '#C5A46D', soft: '#E9DCC4' },
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        pos: 'rgb(var(--pos) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
    },
  },
  plugins: [],
};
