import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/',

  root: './frontend',
  publicDir: './public',

  server: {
    port: 5124,
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
      'www.cellzengroup.com',
      'cellzengroup.com',
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
    // Source maps are disabled in production: generating them for the large
    // three.js / pdfjs / tesseract bundles pushed the build past the memory
    // limit on Render's build container, aborting with SIGABRT (exit 134).
    // They also expose full source publicly, which we don't want in prod.
    sourcemap: false,
    outDir: '../dist',
    emptyOutDir: true,
    // Raise the warning threshold and split the heaviest third-party libs into
    // their own chunks. Smaller chunks lower peak memory during minification
    // (rollup works chunk-by-chunk) and improve browser caching / load.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
          if (id.includes('tesseract')) return 'vendor-tesseract';
          if (id.includes('exceljs') || id.includes('xlsx')) return 'vendor-spreadsheet';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          return undefined;
        }
      }
    }
  }
});

