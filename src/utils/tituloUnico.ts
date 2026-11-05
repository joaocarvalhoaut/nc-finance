/**
 * Título único — mesmo cliente, mesmo documento e mesmo vencimento é o MESMO
 * título e não pode existir duas vezes (pedido do dono, 06/11/2026).
 *
 * O documento é comparado só pelos números: "DP 1439/005", "'1439/005" (apóstrofo
 * do Excel) e "1439/005" são o mesmo. Sem número, vale letras + números.
 * Usado na importação, no cadastro manual, no createMany e no aviso de
 * repetidos da Carteira.
 */

import type { Debtor } from "../types";

export const docBase = (doc: string | undefined): string => {
  const s = (doc ?? "").toUpperCase();
  const digitos = s.replace(/\D/g, "");
  return digitos || s.replace(/[^A-Z0-9]/g, "");
};

export const nomeBase = (nome: string | undefined): string =>
  (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

/** null = sem documento (não dá para dizer que é repetido). */
export const chaveDoTitulo = (d: Pick<Debtor, "document" | "client" | "dueDate">): string | null => {
  const doc = docBase(d.document);
  return doc ? `${doc}|${nomeBase(d.client)}|${(d.dueDate ?? "").trim()}` : null;
};

/** Mantém o primeiro de cada título; devolve também quantos saíram. */
export function semRepetidos<T extends Pick<Debtor, "document" | "client" | "dueDate">>(lista: T[]): { lista: T[]; removidos: number } {
  const vistos = new Set<string>();
  const saida = lista.filter((d) => {
    const k = chaveDoTitulo(d);
    if (!k) return true;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { lista: saida, removidos: lista.length - saida.length };
}

/**
 * Repetidos que já estão na carteira: para cada título com cópias, fica a
 * cópia paga (liquidado) ou desabilitada, se houver — senão o cliente voltaria
 * a ser cobrado —; depois, a atualizada por último. As outras saem.
 */
export function repetidosNaCarteira(debtors: Debtor[]): { fica: Debtor; saem: Debtor[] }[] {
  const grupos = new Map<string, Debtor[]>();
  for (const d of debtors) {
    const k = chaveDoTitulo(d);
    if (!k) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  const quando = (d: Debtor) => Date.parse(d.updatedAt ?? d.createdAt ?? "") || 0;
  const fechado = (d: Debtor) => (d.category === "liquidado" ? 2 : d.category === "desabilitado" ? 1 : 0);
  return [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const ordem = [...g].sort((a, b) => fechado(b) - fechado(a) || quando(b) - quando(a));
      return { fica: ordem[0], saem: ordem.slice(1) };
    });
}
