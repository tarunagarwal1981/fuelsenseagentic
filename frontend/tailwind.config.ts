// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--destructive-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        /* Brand and palette */
        'brand-teal': 'var(--brand-teal)',
        'brand-navy': 'var(--brand-navy)',
        teal: {
          50: 'var(--teal-50)',
          100: 'var(--teal-100)',
          200: 'var(--teal-200)',
          300: 'var(--teal-300)',
          400: 'var(--teal-400)',
          500: 'var(--teal-500)',
          600: 'var(--teal-600)',
          700: 'var(--teal-700)',
          800: 'var(--teal-800)',
          900: 'var(--teal-900)',
        },
        navy: {
          100: 'var(--navy-100)',
          200: 'var(--navy-200)',
          300: 'var(--navy-300)',
          400: 'var(--navy-400)',
          500: 'var(--navy-500)',
          600: 'var(--navy-600)',
          700: 'var(--navy-700)',
          800: 'var(--navy-800)',
          900: 'var(--navy-900)',
        },
        orange: {
          50: 'var(--orange-50)',
          100: 'var(--orange-100)',
          200: 'var(--orange-200)',
          300: 'var(--orange-300)',
          400: 'var(--orange-400)',
          500: 'var(--orange-500)',
          600: 'var(--orange-600)',
          700: 'var(--orange-700)',
          800: 'var(--orange-800)',
        },
        grey: {
          '00': 'var(--grey-00)',
          '01': 'var(--grey-01)',
          '02': 'var(--grey-02)',
          '03': 'var(--grey-03)',
          '04': 'var(--grey-04)',
          '05': 'var(--grey-05)',
          '06': 'var(--grey-06)',
          '07': 'var(--grey-07)',
          '08': 'var(--grey-08)',
        },
        status: {
          error: 'var(--status-error)',
          'error-dark': 'var(--status-error-dark)',
          'error-bg': 'var(--status-error-bg)',
          warning: 'var(--status-warning)',
          'warning-dark': 'var(--status-warning-dark)',
          'warning-bg': 'var(--status-warning-bg)',
          success: 'var(--status-success)',
          'success-dark': 'var(--status-success-dark)',
          'success-bg': 'var(--status-success-bg)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        poppins: ['var(--font-poppins)', 'Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
