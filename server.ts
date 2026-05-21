import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { extractDebtorsWithGemini } from "./src/server/geminiExtraction";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10mb" }));

app.post("/api/gemini/extract", async (req, res) => {
  const { textContent, category } = req.body ?? {};

  console.log(
    JSON.stringify({
      source: "server.gemini.extract.request",
      method: req.method,
      has_body: Boolean(req.body),
      category,
      text_length: typeof textContent === "string" ? textContent.length : 0,
    }),
  );

  if (!textContent || typeof textContent !== "string") {
    return res.status(400).json({ error: "O texto para extração é obrigatório." });
  }

  try {
    const result = await extractDebtorsWithGemini({ textContent, category });
    return res.status(200).json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "server.gemini.extract.error",
        message: error instanceof Error ? error.message : "Falha desconhecida",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );

    return res.status(500).json({ error: "Falha ao processar a extração com Gemini." });
  }
});

// 2. Z-API: endpoint mock REMOVIDO na Fase Z-API.
// Envio WhatsApp real é feito exclusivamente via Edge Function `send-whatsapp-charge`
// que roda no backend Supabase com as credenciais ZAPI_INSTANCE_ID / ZAPI_TOKEN / ZAPI_CLIENT_TOKEN.
// O frontend NUNCA acessa credenciais Z-API diretamente.

// 3. Google Drive: endpoint mock REMOVIDO na Fase Google Drive.
// Localização de PDFs é feita exclusivamente via Edge Function `match-drive-files`
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
