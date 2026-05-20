/**
 * Z-API global client — Deno / Supabase Edge Functions only.
 *
 * Regras de segurança:
 * - NUNCA expor ZAPI_INSTANCE_ID, ZAPI_TOKEN ou ZAPI_CLIENT_TOKEN no frontend.
 * - NUNCA retornar credenciais ao browser.
 * - Todo envio passa obrigatoriamente pelo backend.
 */

const ZAPI_BASE = "https://api.z-api.io";
const SEND_TIMEOUT_MS = 15_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZApiSendResult {
  success: boolean;
  messageId: string | null;
  zaapId: string | null;
  error: string | null;
}

// ─── Phone helpers ────────────────────────────────────────────────────────────

/**
 * Normaliza o número de telefone para o formato exigido pela Z-API:
 * apenas dígitos, incluindo DDI (55 para Brasil).
 *
 * Exemplos:
 *   "77 9 9988-7720"  → "5577999887720"
 *   "5577999887720"   → "5577999887720"
 *   "+55 77 9988-7720" → "5577999887720"
 */
export const normalizePhone = (raw: string): string => {
  // Remove tudo que não for dígito
  const digits = raw.replace(/\D/g, "");

  // Remove zero inicial (discagem local)
  const noLeadingZero = digits.startsWith("0") ? digits.slice(1) : digits;

  // Se tiver DDI (12-13 dígitos) retorna como está
  if (noLeadingZero.length === 12 || noLeadingZero.length === 13) {
    return noLeadingZero;
  }

  // DDD + número sem DDI (10-11 dígitos) → adiciona 55
  if (noLeadingZero.length === 10 || noLeadingZero.length === 11) {
    return `55${noLeadingZero}`;
  }

  // Qualquer outro tamanho: retorna como está (será rejeitado em validatePhone)
  return noLeadingZero;
};

/**
 * Valida se o número normalizado é um celular brasileiro válido.
 * Aceita 12 dígitos (55 + DDD + 8 dígitos) ou 13 dígitos (55 + DDD + 9 com "9" extra).
 */
export const validatePhone = (normalizedPhone: string): boolean => {
  return /^55\d{10,11}$/.test(normalizedPhone);
};

// ─── Send text ────────────────────────────────────────────────────────────────

/**
 * Envia mensagem de texto pela instância global Z-API.
 * Retorna resultado padronizado — nunca lança exceção para fora.
 */
export const sendTextMessage = async (params: {
  instanceId: string;
  token: string;
  clientToken: string;
  phone: string;
  message: string;
}): Promise<ZApiSendResult> => {
  const { instanceId, token, clientToken, phone, message } = params;
  const url = `${ZAPI_BASE}/instances/${instanceId}/token/${token}/send-text`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        errorBody =
          (errJson as Record<string, unknown>)?.message as string ||
          (errJson as Record<string, unknown>)?.error as string ||
          JSON.stringify(errJson);
      } catch { /* body not JSON */ }

      return { success: false, messageId: null, zaapId: null, error: errorBody };
    }

    const data = await response.json() as Record<string, unknown>;

    return {
      success: true,
      messageId: (data.messageId ?? data.id ?? null) as string | null,
      zaapId: (data.zaapId ?? null) as string | null,
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);

    if (err instanceof Error && err.name === "AbortError") {
      return {
        success: false,
        messageId: null,
        zaapId: null,
        error: `Timeout ao contatar Z-API (${SEND_TIMEOUT_MS / 1000}s).`,
      };
    }

    return {
      success: false,
      messageId: null,
      zaapId: null,
      error: err instanceof Error ? err.message : "Erro desconhecido na Z-API.",
    };
  }
};
