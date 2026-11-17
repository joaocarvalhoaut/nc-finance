/**
 * Importação de um título que pode já existir — regras puras, sem rede.
 *
 * Mesmo título = mesmo documento (pelos números) + cliente + vencimento
 * (utils/tituloUnico.ts). Cada título que chega é uma de três coisas:
 *  - novo:      não existe na conta (outro documento, outro cliente ou outro
 *               vencimento, ex.: a parcela seguinte) → cria;
 *  - igual:     existe e o arquivo não muda nada → duplicata, nada é gravado;
 *  - atualizar: existe e o arquivo muda algo (valor, tipo, telefone…) → grava
 *               a mudança e MANTÉM o resto.
 *
 * Antes, reimportar gravava a linha inteira do arquivo: o que o relatório não
 * trazia (telefone, observações, banco) ficava vazio, e situação e último
 * envio voltavam ao começo.
 */

import type { Debtor } from "../types";
import { chaveDoTitulo } from "./tituloUnico";

const digitos = (s?: string | null) => (s ?? "").replace(/\D/g, "");
const telefoneValido = (s?: string | null) => digitos(s).length >= 10;
const texto = (s?: string | null) => (s ?? "").trim();

/**
 * O título do arquivo por cima do que já existe. Do arquivo vêm valor, tipo e
 * o que ele trouxer preenchido; campo vazio no arquivo não apaga o que havia.
 * Situação e último envio são da conta, não do relatório: ficam.
 */
export function mesclarComExistente(novo: Debtor, existente: Debtor): Debtor {
  return {
    ...novo,
    id: existente.id,
    // A chave do banco é a grafia já gravada ("DP 1439/005" ≠ "1439/005" lá).
    client: existente.client,
    document: existente.document,
    dueDate: existente.dueDate,
    phone: telefoneValido(novo.phone) ? novo.phone : existente.phone,
    bank: texto(novo.bank) || existente.bank,
    supplier: texto(novo.supplier) || existente.supplier,
    notes: texto(novo.notes) || existente.notes,
    representativeId: novo.representativeId || existente.representativeId,
    cobradorId: novo.cobradorId || existente.cobradorId,
    status: existente.status,
    lastSentMessage: existente.lastSentMessage,
    lastSentDate: existente.lastSentDate,
  };
}

/** O título mesclado difere do gravado? Não → é duplicata. */
export function mudaOTitulo(mesclado: Debtor, existente: Debtor): boolean {
  return Math.abs((Number(mesclado.value) || 0) - (Number(existente.value) || 0)) >= 0.005
    || mesclado.category !== existente.category
    || digitos(mesclado.phone) !== digitos(existente.phone)
    || texto(mesclado.bank) !== texto(existente.bank)
    || texto(mesclado.supplier) !== texto(existente.supplier)
    || texto(mesclado.notes) !== texto(existente.notes)
    || (mesclado.representativeId ?? "") !== (existente.representativeId ?? "")
    || (mesclado.cobradorId ?? "") !== (existente.cobradorId ?? "")
    // Arquivado que volta no relatório volta para a lista ativa.
    || Boolean(existente.archivedAt);
}

export interface Separacao {
  /** Não existem na conta: criar. */
  novos: Debtor[];
  /** Existem e mudaram: já mesclados, prontos para gravar. */
  atualizar: Debtor[];
  /** Existem e vieram iguais: o título gravado, sem tocar. */
  iguais: Debtor[];
  /** Dos atualizados, quantos estavam arquivados e voltam para a lista. */
  voltaram: number;
}

/**
 * Separa o que chegou em novos, atualizações e duplicatas. `existentes` deve
 * ter a conta toda (ativos e arquivados). Com cópias antigas do mesmo título,
 * vale a ativa.
 */
export function separarImportacao(chegaram: Debtor[], existentes: Debtor[]): Separacao {
  const porChave = new Map<string, Debtor>();
  for (const e of existentes) {
    const k = chaveDoTitulo(e);
    if (!k) continue;
    const atual = porChave.get(k);
    if (!atual || (atual.archivedAt && !e.archivedAt)) porChave.set(k, e);
  }

  const out: Separacao = { novos: [], atualizar: [], iguais: [], voltaram: 0 };
  for (const d of chegaram) {
    const k = chaveDoTitulo(d);
    const existente = k ? porChave.get(k) : undefined;
    if (!existente) { out.novos.push(d); continue; }
    const mesclado = mesclarComExistente(d, existente);
    if (mudaOTitulo(mesclado, existente)) {
      out.atualizar.push(mesclado);
      if (existente.archivedAt) out.voltaram++;
    } else {
      out.iguais.push(existente);
    }
  }
  return out;
}
