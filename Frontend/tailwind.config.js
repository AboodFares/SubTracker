/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Enable class-based dark mode
  theme: {
    extend: {
      animation: {
        'marquee': 'marquee 25s linear infinite',
        'orb-1': 'orb1 8s ease-in-out infinite',
        'orb-2': 'orb2 10s ease-in-out infinite',
        'orb-3': 'orb3 12s ease-in-out infinite',
        'cta-pulse': 'ctaPulse 2.5s ease-in-out infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        orb1: {
          '0%, 100%': { transform: 'translate(-50%, 0) scale(1)', opacity: '0.15' },
          '50%': { transform: 'translate(-50%, -30px) scale(1.1)', opacity: '0.2' },
        },
        orb2: {
          '0%, 100%': { transform: 'translateX(0) scale(1)', opacity: '0.10' },
          '50%': { transform: 'translateX(40px) scale(1.15)', opacity: '0.18' },
        },
        orb3: {
          '0%, 100%': { transform: 'translateX(0) scale(1)', opacity: '0.10' },
          '50%': { transform: 'translateX(-40px) scale(1.15)', opacity: '0.18' },
        },
        ctaPulse: {
          '0%, 100%': { opacity: '0', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}

