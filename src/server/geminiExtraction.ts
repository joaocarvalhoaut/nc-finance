import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractRequestPayload {
  textContent: string;
  category?: string;
}

export interface GeminiReceivableRecord {
  cliente: string;
  fornecedor: string;
  cnpj_empresa: string;
  telefone: string;
  tipo: string;
  numero_titulo: string;
  vencimento: string;
  dias: string;
  valor: number;
  estado: string;
  emissao_nfe: string;
  pagamento: string;
  valor_pago: number | null;
}

export interface ExtractedDebtorRecord extends GeminiReceivableRecord {
  client: string;
  supplier: string;
  document: string;
  dueDate: string;
  value: number;
  phone: string;
}

export interface ExtractResponsePayload {
  ok: true;
  debtors: ExtractedDebtorRecord[];
  warnings?: string[];
}

// ── Gemini error helpers ──────────────────────────────────────────────────────

/** Extract the numeric HTTP status from a Gemini SDK error */
const getGeminiHttpStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  // SDK wraps errors as { status, message, errorDetails }
  if (typeof e.status === "number") return e.status;
  // Or the raw response body may be embedded in the message string
  const msg = typeof e.message === "string" ? e.message : "";
  const match = msg.match(/"code"\s*:\s*(\d{3})/);
  return match ? parseInt(match[1], 10) : null;
};

/** Parse the `retryDelay` seconds embedded in a Gemini 429 response */
const parseRetryDelaySeconds = (error: unknown): number => {
  try {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    const match = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    return match ? Math.ceil(parseFloat(match[1])) : 0;
  } catch {
    return 0;
  }
};

/**
 * Map a Gemini API error to a short, user-friendly Portuguese message.
 * Never leaks the raw JSON stack to the end-user.
 */
const toFriendlyGeminiError = (error: unknown): string => {
  const status = getGeminiHttpStatus(error);
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (status === 429 || msg.includes("RESOURCE_EXHAUSTED")) {
    const delaySec = parseRetryDelaySeconds(error);
    const tryAgain = delaySec > 0 ? ` Tente novamente em ${delaySec} segundos.` : "";
    return `Limite de requisições da API Gemini atingido (cota gratuita esgotada).${tryAgain} Se o problema persistir, ative o faturamento em console.cloud.google.com.`;
  }
  if (status === 503 || msg.includes("UNAVAILABLE")) {
    return "O serviço Gemini está temporariamente indisponível. Tente novamente em alguns instantes.";
  }
  if (status === 400 || msg.includes("INVALID_ARGUMENT")) {
    return "Texto inválido ou muito curto para extração. Verifique o conteúdo e tente novamente.";
  }
  if (status === 401 || status === 403 || msg.includes("API_KEY") || msg.includes("permission")) {
    return "Chave de API Gemini inválida ou sem permissão. Verifique a variável GEMINI_API_KEY no painel Vercel.";
  }
  if (msg.includes("DEADLINE_EXCEEDED") || msg.includes("504")) {
    return "Extração demorou demais (timeout). Reduza o tamanho do texto e tente novamente.";
  }
  // Fallback — return only the first line to avoid dumping JSON
  const firstLine = msg.split("\n")[0].slice(0, 200);
  return firstLine || "Erro desconhecido ao chamar a API Gemini.";
};

/**
 * Thrown when Gemini returns 429 RESOURCE_EXHAUSTED.
 * The API route propagates it as HTTP 429 + retryAfterSeconds so the
 * frontend can show a countdown and auto-retry without sleeping in the
 * serverless function (which would cause FUNCTION_INVOCATION_TIMEOUT).
 */
export class GeminiRateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "GeminiRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

let ai: GoogleGenAI | null = null;

const getGeminiClient = () => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "nc-finance-vercel",
        },
        timeout: 55000,
      },
    });
  }

  return ai;
};

const normalizeDigits = (value: string | null | undefined) => (value || "").replace(/\D+/g, "");

const normalizeDate = (value: string | null | undefined) => {
  const raw = (value || "").trim();
  const match = raw.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  return match ? match[0] : "";
};

const normalizeMoney = (value: string | number | null | undefined) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : NaN;
  }

  if (!value) return NaN;

  const cleaned = value
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : NaN;
};

const normalizeForMatch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toUpperCase();

const buildPrompt = (textContent: string, category?: string) => `Você vai extrair registros financeiros tabulares de uma lista de recebíveis/cobranças.

Regras obrigatórias:
- Extraia somente registros presentes no texto fornecido.
- Nunca invente nomes, telefones, valores, títulos, datas ou empresas.
- Preserve cada linha da tabela como um registro financeiro.
- Não use exemplos do prompt como dados extraídos.
- Se um campo não existir no texto, use string vazia ou null.
- Retorne JSON puro, sem markdown, comentários ou explicações.
- Datas devem permanecer em formato DD/MM/YYYY.
- Telefones devem conter apenas dígitos.
- Valores monetários devem ser normalizados para decimal com ponto, por exemplo 715.66.

Campos por registro:
- cliente
- fornecedor
- cnpj_empresa
- telefone
- tipo
- numero_titulo
- vencimento
- dias
- valor
- estado
- emissao_nfe
- pagamento
- valor_pago

Categoria contábil selecionada: ${category || "geral"}

Texto real enviado pelo usuário:
"""
${textContent}
"""`;

const toExtractedDebtor = (record: GeminiReceivableRecord): ExtractedDebtorRecord | null => {
  const client = (record.cliente || "").trim();
  const document = (record.numero_titulo || "").trim();
  const dueDate = normalizeDate(record.vencimento);
  const value = normalizeMoney(record.valor);
  const phone = normalizeDigits(record.telefone);

  if (!client || !document || !dueDate || !Number.isFinite(value)) {
    return null;
  }

  return {
    ...record,
    cliente: client,
    fornecedor: (record.fornecedor || "").trim(),
    cnpj_empresa: (record.cnpj_empresa || "").trim(),
    telefone: phone,
    tipo: (record.tipo || "").trim(),
    numero_titulo: document,
    vencimento: dueDate,
    dias: (record.dias || "").toString().trim(),
    valor: value,
    estado: (record.estado || "").trim(),
    emissao_nfe: normalizeDate(record.emissao_nfe),
    pagamento: normalizeDate(record.pagamento),
    valor_pago:
      record.valor_pago === null || record.valor_pago === undefined
        ? null
        : normalizeMoney(record.valor_pago),
    client,
    supplier: (record.fornecedor || "").trim(),
    document,
    dueDate,
    value,
    phone,
  };
};

const validateAgainstSource = (records: ExtractedDebtorRecord[], textContent: string) => {
  const normalizedSource = normalizeForMatch(textContent);

  return records.filter((record) => {
    const normalizedClient = normalizeForMatch(record.client);
    const normalizedDocument = normalizeForMatch(record.document);
    const normalizedDate = normalizeForMatch(record.dueDate);

    return (
      normalizedSource.includes(normalizedClient) &&
      normalizedSource.includes(normalizedDocument) &&
      normalizedSource.includes(normalizedDate)
    );
  });
};

// ~20 000 chars ≈ 5 000 tokens — safe ceiling for gemini-2.0-flash at 60 s
const MAX_TEXT_CHARS = 20_000;

export const extractDebtorsWithGemini = async (
  payload: ExtractRequestPayload,
): Promise<ExtractResponsePayload> => {
  const { category } = payload;
  let { textContent } = payload;

  if (!textContent.trim()) {
    throw new Error("Payload vazio. Envie o texto real do relatório para extração.");
  }

  if (textContent.length > MAX_TEXT_CHARS) {
    console.warn(
      JSON.stringify({
        source: "gemini.extract.truncated",
        original_length: textContent.length,
        truncated_to: MAX_TEXT_CHARS,
      }),
    );
    textContent = textContent.slice(0, MAX_TEXT_CHARS);
  }

  console.log(
    JSON.stringify({
      source: "gemini.extract.request",
      category: category || "geral",
      text_length: textContent.length,
      has_api_key: Boolean(process.env.GEMINI_API_KEY),
    }),
  );

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY não configurada no ambiente.");
  }

  const client = getGeminiClient();

  const geminiConfig = {
    model: "gemini-2.0-flash",
    contents: buildPrompt(textContent, category),
    config: {
      systemInstruction:
        "Você é um extrator rigoroso de recebíveis. Extraia somente dados presentes no texto. Nunca invente registros.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          records: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cliente: { type: Type.STRING },
                fornecedor: { type: Type.STRING },
                cnpj_empresa: { type: Type.STRING },
                telefone: { type: Type.STRING },
                tipo: { type: Type.STRING },
                numero_titulo: { type: Type.STRING },
                vencimento: { type: Type.STRING },
                dias: { type: Type.STRING },
                valor: { type: Type.NUMBER },
                estado: { type: Type.STRING },
                emissao_nfe: { type: Type.STRING },
                pagamento: { type: Type.STRING },
                valor_pago: { type: Type.NUMBER },
              },
              required: ["cliente", "numero_titulo", "vencimento", "valor"],
            },
          },
        },
        required: ["records"],
      },
    },
  };

  // Single attempt — no sleep/retry inside the serverless function.
  // On 429 we throw GeminiRateLimitError so the API route can return HTTP 429
  // with retryAfterSeconds; the frontend countdown handles the retry.
  try {
    console.log(
      JSON.stringify({ source: "gemini.extract.call", model: "gemini-2.0-flash" }),
    );

    const response = await client.models.generateContent(geminiConfig);
    const resultText = response.text;

    console.log(
      JSON.stringify({
        source: "gemini.extract.raw_response",
        has_text: Boolean(resultText),
        preview: resultText ? resultText.slice(0, 400) : null,
      }),
    );

    if (!resultText) {
      throw new Error("Sem resposta textual do Gemini.");
    }

    let parsed: { records?: GeminiReceivableRecord[] };
    try {
      parsed = JSON.parse(resultText.trim()) as { records?: GeminiReceivableRecord[] };
    } catch (parseError) {
      throw new Error(
        `Resposta do Gemini não é JSON válido: ${
          parseError instanceof Error ? parseError.message : "falha desconhecida"
        }`,
      );
    }

    const rawRecords = Array.isArray(parsed.records) ? parsed.records : [];
    const normalizedRecords = rawRecords
      .map((record) => toExtractedDebtor(record))
      .filter((record): record is ExtractedDebtorRecord => Boolean(record));
    const validatedRecords = validateAgainstSource(normalizedRecords, textContent);

    const warnings: string[] = [];
    const expectedByState = (textContent.match(/\bAberto\b/gi) || []).length;
    if (expectedByState > 0 && validatedRecords.length < expectedByState) {
      const warning = `Gemini retornou ${validatedRecords.length} registros válidos para um texto que sugere ${expectedByState} linhas em aberto.`;
      warnings.push(warning);
      console.warn(JSON.stringify({ source: "gemini.extract.warning", warning }));
    }

    if (!validatedRecords.length) {
      throw new Error("Nenhum registro financeiro válido foi extraído do texto enviado.");
    }

    return { ok: true, debtors: validatedRecords, warnings };

  } catch (error) {
    const status = getGeminiHttpStatus(error);

    // Rate-limit: surface as typed error so the API route can return 429
    if (status === 429) {
      const delaySec = parseRetryDelaySeconds(error);
      const waitSec = delaySec > 0 ? delaySec + 5 : 65; // +5 s buffer
      console.warn(
        JSON.stringify({
          source: "gemini.extract.rate_limit",
          retry_after_sec: waitSec,
          original_delay_sec: delaySec,
        }),
      );
      throw new GeminiRateLimitError(
        `Limite de requisições da API Gemini atingido. Tente novamente em ${waitSec} segundos.`,
        waitSec,
      );
    }

    // All other errors — translate to friendly Portuguese, never leak raw JSON
    throw new Error(toFriendlyGeminiError(error));
  }
};
