import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Matched to mockup design tokens
        sage: {
          DEFAULT: '#5C7A6B',
          light:   '#E8F0EC',
          mid:     '#A8C4B4',
          dark:    '#4A6558',
        },
        navy: {
          DEFAULT: '#2C3E6B',
          light:   '#E8EBF4',
          mid:     '#8A9BC4',
        },
        rose: {
          DEFAULT: '#d49ba9',   // user accent colour
          light:   '#F5E8E8',
          mid:     '#E0B0B2',
          muted:   '#C4878A',
        },
        free: {
          DEFAULT: '#3B7A4A',
          bg:      '#E6F4EA',
        },
        busy: {
          DEFAULT: '#B94040',
          bg:      '#FAEAEA',
        },
        soon: {
          DEFAULT: '#8A6A20',
          bg:      '#FBF3E0',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl:  '1rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
      },
    },
  },
  plugins: [],
}

export default config
