/**
 * Origem da visita (de onde veio quem se cadastra) — para saber qual anúncio
 * ou campanha traz assinante.
 *
 * Guarda o PRIMEIRO toque (utm_* e o fbclid do clique no anúncio da Meta) no
 * navegador e manda junto no cadastro (user_metadata). Nada sai do navegador
 * antes do cadastro, e nada aqui é dado pessoal.
 *
 * O fbc (clique da Meta) só vai para o servidor com o consentimento do banner:
 * é ele que liga a assinatura ao anúncio na API de Conversões.
 */

import { hasAnalyticsConsent } from "./analytics";
import { lerFbp } from "./metaPixel";

const CHAVE = "ncf-origem-v1";
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export interface OrigemVisita {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  /** Formato do Meta: fb.1.<ms>.<fbclid>. */
  fbc?: string;
  /** Só o domínio de quem mandou a visita (sem caminho). */
  referrer?: string;
  chegou_em?: string;
}

const ler = (): OrigemVisita | null => {
  try {
    const raw = localStorage.getItem(CHAVE);
    return raw ? (JSON.parse(raw) as OrigemVisita) : null;
  } catch {
    return null;
  }
};

const limpar = (v: string | null) => (v ?? "").trim().slice(0, 100);

/** Chamar no boot. Grava a origem da primeira visita (as seguintes não sobrescrevem). */
export const capturarOrigem = (): void => {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const atual = ler();
    const fbclid = limpar(params.get("fbclid"));

    // Clique novo num anúncio da Meta renova o fbc (vale o clique mais recente),
    // mesmo quem já tinha origem gravada.
    if (atual) {
      if (fbclid && !atual.fbc?.endsWith(`.${fbclid}`)) {
        localStorage.setItem(CHAVE, JSON.stringify({ ...atual, fbc: `fb.1.${Date.now()}.${fbclid}` }));
      }
      return;
    }

    const origem: OrigemVisita = { chegou_em: new Date().toISOString() };
    for (const k of UTM) {
      const v = limpar(params.get(k));
      if (v) origem[k] = v;
    }
    if (fbclid) origem.fbc = `fb.1.${Date.now()}.${fbclid}`;
    if (!origem.utm_source && fbclid) {
      origem.utm_source = "facebook";
      origem.utm_medium = "paid";
    }
    try {
      const ref = document.referrer ? new URL(document.referrer).hostname : "";
      if (ref && ref !== window.location.hostname) origem.referrer = ref;
    } catch { /* ignore */ }

    // Visita direta sem nada para guardar: não grava, para uma visita futura
    // vinda de anúncio ainda contar como primeiro toque.
    if (Object.keys(origem).length === 1) return;
    localStorage.setItem(CHAVE, JSON.stringify(origem));
  } catch { /* ignore */ }
};

/** UTMs para o evento de cadastro do analytics (sem fbc nem referrer). */
export const utmsDaOrigem = (): Record<string, string> => {
  const o = ler();
  if (!o) return {};
  const r: Record<string, string> = {};
  for (const k of UTM) if (o[k]) r[k] = o[k] as string;
  return r;
};

/**
 * Aceite dado depois do cadastro (banner aceito já logado): grava na conta,
 * para a API de Conversões poder medir a assinatura dessa pessoa.
 */
export const gravarConsentimentoNaConta = async (): Promise<void> => {
  try {
    const { getSupabaseClient } = await import("../services/supabaseClient");
    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await supabase.auth.updateUser({ data: origemParaCadastro() });
  } catch { /* sem sessão ou rede: o consentimento segue salvo no navegador */ }
};

/**
 * Dados que vão no user_metadata do cadastro. As UTMs vão sempre (não são
 * dado pessoal); fbc/fbp/navegador só com o consentimento de medição.
 */
export const origemParaCadastro = (): Record<string, unknown> => {
  const o = ler() ?? {};
  const dados: Record<string, unknown> = {};
  const utms = utmsDaOrigem();
  if (Object.keys(utms).length || o.referrer) {
    dados.origem = { ...utms, ...(o.referrer ? { referrer: o.referrer } : {}), ...(o.chegou_em ? { chegou_em: o.chegou_em } : {}) };
  }
  if (hasAnalyticsConsent()) {
    const fbp = lerFbp();
    dados.consentimento_marketing = true;
    dados.meta = {
      ...(o.fbc ? { fbc: o.fbc } : {}),
      ...(fbp ? { fbp } : {}),
      ua: navigator.userAgent.slice(0, 300),
    };
  }
  return dados;
};
