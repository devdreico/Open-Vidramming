/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f0f5fc',
          100: '#dbe6f5',
          200: '#b8cce9',
          300: '#8aabd4',
          400: '#5a86ba',
          500: '#3a689e',
          600: '#2a4f7a',
          700: '#1c3a5c',
          800: '#122a45',
          900: '#0f2744',
          950: '#0a1628',
        },
        vg: {
          50: '#eef5ff',
          100: '#d9e8ff',
          200: '#bcd7ff',
          300: '#8ebdff',
          400: '#5998ff',
          500: '#3376f5',
          600: '#1b5ae0',
          700: '#1447b8',
          800: '#173c90',
          900: '#193570',
          950: '#142248',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 32px rgba(10, 22, 40, 0.08)',
        'glass-lg': '0 16px 48px rgba(10, 22, 40, 0.12)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
