import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

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
