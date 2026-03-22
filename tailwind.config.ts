import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-manrope)', 'sans-serif'],
        display: ['var(--font-jakarta)', 'sans-serif'],
      },
      colors: {
        sage: {
          50:  '#F2F7F4',
          100: '#D9EBE0',
          200: '#B3D6C2',
          300: '#8DC1A3',
          400: '#67AC85',
          500: '#4A7C59',
          600: '#3D6849',
          700: '#2F5238',
          800: '#213B28',
          900: '#1F2D26',
        },
        stone: {
          50:  '#F7F4F0',
          100: '#E8E0D5',
          200: '#D4C9BA',
          300: '#BFB2A0',
          400: '#A99A86',
          500: '#8C7D6B',
          600: '#736655',
          700: '#5C5043',
          800: '#453B31',
          900: '#2E271F',
        },
        terra: {
          400: '#D4955F',
          500: '#C97D4E',
          600: '#B06A3A',
        },
      },
    },
  },
  plugins: [],
}
export default config
