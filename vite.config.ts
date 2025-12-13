import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/legalmind-ai/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      external: [
        'react',
        'react-dom/client',
        '@google/generative-ai',
        'lucide-react',
        'react-markdown',
        'pdfjs-dist'
      ]
    }
  }
})
