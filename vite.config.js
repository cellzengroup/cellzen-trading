import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'fs';
import path from 'path';

// Browsers only expose the camera (getUserMedia) on secure contexts: HTTPS or
// localhost. A phone opening http://<pc-ip>:5124 is neither, so the warehouse
// scanner can't start. Serve the dev server over HTTPS. Set VITE_DEV_HTTPS=0 to
// go back to plain HTTP. Only applies to `vite` dev — not build/preview.
const devHttps = process.env.VITE_DEV_HTTPS !== '0';

// Preferred: a certificate issued by the local mkcert CA (`npm run dev:cert`) —
// trusted by this PC (and by any phone that installed the CA), so no "Not
// secure" warning. Without it, fall back to a self-signed cert from basicSsl(),
// which browsers warn about once per device.
const certDir = path.resolve(__dirname, '.certs');
const localCert =
  devHttps && fs.existsSync(path.join(certDir, 'dev.pem')) && fs.existsSync(path.join(certDir, 'dev-key.pem'))
    ? {
        cert: fs.readFileSync(path.join(certDir, 'dev.pem')),
        key: fs.readFileSync(path.join(certDir, 'dev-key.pem')),
      }
    : null;

// Serves the mkcert CA's PUBLIC certificate so a phone can download and trust it:
// https://<pc-ip>:5124/dev-ca.crt. (Dev server only; never part of a build.)
function serveDevCa() {
  const caFile = path.join(certDir, 'rootCA.pem');
  return {
    name: 'dev-serve-local-ca',
    configureServer(server) {
      server.middlewares.use('/dev-ca.crt', (req, res, next) => {
        if (!fs.existsSync(caFile)) return next();
        res.setHeader('Content-Type', 'application/x-x509-ca-cert');
        res.setHeader('Content-Disposition', 'attachment; filename="cellzen-dev-ca.crt"');
        res.end(fs.readFileSync(caFile));
      });
    },
  };
}

// A TLS port drops plain-HTTP connections without answering, so a typed
// http://localhost:5124 or an old bookmark looks like the server is down. Answer
// them with a redirect to the https:// address instead. The request line is
// already consumed by the TLS layer, so the path is lost and it lands on "/";
// the target host is derived from the address the request arrived on.
function httpToHttpsRedirect() {
  return {
    name: 'dev-http-to-https-redirect',
    configureServer(server) {
      server.httpServer?.on('tlsClientError', (err, tlsSocket) => {
        if (err?.code !== 'ERR_SSL_HTTP_REQUEST') return;
        try {
          const raw = tlsSocket._parent; // the underlying net.Socket
          const addr = String(raw.localAddress || '').replace(/^::ffff:/, '');
          const host = !addr || addr === '127.0.0.1' || addr === '::1' ? 'localhost' : addr;
          const port = server.httpServer.address()?.port ?? 5124;
          // 307, not 301: a cached permanent redirect would break plain HTTP later
          // if VITE_DEV_HTTPS=0 is set.
          raw.end(
            `HTTP/1.1 307 Temporary Redirect\r\nLocation: https://${host}:${port}/\r\n` +
            'Cache-Control: no-store\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
          );
        } catch { /* socket already gone */ }
      });
    },
  };
}

export default defineConfig({
  base: '/',

  root: './frontend',
  publicDir: './public',

  server: {
    port: 5124,
    // Listen on all IPv4 interfaces so the dev server is reachable from other
    // devices on the LAN (e.g. a phone on the same Wi-Fi at http://<pc-ip>:5124)
    // as well as from this machine via localhost. Override with VITE_DEV_HOST
    // (e.g. 127.0.0.1) to keep it loopback-only on untrusted networks.
    host: process.env.VITE_DEV_HOST || '0.0.0.0',
    https: localCert || undefined,
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
      // Uploaded product images/PDFs are served by the backend at /uploads; the
      // frontend requests them same-origin (VITE_API_URL is the relative /api).
      '/uploads': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:5300',
        changeOrigin: true,
      },
    },
    allowedHosts: [
      'l78jmacr.up.railway.app',
      '.up.railway.app',
      'www.cellzengroup.com',
      'cellzengroup.com',
      'localhost',
      '127.0.0.1'
    ]
  },
  preview: {
    port: process.env.PORT || 3300,
    host: '0.0.0.0',
    // basicSsl() would otherwise switch preview to HTTPS too; keep it as-is.
    https: false,
    strictPort: false,
    // Allow all hosts for Render deployment (Render uses dynamic hostnames)
    // In production, this is safe as the server is behind Render's proxy
    allowedHosts: true
  },
  plugins: [
    react(),
    ...(devHttps ? [...(localCert ? [serveDevCa()] : [basicSsl()]), httpToHttpsRedirect()] : []),
  ],
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

