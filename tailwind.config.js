/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#F5F3F0',
          100: '#E8E0D6',
          200: '#D4C4B0',
          300: '#B8A088',
          400: '#9C7C60',
          500: '#7A5D47',
          600: '#6B4F3A',
          700: '#5A412F',
          800: '#4A3525',
          900: '#3A2A1D',
          950: '#2A1F15',
        },
        'spiritual': {
          'start': 'rgba(122, 93, 71, 0.1)',
          'end': 'rgba(122, 93, 71, 0.05)',
        },
        'sacred-border': '#7A5D47',
        cz: {
          main: '#412460',
          ink: '#2D2D2D',
          paper: '#E5E1DA',
          'secondary-light': '#B99353',
          'secondary-dark': '#B99353',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-slow': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 25s linear infinite',
        'spin-reverse': 'spinReverse 35s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        spinReverse: {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
      },
    },
  },
  plugins: [],
}


