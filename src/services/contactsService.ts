import { getSupabaseClient } from "./supabaseClient";
import type { Debtor } from "../types";
import { UUID_REGEX, buildContactSyncBatches, contactKeyFromName, hasValidPhone } from "./contactSync";

// Mantém o import de quem já usava daqui (App.tsx, ClientDashboard.tsx).
export { contactKeyFromName } from "./contactSync";

/**
 * Cadastro persistente de contatos por cliente.
 *
 * Acumula telefone / observações já preenchidos para que, em importações ou
 * cadastros futuros, o sistema possa SUGERIR o preenchimento automático
 * (a decisão final é sempre do operador — nunca auto-preenche sem confirmação).
 *
 * Chave de casamento: nome do cliente normalizado (sem acento, minúsculo,
 * pontuação colapsada). É a única chave estável disponível hoje, já que o
 * número do documento varia por título e o CNPJ não é persistido no devedor.
 */

export interface Contact {
  id?: string;
  userId?: string;
  contactKey: string;
  clientName: string;
  phone: string;
  email?: string;
  notes?: string;
  representativeId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface ContactRow {
  id: string;
  user_id: string;
  contact_key: string;
  client_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  representative_id: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE_NAME = "user_contatos";
const SELECT_FIELDS =
  "id, user_id, contact_key, client_name, phone, email, notes, representative_id, created_at, updated_at";
const mapRowToContact = (row: ContactRow): Contact => ({
  id: row.id,
  userId: row.user_id,
  contactKey: row.contact_key,
  clientName: row.client_name,
  phone: row.phone || "",
  email: row.email || "",
  notes: row.notes || "",
  representativeId: row.representative_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const contactsService = {
  async listByUser(userId: string): Promise<Contact[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(SELECT_FIELDS)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Falha ao carregar contatos.");
    }

    return (data || []).map((row) => mapRowToContact(row as ContactRow));
  },

  /**
   * Salva/atualiza um contato pela chave normalizada.
   * Só persiste quando há telefone válido (não cria contatos vazios).
   */
  async upsert(
    userId: string,
    contact: {
      clientName: string;
      phone: string;
      email?: string;
      notes?: string;
      representativeId?: string | null;
    },
  ): Promise<Contact | null> {
    const key = contactKeyFromName(contact.clientName);
    if (!key || !hasValidPhone(contact.phone)) return null;

    const supabase = getSupabaseClient();
    const payload = {
      user_id: userId,
      contact_key: key,
      client_name: contact.clientName.trim(),
      phone: contact.phone.trim(),
      email: contact.email?.trim() || null,
      notes: contact.notes?.trim() || null,
      representative_id:
        contact.representativeId && UUID_REGEX.test(contact.representativeId)
          ? contact.representativeId
          : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: "user_id,contact_key", ignoreDuplicates: false })
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao salvar contato.");
    }

    return mapRowToContact(data as ContactRow);
  },

  /**
   * Grava vários contatos de uma vez (importação de agenda/planilha). Sem a
   * coluna representative_id no payload: o responsável que o contato já tinha
   * fica (ver contactSync.ts). Devolve quantos foram gravados.
   */
  async upsertMany(userId: string, contatos: { clientName: string; phone: string }[]): Promise<number> {
    const agora = new Date().toISOString();
    const porChave = new Map<string, { user_id: string; contact_key: string; client_name: string; phone: string; updated_at: string }>();
    for (const c of contatos) {
      const key = contactKeyFromName(c.clientName);
      if (!key || !hasValidPhone(c.phone)) continue;
      porChave.set(key, { user_id: userId, contact_key: key, client_name: c.clientName.trim(), phone: c.phone.trim(), updated_at: agora });
    }
    const linhas = [...porChave.values()];
    const supabase = getSupabaseClient();
    let gravados = 0;
    for (let i = 0; i < linhas.length; i += 500) {
      const lote = linhas.slice(i, i + 500);
      const { error } = await supabase.from(TABLE_NAME).upsert(lote, { onConflict: "user_id,contact_key", ignoreDuplicates: false });
      if (error) throw new Error("Não foi possível salvar os contatos. Tente de novo.");
      gravados += lote.length;
    }
    return gravados;
  },

  /**
   * Upsert em lote a partir de devedores que tenham telefone válido.
   * Deduplica por chave (mantém o último com telefone). Não bloqueia o fluxo
   * em caso de erro — apenas registra no console.
   */
  async syncFromDebtors(userId: string, debtors: Debtor[]): Promise<void> {
    // Regra (e o porquê dos dois lotes) em contactSync.ts, onde é testada.
    const { comRep, semRep } = buildContactSyncBatches(userId, debtors, new Date().toISOString());
    if (!comRep.length && !semRep.length) return;

    try {
      const supabase = getSupabaseClient();
      for (const lote of [comRep, semRep]) {
        if (!lote.length) continue;
        const { error } = await supabase
          .from(TABLE_NAME)
          .upsert(lote, { onConflict: "user_id,contact_key", ignoreDuplicates: false });
        if (error) console.warn("[contacts.sync]", error.message);
      }
    } catch (err) {
      console.warn("[contacts.sync]", err instanceof Error ? err.message : "falha ao sincronizar contatos");
    }
  },
};
