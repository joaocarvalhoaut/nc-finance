import { extractDebtorsWithGemini } from "../../src/server/geminiExtraction";

type RequestBody = {
  textContent?: string;
  category?: string;
};

type VercelLikeRequest = {
  method?: string;
  body?: RequestBody | string;
  headers?: Record<string, string | string[] | undefined>;
};

type VercelLikeResponse = {
  status: (code: number) => VercelLikeResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string | string[]) => void;
};

const parseBody = (body: RequestBody | string | undefined): RequestBody => {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as RequestBody;
    } catch {
      return {};
    }
  }
  return body;
};

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  console.log(
    JSON.stringify({
      source: "vercel.gemini.extract.request",
      method: req.method || "UNKNOWN",
    }),
  );

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const payload = parseBody(req.body);
  const { textContent, category } = payload;

  console.log(
    JSON.stringify({
      source: "vercel.gemini.extract.payload",
      category: category || "geral",
      text_length: typeof textContent === "string" ? textContent.length : 0,
      content_type: req.headers?.["content-type"] || null,
    }),
  );

  if (!textContent || typeof textContent !== "string") {
    return res.status(400).json({ error: "O texto para extração é obrigatório." });
  }

  try {
    const result = await extractDebtorsWithGemini({ textContent, category });
    console.log(
      JSON.stringify({
        source: "vercel.gemini.extract.success",
        debtors_count: result.debtors.length,
        warning: result.warning || null,
      }),
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "vercel.gemini.extract.error",
        message: error instanceof Error ? error.message : "Falha desconhecida",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    return res.status(500).json({ error: "Falha ao processar a extração com Gemini." });
  }
}
