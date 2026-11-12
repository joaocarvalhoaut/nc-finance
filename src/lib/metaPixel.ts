/**
 * Meta Pixel (anúncios do Facebook/Instagram) — mede cadastro, início do teste
 * e assinatura para o Meta Ads otimizar as campanhas.
 *
 * Mesmas regras do analytics (LGPD):
 *  - Só carrega com o consentimento do banner ("Aceitar") e com
 *    VITE_META_PIXEL_ID definido (Vercel). Sem um dos dois, é no-op.
 *  - Nenhum dado pessoal vai pelo Pixel: sem e-mail, nome, telefone ou CPF.
 *    O casamento com a pessoa é feito pelo servidor (API de Conversões, com
 *    e-mail em hash SHA-256 — ver supabase/functions/_shared/metaCapi.ts).
 *  - Cada evento leva um eventID; o servidor manda o mesmo id, e o Meta
 *    descarta a cópia (deduplicação).
 *
 * O script é carregado por aqui (sem <script> inline), então o CSP só precisa
 * liberar connect.facebook.net (script) e www.facebook.com (connect).
 */

const PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined)?.trim();

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  loaded: boolean;
  version: string;
  push: Fbq;
};

declare global {
  interface Window { fbq?: Fbq; _fbq?: Fbq }
}

let iniciado = false;

/** Liga o Pixel (idempotente). Chamar só com consentimento. */
export const iniciarPixel = (): void => {
  if (iniciado || !PIXEL_ID || typeof window === "undefined") return;
  iniciado = true;

  // Fila igual à do snippet oficial: eventos chamados antes do script carregar
  // ficam guardados e saem quando ele chega.
  if (!window.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;

    const s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(s);
  }

  // Sem coleta automática (cliques, conteúdo da página, campos de formulário):
  // dentro do app a tela tem dados de devedores. Só saem os eventos nomeados.
  window.fbq("set", "autoConfig", false, PIXEL_ID);
  window.fbq("init", PIXEL_ID);
  window.fbq("track", "PageView");
};

export type EventoMeta = "CompleteRegistration" | "Lead" | "StartTrial" | "Subscribe" | "InitiateCheckout";

/**
 * Evento padrão do Meta. `eventId` deduplica com a API de Conversões.
 * NUNCA passe dado pessoal em `params` — só valor, moeda e plano.
 */
export const eventoMeta = (
  nome: EventoMeta,
  params?: { value?: number; currency?: "BRL"; content_name?: string },
  eventId?: string,
): void => {
  if (!iniciado || !window.fbq) return;
  try {
    window.fbq("track", nome, params ?? {}, eventId ? { eventID: eventId } : undefined);
  } catch { /* ignore */ }
};

/** Cookie _fbp (navegador) — vai para o servidor casar os eventos da API de Conversões. */
export const lerFbp = (): string | null => {
  try {
    const m = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
};
