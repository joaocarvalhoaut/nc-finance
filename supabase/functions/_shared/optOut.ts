// deno-lint-ignore-file no-explicit-any
/**
 * Lista "não contatar" (opt-out) — consultada antes de todo envio.
 * Ver migration 20260811150000_do_not_contact.sql.
 *
 * Telefones são comparados como dígitos apenas (normalizePhone do zapi.ts já é
 * aplicado pelos chamadores; aqui reforçamos com onlyDigits por segurança).
 */

const onlyDigits = (s: string) => (s ?? "").replace(/\D/g, "");

/** Um único telefone está na lista de não-contatar do usuário? */
export async function isOptedOut(admin: any, userId: string, phone: string): Promise<boolean> {
  const p = onlyDigits(phone);
  if (!p) return false;
  const { data, error } = await admin
    .from("user_do_not_contact")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", p)
    .maybeSingle();
  if (error) {
    console.warn(`[optOut] fail-open (${error.message})`);
    return false; // fail-open: não bloqueia envio por erro de consulta
  }
  return Boolean(data);
}

/** Conjunto de telefones em opt-out — para checagem em lote sem N queries. */
export async function fetchOptOutSet(admin: any, userId: string): Promise<Set<string>> {
  const set = new Set<string>();
  const { data, error } = await admin
    .from("user_do_not_contact")
    .select("phone")
    .eq("user_id", userId);
  if (error) { console.warn(`[optOut] fetchSet fail-open (${error.message})`); return set; }
  for (const r of data ?? []) set.add(onlyDigits(r.phone));
  return set;
}

/** Adiciona um telefone à lista (idempotente via unique). */
export async function addOptOut(
  admin: any,
  userId: string,
  phone: string,
  reason: string,
  source: "manual" | "reply",
): Promise<void> {
  const p = onlyDigits(phone);
  if (!p) return;
  await admin
    .from("user_do_not_contact")
    .upsert({ user_id: userId, phone: p, reason, source }, { onConflict: "user_id,phone", ignoreDuplicates: true });
}

/**
 * Palavras que, recebidas do devedor, disparam opt-out automático.
 * Comparação: texto normalizado (sem acento, minúsculo), match por palavra.
 */
const OPT_OUT_KEYWORDS = [
  "pare", "parar", "para de", "sair", "cancelar", "cancela", "descadastrar",
  "nao quero", "nao perturbe", "me tira", "remover", "stop", "sac",
];

export function isOptOutMessage(text: string): boolean {
  const norm = (text ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!norm) return false;
  return OPT_OUT_KEYWORDS.some((k) => {
    // match por limite de palavra para evitar falso positivo ("separado" ⊄ "pare")
    const re = new RegExp(`(^|\\s)${k.replace(/ /g, "\\s+")}(\\s|$)`);
    return re.test(norm);
  });
}
