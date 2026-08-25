import posthog from "posthog-js";

/**
 * Analytics de produto (PostHog) — com privacidade máxima por padrão (LGPD).
 *
 * Princípios (dados financeiros de terceiros → cuidado redobrado):
 *  1. OPT-IN real: nada carrega/dispara sem consentimento explícito de analytics.
 *     Enquanto o usuário não aceitar, o PostHog nem é inicializado (nenhuma rede).
 *  2. autocapture DESLIGADO: não capturamos cliques/inputs automaticamente —
 *     só eventos manuais e nomeados (sem conteúdo sensível).
 *  3. Session replay TOTALMENTE mascarado: todo texto e todos os inputs viram
 *     blocos — nunca gravamos telefone, CPF, valor, nome ou mensagem.
 *  4. Rede anti-PII: qualquer propriedade que "cheire" a dado pessoal é redigida
 *     antes de sair do navegador (sanitize_properties).
 *  5. person_profiles = identified_only: anônimos não geram perfil.
 *  6. respeita Do Not Track do navegador.
 *
 * Só habilitamos quando VITE_POSTHOG_KEY está definido (Vercel) — no-op sem ela.
 */

const PH_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const PH_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

const CONSENT_KEY = "ncf-consent-v2";

let initialized = false;

// ─── Consentimento ────────────────────────────────────────────────────────────

interface ConsentRecord { essential: true; analytics: boolean; at: string }

export const getConsent = (): ConsentRecord | null => {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as ConsentRecord) : null;
  } catch {
    return null;
  }
};

export const hasAnalyticsConsent = (): boolean => getConsent()?.analytics === true;

const persistConsent = (analytics: boolean) => {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ essential: true, analytics, at: new Date().toISOString() }));
  } catch { /* ignore */ }
};

// ─── Rede anti-PII ────────────────────────────────────────────────────────────

// Chaves que NUNCA devem sair do navegador em eventos de analytics.
const PII_KEY = /(phone|telefone|cpf|cnpj|email|e-mail|nome|name|valor|amount|message|mensagem|address|endereco|cep|document|token|password|senha)/i;
// Padrões de valor que parecem PII mesmo sem chave suspeita.
const CPF_LIKE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_LIKE = /\b\d{2}\s?9?\d{4}-?\d{4}\b/;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

const redactValue = (v: unknown): unknown => {
  if (typeof v === "string" && (CPF_LIKE.test(v) || PHONE_LIKE.test(v) || EMAIL_LIKE.test(v))) return "[redacted]";
  return v;
};

/** Remove/redige qualquer propriedade sensível. Usado como sanitize_properties global. */
const sanitizeProperties = (properties: Record<string, unknown>): Record<string, unknown> => {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(properties ?? {})) {
    if (PII_KEY.test(k)) { clean[k] = "[redacted]"; continue; }
    // Remove query string de URLs (pode conter tokens/PII).
    if (typeof v === "string" && (k === "$current_url" || k === "$referrer" || k.includes("url"))) {
      clean[k] = v.split("?")[0];
      continue;
    }
    clean[k] = redactValue(v);
  }
  return clean;
};

// ─── Init ─────────────────────────────────────────────────────────────────────

const initPostHog = () => {
  if (initialized || !PH_KEY) return;
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    // ── Privacidade ──
    autocapture: false,                 // sem captura automática de cliques/inputs
    capture_pageview: true,             // pageviews (URL sanitizada pela rede anti-PII)
    capture_pageleave: true,
    person_profiles: "identified_only", // anônimo não vira perfil
    respect_dnt: true,                  // honra Do Not Track
    sanitize_properties: sanitizeProperties,
    disable_session_recording: false,   // replay LIGADO, porém 100% mascarado abaixo
    session_recording: {
      maskAllInputs: true,              // mascara TODOS os inputs
      maskTextSelector: "*",            // mascara TODO texto visível
      maskInputOptions: { password: true },
    },
    loaded: (ph) => { if (import.meta.env.DEV) ph.debug(false); },
  });
  initialized = true;
};

/**
 * Chamar uma vez no boot do app. Só liga o PostHog se já houver consentimento
 * de analytics salvo — senão fica dormente até o usuário aceitar.
 */
export const bootstrapAnalytics = () => {
  if (hasAnalyticsConsent()) initPostHog();
};

/** Usuário aceitou analytics no banner → persiste e liga agora. */
export const grantAnalyticsConsent = () => {
  persistConsent(true);
  initPostHog();
};

/** Usuário recusou analytics (só essenciais) → persiste e garante desligado. */
export const declineAnalyticsConsent = () => {
  persistConsent(false);
  if (initialized) {
    try { posthog.opt_out_capturing(); } catch { /* ignore */ }
  }
};

// ─── API de uso ───────────────────────────────────────────────────────────────

/** Evento nomeado. No-op sem consentimento. NUNCA passe PII em `props`. */
export const track = (event: string, props?: Record<string, unknown>) => {
  if (!initialized) return;
  try { posthog.capture(event, props); } catch { /* ignore */ }
};

/**
 * Vincula os eventos ao usuário — SOMENTE o UUID do Supabase (sem e-mail, nome,
 * CPF etc.). O ID já é opaco e não-PII por si só.
 */
export const identifyUser = (userId: string) => {
  if (!initialized || !userId) return;
  try { posthog.identify(userId); } catch { /* ignore */ }
};

/** Logout → encerra a associação para não misturar sessões. */
export const resetAnalytics = () => {
  if (!initialized) return;
  try { posthog.reset(); } catch { /* ignore */ }
};
