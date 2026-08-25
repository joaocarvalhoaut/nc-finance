/**
 * whatsappProvider.ts — seletor de gateway de WhatsApp.
 *
 * Permite alternar entre a Z-API (atual) e a WhatsApp Cloud API (Meta oficial)
 * sem reescrever os callers, controlado pela secret WHATSAPP_PROVIDER.
 *
 *   WHATSAPP_PROVIDER = "zapi"   (default) → mantém o comportamento atual
 *   WHATSAPP_PROVIDER = "cloud"           → usa a Cloud API oficial
 *
 * Enquanto a conta Meta não estiver aprovada, NÃO defina a secret — o sistema
 * segue 100% na Z-API. A virada é só setar a secret e configurar as credenciais.
 *
 * Segurança: este módulo é backend-only. NÃO importar no frontend.
 */

import type { CloudCredentials } from "./whatsappCloud.ts";

export type WhatsappProvider = "zapi" | "cloud";

/** Provider ativo. Default "zapi" — a Cloud só entra quando explicitamente setada. */
export const getWhatsappProvider = (): WhatsappProvider => {
  const v = (Deno.env.get("WHATSAPP_PROVIDER") ?? "").trim().toLowerCase();
  return v === "cloud" ? "cloud" : "zapi";
};

/**
 * Carrega credenciais da Cloud API a partir das secrets.
 * Retorna null se incompletas (caller deve tratar com erro claro).
 *
 * Secrets:
 *   WHATSAPP_TOKEN            → Permanent Access Token (System User)
 *   WHATSAPP_PHONE_NUMBER_ID  → Phone Number ID
 */
export const loadCloudCredentials = (): CloudCredentials | null => {
  const token = Deno.env.get("WHATSAPP_TOKEN")?.trim() ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() ?? "";
  if (token && phoneNumberId) return { token, phoneNumberId };
  return null;
};

/**
 * Config do template de cobrança (Cloud API). Como a mensagem proativa exige
 * um template aprovado pela Meta, o nome e o idioma são parametrizáveis por
 * secret — assim você ajusta sem redeploy quando o template for aprovado.
 *
 * Secrets:
 *   WHATSAPP_CHARGE_TEMPLATE       → nome do template aprovado (ex.: "cobranca_boleto")
 *   WHATSAPP_CHARGE_TEMPLATE_LANG  → idioma (default "pt_BR")
 */
export const getChargeTemplateConfig = (): { name: string; lang: string } | null => {
  const name = Deno.env.get("WHATSAPP_CHARGE_TEMPLATE")?.trim() ?? "";
  const lang = Deno.env.get("WHATSAPP_CHARGE_TEMPLATE_LANG")?.trim() || "pt_BR";
  if (name) return { name, lang };
  return null;
};
