/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        base: 'rgb(var(--base-rgb) / <alpha-value>)',
        raised: 'rgb(var(--raised-rgb) / <alpha-value>)',
        sunk: 'rgb(var(--sunk-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        'line-soft': 'rgb(var(--line-soft-rgb) / <alpha-value>)',
        ink: 'rgb(var(--text-rgb) / <alpha-value>)',
        dim: 'rgb(var(--text-dim-rgb) / <alpha-value>)',
        faint: 'rgb(var(--text-faint-rgb) / <alpha-value>)',
        live: 'rgb(var(--live-rgb) / <alpha-value>)',
        warn: 'rgb(var(--warn-rgb) / <alpha-value>)',
        fault: 'rgb(var(--fault-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--r-lg)',
        md: 'var(--r-md)',
        sm: 'var(--r-sm)',
      },
      transitionTimingFunction: {
        ease: 'var(--ease)',
      },
    },
  },
  plugins: [],
};
