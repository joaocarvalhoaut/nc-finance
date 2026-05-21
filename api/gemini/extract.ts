import { extractDebtorsWithGemini } from "../../src/server/geminiExtraction.js";

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

type ErrorBody = {
  ok: false;
  error: string;
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

const sendJson = (res: VercelLikeResponse, status: number, body: unknown) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
};

const sendError = (res: VercelLikeResponse, status: number, error: string) =>
  sendJson(res, status, { ok: false, error } satisfies ErrorBody);

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  try {
    console.log(
      JSON.stringify({
        source: "vercel.gemini.extract.request",
        method: req.method || "UNKNOWN",
      }),
    );

    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      return sendError(res, 405, "Method Not Allowed");
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

    if (!textContent || typeof textContent !== "string" || !textContent.trim()) {
      return sendError(res, 400, "O texto para extração é obrigatório.");
    }

    const result = await extractDebtorsWithGemini({ textContent, category });
    console.log(
      JSON.stringify({
        source: "vercel.gemini.extract.success",
        debtors_count: result.debtors.length,
        warnings: result.warnings || [],
      }),
    );
    return sendJson(res, 200, result);
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "vercel.gemini.extract.error",
        message: error instanceof Error ? error.message : "Falha desconhecida",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    return sendError(
      res,
      502,
      error instanceof Error ? error.message : "Falha ao processar a extração com Gemini.",
    );
  }
}
