/**
 * API de Conversões da Meta — conta para o Meta Ads quem começou o teste
 * (StartTrial) e quem virou assinante pagante (Subscribe), mesmo com
 * bloqueador de anúncio ou navegador sem cookie. O anúncio aprende a trazer
 * gente que assina, não só quem clica.
 *
 * Regras (LGPD):
 *  - Só manda para quem aceitou a medição no banner: o front grava
 *    user_metadata.consentimento_marketing (ver src/lib/origemVisita.ts).
 *  - E-mail e id da conta vão em hash SHA-256 (o Meta só compara hashes).
 *    fbc/fbp (cookies do clique) e o navegador vão como o Meta pede.
 *  - Sem META_PIXEL_ID e META_CAPI_TOKEN (secrets do Supabase): não faz nada.
 *  - Falha aqui nunca derruba a cobrança: erro vira log e segue.
 *  - O eventID é o mesmo do Pixel no navegador (trial-<userId>): o Meta conta
 *    uma vez só.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

const PIXEL_ID = (Deno.env.get("META_PIXEL_ID") || "").trim();
const TOKEN = (Deno.env.get("META_CAPI_TOKEN") || "").trim();
const SITE_URL = (Deno.env.get("SITE_URL") || "https://ncfinance.com.br").replace(/\/+$/, "");
const GRAPH = "https://graph.facebook.com/v21.0";

export type EventoConversao = "StartTrial" | "Subscribe";

const sha256 = async (texto: string): Promise<string> => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const texto = (v: unknown, max = 300): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

export const enviarConversaoMeta = async (
  admin: AdminClient,
  userId: string,
  evento: EventoConversao,
  dados: { value: number; plano?: string; eventId: string },
): Promise<void> => {
  if (!PIXEL_ID || !TOKEN) return;
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    if (meta.consentimento_marketing !== true) return;

    const clique = (meta.meta ?? {}) as Record<string, unknown>;
    const email = data.user.email?.trim().toLowerCase();
    const userData: Record<string, unknown> = {
      external_id: [await sha256(userId)],
      ...(email ? { em: [await sha256(email)] } : {}),
      ...(texto(clique.fbc) ? { fbc: texto(clique.fbc) } : {}),
      ...(texto(clique.fbp) ? { fbp: texto(clique.fbp) } : {}),
      ...(texto(clique.ua) ? { client_user_agent: texto(clique.ua) } : {}),
    };

    const res = await fetch(`${GRAPH}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        access_token: TOKEN,
        data: [{
          event_name: evento,
          event_time: Math.floor(Date.now() / 1000),
          event_id: dados.eventId,
          action_source: "website",
          event_source_url: SITE_URL,
          user_data: userData,
          custom_data: {
            value: dados.value,
            currency: "BRL",
            ...(dados.plano ? { content_name: dados.plano } : {}),
          },
        }],
      }),
    });
    console.log(JSON.stringify({ source: "meta.capi", event: evento, user_id: userId, http: res.status }));
  } catch (e) {
    console.log(JSON.stringify({
      source: "meta.capi.error", event: evento, user_id: userId,
      message: e instanceof Error ? e.message : "erro",
    }));
  }
};
