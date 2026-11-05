/**
 * Título único (servidor) — mesmo cliente, mesmo documento e mesmo vencimento
 * é o MESMO título. Mesma regra de src/utils/tituloUnico.ts (o Deno não importa
 * o src/): documento só pelos números ("DP 1439/005" = "1439/005"), nome sem
 * caixa, acento nem espaço sobrando. Mudou lá, muda aqui.
 */

export const docBase = (doc: string | null | undefined): string => {
  const s = (doc ?? "").toUpperCase();
  const digitos = s.replace(/\D/g, "");
  return digitos || s.replace(/[^A-Z0-9]/g, "");
};

export const nomeBase = (nome: string | null | undefined): string =>
  (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/** null = sem documento (não dá para dizer que é repetido). Vencimento como vier (ISO no banco). */
export const chaveDoTitulo = (doc: string | null | undefined, cliente: string | null | undefined, vencimento: string | null | undefined): string | null => {
  const d = docBase(doc);
  return d ? `${d}|${nomeBase(cliente)}|${(vencimento ?? "").trim()}` : null;
};
