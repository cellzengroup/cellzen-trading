import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/',

  root: './frontend',
  publicDir: './public',

  server: {
    port: 3300,
    host: '127.0.0.1',
    strictPort: true,
    hmr: true,
    // Proxy API calls to the backend so the browser talks to the dev server
    // same-origin (no CORS, no cross-origin failures). Use 127.0.0.1 (not
    // "localhost") so Windows doesn't try IPv6 ::1 first and fail with EACCES —
    // the backend listens on IPv4. Override with VITE_DEV_API_TARGET if needed.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5300',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'cellzen-trading.onrender.com',
      '.onrender.com',
      'www.cellzen.com.np',
      'localhost',
      '127.0.0.1'
    ]
  },
  preview: {
    port: process.env.PORT || 3300,
    host: '0.0.0.0',
    strictPort: false,
    // Allow all hosts for Render deployment (Render uses dynamic hostnames)
    // In production, this is safe as the server is behind Render's proxy
    allowedHosts: true
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
      'src': path.resolve(__dirname, './frontend/src'),
      'components': path.resolve(__dirname, './frontend/src/components'),
      'utils': path.resolve(__dirname, './frontend/src/utils'),
      'exceljs': path.resolve(__dirname, './node_modules/exceljs/dist/exceljs.min.js'),
    },
    extensions: ['.js', '.jsx', '.json', '.ts', '.tsx']
  },
  optimizeDeps: {
    include: ['exceljs'],
  },
  build: {
    sourcemap: true,
    outDir: '../dist'
  }
});

