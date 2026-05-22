/**
 * whatsappGatewayService — gerenciamento seguro da instância Z-API.
 *
 * Regras de segurança (IMUTÁVEIS):
 *   - Este serviço NUNCA armazena token, client_token ou instance_id em estado
 *     de componente, localStorage, sessionStorage ou qualquer cache de browser.
 *   - Todas as operações com credenciais são realizadas via Edge Function backend.
 *   - O browser recebe APENAS: status, connected, connected_pending_phone,
 *     phone_number_masked, updated_at e qrCode (imagem sem credencial).
 *   - Este serviço NUNCA faz select em platform_integrations diretamente.
 */

import { getSupabaseClient } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Campos seguros retornados pelo backend — sem token, sem client_token */
export interface GatewayStatus {
  status:                  "active" | "inactive" | "testing" | "error";
  connected:               boolean;
  connected_pending_phone: boolean;
  /** Número mascarado, ex: "5511*****321" */
  phone_number_masked:     string | null;
  updated_at:              string | null;
}

export interface GatewaySaveResult {
  ok:      boolean;
  message: string;
}

export interface GatewayValidateResult extends GatewayStatus {
  ok:      boolean;
  message: string;
}

export interface GatewayQRResult {
  ok:      boolean;
  /** QR Code data (imagem base64 ou string sem credenciais) */
  qrCode:  string | null;
  error?:  string;
}

// ─── Admin token (browser-session only, never persisted) ─────────────────────

/**
 * Token de admin é aceito via parâmetro de chamada — NUNCA armazenado em
 * estado de componente persistente, localStorage ou cookies.
 * O componente deve obtê-lo via input do usuário e descartá-lo após uso.
 */

// ─── Service ──────────────────────────────────────────────────────────────────

export const whatsappGatewayService = {

  /**
   * Busca o status atual da instância Z-API.
   * Retorna apenas campos seguros — sem token, sem client_token.
   */
  async getStatus(): Promise<GatewayStatus> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<GatewayStatus & { ok: boolean }>(
      "whatsapp-gateway",
      { method: "GET" },
    );

    if (error || !data?.ok) {
      return {
        status:                  "error",
        connected:               false,
        connected_pending_phone: false,
        phone_number_masked:     null,
        updated_at:              null,
      };
    }

    return {
      status:                  data.status ?? "inactive",
      connected:               data.connected ?? false,
      connected_pending_phone: data.connected_pending_phone ?? false,
      phone_number_masked:     data.phone_number_masked ?? null,
      updated_at:              data.updated_at ?? null,
    };
  },

  /**
   * Salva credenciais Z-API via backend seguro.
   *
   * IMPORTANTE: instanceId, token e clientToken são enviados DIRETAMENTE ao
   * backend via HTTPS e NUNCA ficam em estado de componente após esta chamada.
   * O chamador deve limpar os campos do formulário imediatamente após retorno.
   *
   * Requer header X-Admin-Token com o GATEWAY_ADMIN_SECRET configurado no servidor.
   */
  async saveCredentials(params: {
    instanceId:   string;
    token:        string;
    clientToken:  string;
    adminToken:   string;
  }): Promise<GatewaySaveResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<GatewaySaveResult>(
      "whatsapp-gateway",
      {
        method: "POST",
        body:   { action: "save", instanceId: params.instanceId, token: params.token, clientToken: params.clientToken },
        headers: { "X-Admin-Token": params.adminToken },
      },
    );

    if (error || !data) {
      return { ok: false, message: error?.message ?? "Falha ao salvar credenciais." };
    }
    return data;
  },

  /**
   * Valida a conexão com a Z-API.
   * Atualiza status em platform_integrations e retorna resultado seguro.
   */
  async validateConnection(): Promise<GatewayValidateResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<GatewayValidateResult>(
      "whatsapp-gateway",
      { method: "POST", body: { action: "validate" } },
    );

    if (error || !data) {
      return {
        ok:                      false,
        message:                 error?.message ?? "Falha ao validar conexão.",
        status:                  "error",
        connected:               false,
        connected_pending_phone: false,
        phone_number_masked:     null,
        updated_at:              null,
      };
    }
    return data;
  },

  /**
   * Obtém o QR Code para parear o WhatsApp na instância Z-API.
   * O qrCode retornado é apenas a imagem — sem credenciais incorporadas.
   */
  async getQRCode(): Promise<GatewayQRResult> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.functions.invoke<GatewayQRResult>(
      "whatsapp-gateway",
      { method: "GET", headers: {} },
    );

    // Supabase SDK doesn't support query params directly in invoke — use fetch
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token ?? "";
    const supabaseUrl = (supabase as unknown as { supabaseUrl?: string }).supabaseUrl ?? "";

    if (supabaseUrl && accessToken) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-gateway?action=qr`, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type":  "application/json",
          },
        });
        const json = await res.json() as GatewayQRResult;
        return json;
      } catch (fetchErr) {
        return { ok: false, qrCode: null, error: String(fetchErr) };
      }
    }

    if (error || !data) {
      return { ok: false, qrCode: null, error: error?.message ?? "Falha ao obter QR Code." };
    }
    return data;
  },
};
