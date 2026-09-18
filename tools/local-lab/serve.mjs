import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('../../', import.meta.url));
const status = JSON.parse(await readFile(new URL('../../.local/ncfinance-lab/status.json', import.meta.url), 'utf8'));
const api = 'http://127.0.0.1:55321';
assert.equal(new URL(status.API_URL).origin, api, 'O frontend de teste exige o backend local.');
assert.ok(status.ANON_KEY, 'Chave pública local ausente.');
// Não herda variáveis VITE_ do terminal, nem lê .env/config do servidor normal.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key];
const csp = [
  "default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "worker-src 'self' blob:",
  `connect-src 'self' ${api} ws://127.0.0.1:55321 ws://127.0.0.1:5300`,
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const server = await createServer({
  root, configFile: false, envFile: false, envDir: false, envPrefix: 'NC_LAB_UNUSED_',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(api),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(status.ANON_KEY),
    'import.meta.env.VITE_POSTHOG_KEY': '""',
    'import.meta.env.VITE_SENTRY_DSN': '""',
  },
  resolve: { alias: { '@': root } },
  plugins: [react(), tailwindcss(), {
    name: 'local-lab-boundary',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        let pathname;
        try { pathname = decodeURIComponent((req.url ?? '').split('?')[0]); } catch { res.statusCode = 400; res.end(); return; }
        if (/(^|[/\\])(\.git|\.local|\.env[^/\\]*)([/\\]|$)/i.test(pathname)) {
          res.statusCode = 403; res.end('Arquivo privado do laboratório.'); return;
        }
        next();
      });
    },
    transformIndexHtml(html) {
      return html.replace('</body>', '<aside style="position:fixed;bottom:4px;right:4px;z-index:9999;background:#451a03;color:#fef3c7;padding:6px 10px;border-radius:6px;font:12px sans-serif;pointer-events:none">LABORATÓRIO LOCAL · Dados fictícios</aside></body>');
    },
  }],
  server: {
    host: '127.0.0.1', port: 5300, strictPort: true,
    headers: { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' },
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**'] },
  },
});
await server.listen();
console.log('NC Finance local: http://127.0.0.1:5300 — conexões externas bloqueadas por CSP.');
