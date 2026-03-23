import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/gamma': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/gamma/, ''),
      },
      '/api/clob': {
        target: 'https://clob.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/clob/, ''),
      },
      '/api/data': {
        target: 'https://data-api.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/data/, ''),
      },
      '/api/bridge': {
        target: 'https://bridge.polymarket.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/bridge/, ''),
      },
      '/api/predict': {
        target: 'https://api.predict.fun',
        changeOrigin: true,
        headers: process.env.VITE_PREDICT_API_KEY
          ? { 'x-api-key': process.env.VITE_PREDICT_API_KEY }
          : undefined,
        rewrite: (p) => p.replace(/^\/api\/predict/, ''),
      },
      '/api/proxy': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/api/onboard': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/onboard/, '/onboard'),
      },
    },
  },
})
