import type { Debtor } from "../types";
import { getSupabaseClient } from "./supabaseClient";

type FinancialCategory = "vencidos" | "a_vencer" | "liquidado";
type FinancialStatus = "pending" | "sent" | "failed";

interface FinancialRecordRow {
  id: string;
  user_id: string;
  client_name: string;
  supplier_name: string;
  document_number: string;
  due_date: string;
  amount: number;
  phone: string | null;
  category: FinancialCategory;
  interest_applied: number | null;
  fine_applied: number | null;
  updated_value: number | null;
  notes: string | null;
  representative_id: string | null;
  status: FinancialStatus;
  last_sent_message: string | null;
  last_sent_date: string | null;
  drive_file_id: string | null;
  drive_file_name: string | null;
  drive_file_url: string | null;
  drive_match_score: number | null;
  drive_last_match_at: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE_NAME = "user_registros_financeiros";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECT_FIELDS = `
  id,
  user_id,
  client_name,
  supplier_name,
  document_number,
  due_date,
  amount,
  phone,
  category,
  interest_applied,
  fine_applied,
  updated_value,
  notes,
  representative_id,
  status,
  last_sent_message,
  last_sent_date,
  drive_file_id,
  drive_file_name,
  drive_file_url,
  drive_match_score,
  drive_last_match_at,
  created_at,
  updated_at
`;

const isValidUUID = (value: string | null | undefined) => Boolean(value && UUID_REGEX.test(value));

const normalizeDateToStorage = (value: string) => {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const [day, month, year] = value.split("/");
  if (!day || !month || !year) {
    return new Date().toISOString().slice(0, 10);
  }

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const formatDateFromStorage = (value: string) => {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${day.padStart(2, "0")}/${month.padStart(2, "0")}/${year}`;
};

const mapRowToDebtor = (row: FinancialRecordRow): Debtor => ({
  id: row.id,
  userId: row.user_id,
  client: row.client_name,
  supplier: row.supplier_name,
  document: row.document_number,
  dueDate: formatDateFromStorage(row.due_date),
  value: Number(row.amount || 0),
  phone: row.phone || "",
  category: row.category,
  interestApplied: row.interest_applied ?? 0,
  fineApplied: row.fine_applied ?? 0,
  updatedValue: row.updated_value ?? Number(row.amount || 0),
  notes: row.notes || "",
  representativeId: row.representative_id || undefined,
  status: row.status,
  lastSentMessage: row.last_sent_message || undefined,
  lastSentDate: row.last_sent_date || undefined,
  driveFileId: row.drive_file_id ?? null,
  driveFileName: row.drive_file_name ?? null,
  driveFileUrl: row.drive_file_url ?? null,
  driveMatchScore: row.drive_match_score ?? null,
  driveLastMatchAt: row.drive_last_match_at ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapDebtorToRow = (userId: string, debtor: Debtor) => ({
  id: debtor.id || undefined,
  user_id: userId,
  client_name: debtor.client,
  supplier_name: debtor.supplier,
  document_number: debtor.document,
  due_date: normalizeDateToStorage(debtor.dueDate),
  amount: Number(debtor.value || 0),
  phone: debtor.phone || null,
  category: debtor.category,
  interest_applied: debtor.interestApplied ?? 0,
  fine_applied: debtor.fineApplied ?? 0,
  updated_value: debtor.updatedValue ?? debtor.value,
  notes: debtor.notes || null,
  representative_id: isValidUUID(debtor.representativeId) ? debtor.representativeId : null,
  status: debtor.status,
  last_sent_message: debtor.lastSentMessage || null,
  last_sent_date: debtor.lastSentDate || null
});

export const financeService = {
  async listByUser(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Falha ao carregar registros financeiros.");
    }

    return (data || []).map((row) => mapRowToDebtor(row as FinancialRecordRow));
  },

  async create(userId: string, debtor: Debtor) {
    const supabase = getSupabaseClient();
    const payload = mapDebtorToRow(userId, debtor);
    if (debtor.representativeId && !payload.representative_id) {
      console.warn("[finance.write] representativeId invalido ignorado", debtor.representativeId);
    }
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao criar registro financeiro.");
    }

    return mapRowToDebtor(data as FinancialRecordRow);
  },

  async createMany(userId: string, debtors: Debtor[]) {
    if (!debtors.length) return [];

    const supabase = getSupabaseClient();
    const payload = debtors.map((debtor) => {
      const row = mapDebtorToRow(userId, debtor);
      if (debtor.representativeId && !row.representative_id) {
        console.warn("[finance.write] representativeId invalido ignorado", debtor.representativeId);
      }
      delete row.id;
      return row;
    });

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS);

    if (error) {
      throw new Error(error.message || "Falha ao criar lote de registros financeiros.");
    }

    return (data || []).map((row) => mapRowToDebtor(row as FinancialRecordRow));
  },

  async update(userId: string, debtor: Debtor) {
    const supabase = getSupabaseClient();
    const payload = mapDebtorToRow(userId, debtor);
    if (debtor.representativeId && !payload.representative_id) {
      console.warn("[finance.write] representativeId invalido ignorado", debtor.representativeId);
    }
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", debtor.id)
      .eq("user_id", userId)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao atualizar registro financeiro.");
    }

    return mapRowToDebtor(data as FinancialRecordRow);
  },

  async remove(userId: string, debtorId: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq("id", debtorId)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Falha ao excluir registro financeiro.");
    }
  }
};
