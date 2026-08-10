import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
// Respeita a porta atribuída pelo ambiente (preview/host); 3000 como padrão local.
const PORT = Number(process.env.PORT) || 3000;

// Content-Security-Policy e headers de segurança — espelham o vercel.json para
// que o preview local reproduza o comportamento de produção. Origens externas:
//   connect: Supabase (REST + realtime wss) e ViaCEP (autocompletar endereço)
//   style/font: Google Fonts (Inter)  ·  script: apenas 'self' (bundle Vite)
// Stripe usa redirect de página (checkout/portal), não iframe nem fetch, então
// não precisa de frame-src/connect-src próprios.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self' https://hiabmnyyxbedtkigcjdx.supabase.co wss://hiabmnyyxbedtkigcjdx.supabase.co https://viacep.com.br",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

app.use((_req, res, next) => {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  next();
});

app.use(express.json({ limit: "10mb" }));

// 1. Gemini: endpoint REMOVIDO — o pipeline de extracao e 100% local (sem custo
// de API e sem endpoint publico nao autenticado). Caso volte a usar Gemini como
// fallback no futuro, reexpor SOMENTE com autenticacao (JWT do Supabase).

// 2. Z-API: endpoint mock REMOVIDO na Fase Z-API.
// Envio WhatsApp real � feito exclusivamente via Edge Function `send-whatsapp-charge`
// que roda no backend Supabase com as credenciais ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN.
// O frontend NUNCA acessa credenciais Z-API diretamente.

// 3. Google Drive: endpoint mock REMOVIDO na Fase Google Drive.
// Localiza��o de PDFs � feita exclusivamente via Edge Function `match-drive-files`
// que roda no backend Supabase com os segredos GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_DRIVE_FOLDER_ID.
// O frontend NUNCA acessa credenciais Google diretamente.

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NC Finance backend running on port http://0.0.0.0:${PORT}`);
  });
}

void startServer();
