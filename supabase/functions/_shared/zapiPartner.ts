/**
 * zapiPartner.ts — API de parceiro (integrador) da Z-API: criar, assinar e
 * cancelar instâncias sob demanda. Deno / Edge Functions apenas.
 *
 * É o que deixa o cliente conectar o próprio número sozinho: ao clicar em
 * "Conectar WhatsApp", o NC Finance cria uma instância para a conta dele.
 *
 * Secrets:
 *   ZAPI_PARTNER_TOKEN  token de integrador (programa Partner da Z-API)
 *   ZAPI_CLIENT_TOKEN   token de segurança da conta Z-API — vale para todas as
 *                       instâncias da conta, inclusive as criadas aqui
 *
 * Cobrança da Z-API (pós-paga): instância nova tem 2 dias de teste e é apagada
 * se não for assinada. Assinamos quando o número conecta; cancelamos quando a
 * assinatura do NC Finance acaba (ver zapiProvisioning.ts).
 *
 * Endpoints (docs oficiais, repositório Z-API/z-api-docs):
 *   POST /instances/integrator/on-demand                                 criar
 *   POST /instances/{id}/token/{token}/integrator/on-demand/subscription assinar
 *   POST /instances/{id}/token/{token}/integrator/on-demand/cancel       cancelar
 */

const BASE = "https://api.z-api.io/instances";
const TIMEOUT_MS = 20_000;

export class ZApiPartnerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ZApiPartnerError";
  }
}

export const zapiPartnerConfigured = () =>
  Boolean(Deno.env.get("ZAPI_PARTNER_TOKEN") && Deno.env.get("ZAPI_CLIENT_TOKEN"));

const partnerRequest = async <T>(path: string, body?: unknown): Promise<T> => {
  const partnerToken = Deno.env.get("ZAPI_PARTNER_TOKEN") || "";
  if (!partnerToken) throw new ZApiPartnerError(503, "ZAPI_PARTNER_TOKEN nao configurado.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${partnerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
  } catch (err) {
    const timeout = err instanceof Error && err.name === "AbortError";
    throw new ZApiPartnerError(502, timeout ? "Timeout na API de parceiro da Z-API." : "Falha ao contatar a Z-API.");
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  if (!response.ok) {
    // Só status e o início do corpo: a resposta não traz token, mas o path traz
    // — por isso o path nunca vai para o log.
    console.log(JSON.stringify({
      source: "zapi-partner.error", http: response.status,
      action: path.split("/").pop(), body: text.slice(0, 200),
    }));
    throw new ZApiPartnerError(response.status, `Z-API respondeu HTTP ${response.status}.`);
  }
  try { return (text ? JSON.parse(text) : {}) as T; } catch { return {} as T; }
};

/** Cria uma instância. A resposta traz id e token da instância. */
export const createInstance = (params: { name: string; callbacks: Record<string, string> }) =>
  partnerRequest<{ id: string; token: string; due?: number | string }>("/integrator/on-demand", {
    name: params.name,
    ...params.callbacks,
  });

/** Assina (passa a cobrar) uma instância criada por esta API. */
export const subscribeInstance = (id: string, token: string) =>
  partnerRequest(`/${encodeURIComponent(id)}/token/${encodeURIComponent(token)}/integrator/on-demand/subscription`);

/** Cancela a assinatura. A instância segue ativa até o fim do ciclo já pago. */
export const cancelInstance = (id: string, token: string) =>
  partnerRequest(`/${encodeURIComponent(id)}/token/${encodeURIComponent(token)}/integrator/on-demand/cancel`);
