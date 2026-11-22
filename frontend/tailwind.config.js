/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#7DD3FC',
          purple: '#C4B5FD',
          green: '#86EFAC',
          pink: '#F9A8D4',
          primary: '#3B82F6',
        },
        cctv: {
          bg: '#0A0E27',
          sidebar: '#0F1429',
          card: '#151B3D',
          border: '#1E2746',
          accent: '#3B82F6',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
