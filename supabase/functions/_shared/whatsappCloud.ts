/**
 * whatsappCloud.ts — WhatsApp Cloud API (Meta oficial) client.
 * Deno / Supabase Edge Functions only.
 *
 * Espelha a interface de _shared/zapi.ts (mesmo formato de retorno
 * ZApiSendResult) para permitir troca de provider via flag, sem reescrever
 * os callers. zaapId é sempre null aqui (conceito exclusivo da Z-API).
 *
 * Regras de segurança (iguais à Z-API):
 * - NUNCA expor WHATSAPP_TOKEN ou WHATSAPP_PHONE_NUMBER_ID no frontend.
 * - Todo envio passa obrigatoriamente pelo backend.
 *
 * Diferença conceitual importante vs Z-API:
 * - Mensagem PROATIVA (que nós iniciamos, ex.: cobrança) exige um TEMPLATE
 *   pré-aprovado pela Meta → use sendTemplateMessage().
 * - Texto/documento livre (sendTextMessage/sendDocumentMessage) só é entregue
 *   dentro da janela de 24h após o cliente ter respondido (customer service
 *   window). Fora dela a Meta rejeita — por isso a cobrança usa template.
 */

const GRAPH_BASE = "https://graph.facebook.com/v21.0";
const SEND_TIMEOUT_MS = 15_000;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mesmo shape de zapi.ts:ZApiSendResult para os callers serem agnósticos. */
export interface WhatsappSendResult {
  success: boolean;
  messageId: string | null;
  /** sempre null no Cloud — mantido por compatibilidade de interface */
  zaapId: string | null;
  error: string | null;
}

export interface CloudCredentials {
  /** Permanent Access Token (System User) */
  token: string;
  /** Phone Number ID (não é o número em si) */
  phoneNumberId: string;
}

/** Máx de bytes para upload de mídia via /media (limite Meta p/ documento: 100 MB) */
const MAX_DOC_BYTES = 100 * 1024 * 1024;

// ─── Erro padronizado ─────────────────────────────────────────────────────────

const fail = (error: string): WhatsappSendResult => ({
  success: false, messageId: null, zaapId: null, error,
});

/** Extrai a mensagem de erro do corpo de resposta da Graph API. */
const parseGraphError = async (response: Response): Promise<string> => {
  try {
    const j = await response.json() as Record<string, unknown>;
    const err = j?.error as Record<string, unknown> | undefined;
    if (err?.message) {
      const code = err.code ? ` (code ${err.code})` : "";
      const sub = err.error_subcode ? `/${err.error_subcode}` : "";
      return `${err.message}${code}${sub}`;
    }
    return JSON.stringify(j);
  } catch {
    return `HTTP ${response.status}`;
  }
};

/** Lê o messageId (wamid) da resposta de sucesso da Graph API. */
const extractMessageId = (data: Record<string, unknown>): string | null => {
  const messages = data?.messages as Array<Record<string, unknown>> | undefined;
  return (messages?.[0]?.id as string | undefined) ?? null;
};

// ─── Fetch com timeout ────────────────────────────────────────────────────────

const postGraph = async (
  path: string,
  token: string,
  body: unknown,
  timeoutMs = SEND_TIMEOUT_MS,
): Promise<WhatsappSendResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GRAPH_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return fail(await parseGraphError(response));

    const data = await response.json() as Record<string, unknown>;
    return { success: true, messageId: extractMessageId(data), zaapId: null, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return fail(`Timeout ao contatar WhatsApp Cloud API (${timeoutMs / 1000}s).`);
    }
    return fail(err instanceof Error ? err.message : "Erro desconhecido na Cloud API.");
  }
};

// ─── Send text (janela de 24h) ────────────────────────────────────────────────

/**
 * Envia texto livre. SÓ é entregue dentro da janela de 24h de atendimento
 * (após o cliente ter respondido). Para cobrança proativa, use sendTemplateMessage.
 */
export const sendTextMessage = async (params: {
  creds: CloudCredentials;
  phone: string;
  message: string;
}): Promise<WhatsappSendResult> => {
  const { creds, phone, message } = params;
  return postGraph(`${creds.phoneNumberId}/messages`, creds.token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "text",
    text: { preview_url: true, body: message },
  });
};

// ─── Send template (mensagem proativa / cobrança) ─────────────────────────────

export interface TemplateComponentParam {
  type: "text" | "currency" | "date_time";
  text?: string;
}

/**
 * Envia uma mensagem de TEMPLATE pré-aprovado — o caminho oficial para
 * cobranças proativas.
 *
 * @param templateName  nome exato do template aprovado na Meta (ex.: "cobranca_boleto")
 * @param languageCode  ex.: "pt_BR"
 * @param bodyParams    variáveis do corpo, na ordem das {{1}}, {{2}}… do template
 * @param headerDocument (opcional) PDF do boleto no header do template.
 *                       Passe { link, filename } (URL pública) OU { id, filename }
 *                       (media id obtido via uploadMedia).
 * @param urlButtonParam (opcional) sufixo dinâmico do botão URL do template, quando
 *                        o botão foi cadastrado como dynamic URL (ex.: id do boleto).
 */
export const sendTemplateMessage = async (params: {
  creds: CloudCredentials;
  phone: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerDocument?: { link?: string; id?: string; filename: string } | null;
  urlButtonParam?: string | null;
}): Promise<WhatsappSendResult> => {
  const { creds, phone, templateName, languageCode = "pt_BR", bodyParams = [], headerDocument, urlButtonParam } = params;

  const components: Array<Record<string, unknown>> = [];

  if (headerDocument) {
    const doc: Record<string, unknown> = { filename: headerDocument.filename };
    if (headerDocument.id) doc.id = headerDocument.id;
    else if (headerDocument.link) doc.link = headerDocument.link;
    components.push({
      type: "header",
      parameters: [{ type: "document", document: doc }],
    });
  }

  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  if (urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: urlButtonParam }],
    });
  }

  return postGraph(`${creds.phoneNumberId}/messages`, creds.token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  });
};

// ─── Upload de mídia (para enviar bytes de PDF) ───────────────────────────────

/**
 * Faz upload de um PDF para a Cloud API e retorna o media id, usável como
 * headerDocument.id em sendTemplateMessage ou em sendDocumentMessage.
 * (A Cloud API não aceita base64 inline como a Z-API — precisa upar antes,
 *  ou usar um link público.)
 */
export const uploadMedia = async (params: {
  creds: CloudCredentials;
  bytes: Uint8Array;
  fileName: string;
  mimeType?: string;
}): Promise<{ id: string | null; error: string | null }> => {
  const { creds, bytes, fileName, mimeType = "application/pdf" } = params;
  if (bytes.length > MAX_DOC_BYTES) {
    return { id: null, error: `Arquivo muito grande (${(bytes.length / 1024 / 1024).toFixed(1)} MB > 100 MB).` };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS * 2);
  try {
    const response = await fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/media`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${creds.token}` },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return { id: null, error: await parseGraphError(response) };
    const data = await response.json() as Record<string, unknown>;
    return { id: (data.id as string | undefined) ?? null, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return { id: null, error: err instanceof Error ? err.message : "Erro no upload de mídia." };
  }
};

// ─── Send document livre (janela de 24h) ──────────────────────────────────────

/**
 * Envia um PDF como documento livre (só na janela de 24h). Aceita:
 *   - documentUrl (link público — preferível), ou
 *   - documentBytes (será upado via uploadMedia automaticamente).
 * Para cobrança proativa, prefira o PDF no header do template (sendTemplateMessage).
 */
export const sendDocumentMessage = async (params: {
  creds: CloudCredentials;
  phone: string;
  fileName: string;
  documentUrl?: string | null;
  documentBytes?: Uint8Array | null;
  caption?: string | null;
}): Promise<WhatsappSendResult> => {
  const { creds, phone, fileName, documentUrl, documentBytes, caption } = params;

  const document: Record<string, unknown> = { filename: fileName };
  if (caption) document.caption = caption;

  if (documentBytes && documentBytes.length > 0) {
    const up = await uploadMedia({ creds, bytes: documentBytes, fileName });
    if (!up.id) return fail(up.error ?? "Falha no upload do documento.");
    document.id = up.id;
  } else if (documentUrl) {
    document.link = documentUrl;
  } else {
    return fail("Nenhum documento fornecido.");
  }

  return postGraph(`${creds.phoneNumberId}/messages`, creds.token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: phone,
    type: "document",
    document,
  }, SEND_TIMEOUT_MS * 2);
};
