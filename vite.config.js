import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Zmień 'kalkulator-finansowy' na nazwę twojego repozytorium GitHub
const base = '/kalkulator-finansowy/'; 

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: base,
  build: {
    outDir: 'dist',
    emptyOutDir: true, // To wymusi wyczyszczenie folderu dist przed budowaniem
  }
})