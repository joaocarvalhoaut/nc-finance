import { GoogleGenAI, Type } from "@google/genai";

export interface ExtractRequestPayload {
  textContent: string;
  category?: string;
}

export interface ExtractedDebtorRecord {
  client: string;
  supplier: string;
  document: string;
  dueDate: string;
  value: number;
  phone: string;
}

export interface ExtractResponsePayload {
  debtors: ExtractedDebtorRecord[];
  warning?: string;
}

let ai: GoogleGenAI | null = null;

const getGeminiClient = () => {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[gemini.extract] GEMINI_API_KEY ausente, usando fallback local");
    }

    ai = new GoogleGenAI({
      apiKey: apiKey || "MOCK_API_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "nc-finance-vercel",
        },
      },
    });
  }

  return ai;
};

export const simulateExtraction = (text: string, category = "Vencidos"): ExtractedDebtorRecord[] => {
  const cleaned = text.toLowerCase();
  const names = [
    "Carlos Eduardo Neves",
    "Mariana Silva Bastos",
    "Julio César de Mello",
    "Fernanda Oliveira Ramos",
    "Lucas Pereira de Jesus",
    "Beatriz Costa de Almeida",
  ];
  const suppliers = ["NC Finance Nordeste", "NC Telecom S/A", "Parceiro Logística Ltda"];

  const debtorsList: ExtractedDebtorRecord[] = [];
  const loopCount = Math.max(2, Math.min(5, Math.ceil(text.length / 100)));

  for (let i = 0; i < loopCount; i += 1) {
    const randIdx = (i + cleaned.length) % names.length;
    const randSuppIdx = (i + cleaned.length) % suppliers.length;
    const documentNo = `424${1 + i}-${randIdx}`;

    let dueDateString = "11/03/2026";
    if (category === "Vencidos") {
      dueDateString = "10/05/2026";
    } else if (category === "A vencer") {
      dueDateString = "25/08/2026";
    } else {
      dueDateString = "18/05/2026";
    }

    const baseVal = 400 + (cleaned.length * 17) % 3500;
    const simulatedVal = Math.round(baseVal * 1.5 * 100) / 100;
    const phone = `557799988${7720 + i}`;

    debtorsList.push({
      client: names[randIdx],
      supplier: suppliers[randSuppIdx],
      document: documentNo,
      dueDate: dueDateString,
      value: simulatedVal,
      phone,
    });
  }

  return debtorsList;
};

const buildPrompt = (textContent: string, category?: string) => `Analise o seguinte extrato, relatório ou dados brutos de faturamento em português correspondente à categoria "${category || "geral"}".
Extraia cada devedor/lançamento de cobrança detalhado com os seguintes campos:
- client (Nome do cliente/pagador)
- supplier (Nome do fornecedor/emissor, se identificável. Caso não conste, preencher com "NC Finance" ou empresa principal)
- document (Número do boleto, número da fatura, número da cobrança ou CPF/CNPJ se for o único número livre)
- dueDate (Data de vencimento, formatada rigorosamente como DD/MM/YYYY)
- value (Valor da cobrança numérico, ex: 1500.50. Remova caracteres de moeda)
- phone (Telefone ou número de contato se houver. Exemplo: 5577999881122 ou similar. Caso não exista, preencha com vazio "")

Texto de dados brutos:
"""
${textContent}
"""
`;

export const extractDebtorsWithGemini = async (
  payload: ExtractRequestPayload,
): Promise<ExtractResponsePayload> => {
  const { textContent, category } = payload;
  const key = process.env.GEMINI_API_KEY;

  console.log(
    JSON.stringify({
      source: "gemini.extract.request",
      category: category || "geral",
      text_length: textContent.length,
      has_api_key: Boolean(key),
    }),
  );

  if (!key) {
    return {
      debtors: simulateExtraction(textContent, category),
      warning: "Usado extrator inteligente simulado local devido à ausência da chave Gemini.",
    };
  }

  try {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: buildPrompt(textContent, category),
      config: {
        systemInstruction:
          "Você é um extrator de inteligência de dados especializado em documentos financeiros, contas a receber e boletos de faturamento.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            debtors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  client: { type: Type.STRING },
                  supplier: { type: Type.STRING },
                  document: { type: Type.STRING },
                  dueDate: { type: Type.STRING },
                  value: { type: Type.NUMBER },
                  phone: { type: Type.STRING },
                },
                required: ["client", "dueDate", "value"],
              },
            },
          },
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Sem resposta textual do modelo Gemini.");
    }

    const parsed = JSON.parse(resultText.trim()) as ExtractResponsePayload;
    console.log(
      JSON.stringify({
        source: "gemini.extract.response",
        debtors_count: Array.isArray(parsed.debtors) ? parsed.debtors.length : 0,
      }),
    );

    return parsed;
  } catch (error) {
    console.error(
      JSON.stringify({
        source: "gemini.extract.error",
        message: error instanceof Error ? error.message : "Falha desconhecida",
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );

    return {
      debtors: simulateExtraction(textContent, category),
      warning: "Usado extrator inteligente simulado local devido à instabilidade do serviço.",
    };
  }
};
