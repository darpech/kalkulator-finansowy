/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/main.jsx",
    "./src/App.jsx",  // Bezpośrednie wskazanie Twojego pliku
    "./src/**/*.{js,ts,jsx,tsx}", // Zabezpieczenie ogólne
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}