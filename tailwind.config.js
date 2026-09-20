/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#00007B',
          50: '#f0f3ff',
          100: '#e2e7ff',
          200: '#c8d1ff',
          300: '#9faeff',
          400: '#6f7efb',
          500: '#4653f0',
          600: '#2833dd',
          700: '#1a22ba',
          800: '#0e1596',
          900: '#00007B',
          950: '#00004c',
        }
      }
    },
  },
  plugins: [require('@tailwindcss/typography')],
}

