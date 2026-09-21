// Issues a locally-trusted HTTPS certificate for the Vite dev server, so
// https://localhost:5124 and https://<pc-ip>:5124 open with no "Not secure"
// warning and the phone camera (which needs a secure context) works.
//
//   npm run dev:cert
//
// Needs mkcert (winget install FiloSottile.mkcert; then `mkcert -install` once
// to trust its local CA on this machine). Re-run whenever the PC's LAN IP
// changes. Output goes to .certs/ (git-ignored — the key must not be committed);
// vite.config.js uses it automatically when present and falls back to a
// self-signed certificate when not.
//
// The phone must trust the same CA once: open https://<pc-ip>:5124/dev-ca.crt
// on it and install the downloaded file (Android: Settings > Security >
// Encryption & credentials > Install a certificate > CA certificate).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.certs');

function findMkcert() {
  const candidates = ['mkcert'];
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'mkcert.exe'));
  }
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['-CAROOT'], { stdio: 'pipe' });
      return bin;
    } catch { /* try the next one */ }
  }
  console.error('mkcert not found. Install it (winget install FiloSottile.mkcert), then run `mkcert -install` once.');
  process.exit(1);
}

// Private-range IPv4 addresses of this machine (what a phone on the same Wi-Fi uses).
function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
    }
  }
  return out;
}

const mkcert = findMkcert();
const names = ['localhost', '127.0.0.1', '::1', ...lanAddresses()];
mkdirSync(outDir, { recursive: true });

execFileSync(
  mkcert,
  ['-cert-file', path.join(outDir, 'dev.pem'), '-key-file', path.join(outDir, 'dev-key.pem'), ...names],
  { stdio: 'inherit' }
);

// The CA's public certificate (never the key) — served by the dev server so a
// phone can download and trust it.
const caRoot = execFileSync(mkcert, ['-CAROOT'], { encoding: 'utf8' }).trim();
const ca = path.join(caRoot, 'rootCA.pem');
if (existsSync(ca)) copyFileSync(ca, path.join(outDir, 'rootCA.pem'));

console.log(`\nCertificate covers: ${names.join(', ')}`);
console.log('Restart the dev server (npm run dev) to pick it up.');
