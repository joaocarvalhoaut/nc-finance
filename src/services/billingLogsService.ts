import type { BillingLog } from "../types";
import { getSupabaseClient } from "./supabaseClient";

type BillingLogStatus =
  | "sent" | "failed"             // legado (seed data)
  | "sucesso" | "erro"            // Z-API real
  | "bloqueado_limite" | "bloqueado_assinatura"
  | "duplicado" | "telefone_invalido";
type BillingLogType = "auto" | "manual";

interface BillingLogRow {
  id: string;
  user_id: string;
  client_name: string;
  document_number: string;
  phone: string;
  amount: number;
  sent_at: string;
  tone: string;
  message: string;
  status: BillingLogStatus;
  type: BillingLogType;
  provider_message_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const TABLE_NAME = "user_logs_cobranca";
const SELECT_FIELDS = `
  id,
  user_id,
  client_name,
  document_number,
  phone,
  amount,
  sent_at,
  tone,
  message,
  status,
  type,
  provider_message_id,
  payload,
  created_at,
  updated_at
`;

const normalizeSentAt = (value: string) => {
  if (!value) {
    return new Date().toISOString();
  }

  const parsedByNativeDate = new Date(value);
  if (!Number.isNaN(parsedByNativeDate.getTime())) {
    return parsedByNativeDate.toISOString();
  }

  const [datePart = "", timePart = "00:00"] = value.split(",");
  const [day, month, year] = datePart.trim().split("/");
  const [hours = "00", minutes = "00"] = timePart.trim().split(":");

  if (!day || !month || !year) {
    return new Date().toISOString();
  }

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hours),
    Number(minutes),
  ).toISOString();
};

const mapRowToBillingLog = (row: BillingLogRow): BillingLog => ({
  id: row.id,
  userId: row.user_id,
  client: row.client_name,
  document: row.document_number,
  phone: row.phone,
  value: Number(row.amount || 0),
  dateSent: row.sent_at ? new Date(row.sent_at).toLocaleString("pt-BR") : "",
  tone: (row.tone as BillingLog["tone"]) || "neutro",
  message: row.message,
  status: row.status,
  type: row.type,
  providerMessageId: row.provider_message_id,
  payload: row.payload,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapBillingLogToRow = (userId: string, log: BillingLog) => ({
  id: log.id || undefined,
  user_id: userId,
  client_name: log.client,
  document_number: log.document,
  phone: log.phone,
  amount: Number(log.value || 0),
  sent_at: normalizeSentAt(log.dateSent),
  tone: log.tone,
  message: log.message,
  status: log.status,
  type: log.type,
  provider_message_id: log.providerMessageId || null,
  payload: log.payload || null
});

export const billingLogsService = {
  async listByUser(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .order("sent_at", { ascending: false });

    if (error) {
      throw new Error(error.message || "Falha ao carregar historico de cobranca.");
    }

    return (data || []).map((row) => mapRowToBillingLog(row as BillingLogRow));
  },

  async create(userId: string, log: BillingLog) {
    const supabase = getSupabaseClient();
    const payload = mapBillingLogToRow(userId, log);
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao registrar log de cobranca.");
    }

    return mapRowToBillingLog(data as BillingLogRow);
  },

  async createMany(userId: string, logs: BillingLog[]) {
    if (!logs.length) return [];

    const supabase = getSupabaseClient();
    const payload = logs.map((log) => {
      const row = mapBillingLogToRow(userId, log);
      delete row.id;
      return row;
    });

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS);

    if (error) {
      throw new Error(error.message || "Falha ao registrar lote de logs.");
    }

    return (data || []).map((row) => mapRowToBillingLog(row as BillingLogRow));
  },

  async update(userId: string, log: BillingLog) {
    const supabase = getSupabaseClient();
    const payload = mapBillingLogToRow(userId, log);
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", log.id)
      .eq("user_id", userId)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao atualizar log de cobranca.");
    }

    return mapRowToBillingLog(data as BillingLogRow);
  },

  async remove(userId: string, logId: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq("id", logId)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Falha ao excluir log de cobranca.");
    }
  }
};
