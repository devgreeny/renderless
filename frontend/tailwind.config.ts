import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm, friendly neutrals
        sand: {
          50: '#FDFCFB',
          100: '#F9F7F4',
          200: '#F0EDE8',
          300: '#E4DFD7',
          400: '#C9C2B6',
          500: '#A69E8F',
          600: '#847A6A',
          700: '#635A4D',
          800: '#433D34',
          900: '#262320',
        },
        // Accent - warm terracotta
        accent: {
          50: '#FEF6F3',
          100: '#FDEBE4',
          200: '#FAD4C5',
          300: '#F5B299',
          400: '#EF8A66',
          500: '#E56B3E',
          600: '#D14F23',
          700: '#AC3F1C',
          800: '#8A351C',
          900: '#712F1C',
        },
        // Success green
        success: {
          500: '#22C55E',
          600: '#16A34A',
        },
      },
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      boxShadow: {
        'soft': '0 2px 8px -2px rgba(0, 0, 0, 0.08), 0 4px 16px -4px rgba(0, 0, 0, 0.06)',
        'lifted': '0 8px 24px -8px rgba(0, 0, 0, 0.12), 0 16px 48px -16px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

