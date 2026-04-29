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

