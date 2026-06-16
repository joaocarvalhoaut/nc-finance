import { getSupabaseClient } from "./supabaseClient";
import type { Debtor } from "../types";

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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
function hasValidPhone(phone: string | null | undefined): boolean {
  return Boolean(phone && phone.replace(/\D/g, "").length >= 10);
}

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
   * Upsert em lote a partir de devedores que tenham telefone válido.
   * Deduplica por chave (mantém o último com telefone). Não bloqueia o fluxo
   * em caso de erro — apenas registra no console.
   */
  async syncFromDebtors(userId: string, debtors: Debtor[]): Promise<void> {
    const byKey = new Map<string, { client_name: string; phone: string; representative_id: string | null }>();

    for (const d of debtors) {
      if (!hasValidPhone(d.phone)) continue;
      const key = contactKeyFromName(d.client);
      if (!key) continue;
      byKey.set(key, {
        client_name: d.client.trim(),
        phone: d.phone.trim(),
        representative_id:
          d.representativeId && UUID_REGEX.test(d.representativeId) ? d.representativeId : null,
      });
    }

    if (!byKey.size) return;

    const now = new Date().toISOString();
    const payload = [...byKey.entries()].map(([contact_key, v]) => ({
      user_id: userId,
      contact_key,
      client_name: v.client_name,
      phone: v.phone,
      representative_id: v.representative_id,
      updated_at: now,
    }));

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from(TABLE_NAME)
        .upsert(payload, { onConflict: "user_id,contact_key", ignoreDuplicates: false });
      if (error) console.warn("[contacts.sync]", error.message);
    } catch (err) {
      console.warn("[contacts.sync]", err instanceof Error ? err.message : "falha ao sincronizar contatos");
    }
  },
};
