/**
 * Regras puras do cadastro de contatos — sem Supabase, sem rede, testáveis.
 *
 * Separado de contactsService.ts justamente para poder ser testado: o serviço
 * importa o cliente Supabase, que depende das variáveis de ambiente do Vite.
 */

import type { Debtor } from "../types";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normaliza o nome do cliente em uma chave estável de casamento. */
export function contactKeyFromName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // pontuação → espaço
    .trim()
    .replace(/\s+/g, " ");
}

/** Considera válido um telefone com 10+ dígitos (DDD + número). */
export function hasValidPhone(phone: string | null | undefined): boolean {
  return Boolean(phone && phone.replace(/\D/g, "").length >= 10);
}

export interface ContactSyncRow {
  user_id: string;
  contact_key: string;
  client_name: string;
  phone: string;
  updated_at: string;
  /** Presente SÓ quando o boleto trouxe representante — ver abaixo. */
  representative_id?: string;
}

/**
 * Monta os lotes de upsert do aprendizado de contatos a partir de devedores.
 *
 * Dois lotes, cada um com colunas uniformes:
 *  - comRep: boletos que trouxeram representante → gravam o representante;
 *  - semRep: boletos sem representante → a coluna NEM APARECE no payload.
 *
 * No upsert do PostgREST, coluna ausente não entra no UPDATE do ON CONFLICT,
 * então o representante que o contato já tinha é preservado. Antes o null era
 * gravado por cima: cadastrar um segundo boleto sem representante — ou importar
 * uma planilha sem essa coluna — fazia o cliente perder o responsável.
 *
 * Dentro do mesmo lote, vale o último telefone válido de cada cliente, mas um
 * boleto sem representante não apaga o que um boleto anterior do mesmo cliente
 * trouxe.
 */
export function buildContactSyncBatches(
  userId: string,
  debtors: Debtor[],
  now: string,
): { comRep: ContactSyncRow[]; semRep: ContactSyncRow[] } {
  const porChave = new Map<string, { client_name: string; phone: string; representative_id: string | null }>();

  for (const d of debtors) {
    if (!hasValidPhone(d.phone)) continue;
    const key = contactKeyFromName(d.client);
    if (!key) continue;
    const repValido =
      d.representativeId && UUID_REGEX.test(d.representativeId) ? d.representativeId : null;
    porChave.set(key, {
      client_name: d.client.trim(),
      phone: d.phone.trim(),
      representative_id: repValido ?? porChave.get(key)?.representative_id ?? null,
    });
  }

  const comRep: ContactSyncRow[] = [];
  const semRep: ContactSyncRow[] = [];
  for (const [contact_key, v] of porChave) {
    const base: ContactSyncRow = {
      user_id: userId,
      contact_key,
      client_name: v.client_name,
      phone: v.phone,
      updated_at: now,
    };
    if (v.representative_id) comRep.push({ ...base, representative_id: v.representative_id });
    else semRep.push(base);
  }
  return { comRep, semRep };
}
