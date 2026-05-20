import type { MessageTemplateRecord, PatternMessage, UserConfig } from "../types";
import { getSupabaseClient } from "./supabaseClient";

interface UserConfigRow {
  user_id: string;
  global_fine_pct: number;
  global_interest_day_pct: number;
  selected_tone: string;
  sheet_url_input: string | null;
  drive_linked_folder: string | null;
  subscription_status: string;
  stripe_customer_id: string | null;
  plan: string;
  usage_counters: Record<string, number> | null;
  whatsapp_status: string;
  integration_provider: string | null;
  last_connection_check: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface MessageTemplateRow {
  id: string;
  user_id: string;
  template_key: string;
  name: string;
  description: string;
  template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

const USER_CONFIG_TABLE = "user_configuracoes";
const MESSAGE_TEMPLATES_TABLE = "user_message_templates";

const USER_CONFIG_FIELDS = `
  user_id,
  global_fine_pct,
  global_interest_day_pct,
  selected_tone,
  sheet_url_input,
  drive_linked_folder,
  subscription_status,
  stripe_customer_id,
  plan,
  usage_counters,
  whatsapp_status,
  integration_provider,
  last_connection_check,
  metadata,
  created_at,
  updated_at
`;

const MESSAGE_TEMPLATE_FIELDS = `
  id,
  user_id,
  template_key,
  name,
  description,
  template,
  is_default,
  created_at,
  updated_at
`;

const mapRowToUserConfig = (row: UserConfigRow): UserConfig => ({
  userId: row.user_id,
  globalFinePct: Number(row.global_fine_pct || 0),
  globalInterestDayPct: Number(row.global_interest_day_pct || 0),
  selectedTone: (row.selected_tone as UserConfig["selectedTone"]) || "amigavel",
  sheetUrlInput: row.sheet_url_input || "",
  driveLinkedFolder: row.drive_linked_folder || "",
  subscriptionStatus: row.subscription_status || "trialing",
  stripeCustomerId: row.stripe_customer_id,
  plan: row.plan || "starter",
  usageCounters: row.usage_counters || {},
  whatsappStatus: row.whatsapp_status || "not_configured",
  integrationProvider: row.integration_provider,
  lastConnectionCheck: row.last_connection_check,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapUserConfigToRow = (config: UserConfig) => ({
  user_id: config.userId,
  global_fine_pct: config.globalFinePct,
  global_interest_day_pct: config.globalInterestDayPct,
  selected_tone: config.selectedTone,
  sheet_url_input: config.sheetUrlInput || null,
  drive_linked_folder: config.driveLinkedFolder || null,
  subscription_status: config.subscriptionStatus,
  stripe_customer_id: config.stripeCustomerId || null,
  plan: config.plan,
  usage_counters: config.usageCounters,
  whatsapp_status: config.whatsappStatus,
  integration_provider: config.integrationProvider || null,
  last_connection_check: config.lastConnectionCheck,
  metadata: null
});

const mapTemplateRowToRecord = (row: MessageTemplateRow): MessageTemplateRecord => ({
  id: row.id,
  userId: row.user_id,
  templateKey: row.template_key as MessageTemplateRecord["templateKey"],
  name: row.name,
  description: row.description,
  template: row.template,
  isDefault: row.is_default,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapPatternToTemplateRow = (userId: string, pattern: PatternMessage) => ({
  user_id: userId,
  template_key: pattern.id,
  name: pattern.name,
  description: pattern.description,
  template: pattern.template,
  is_default: true
});

export const userConfigService = {
  async getConfig(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(USER_CONFIG_TABLE)
      .select(USER_CONFIG_FIELDS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Falha ao carregar configuracoes do usuario.");
    }

    return data ? mapRowToUserConfig(data as UserConfigRow) : null;
  },

  async upsertConfig(config: UserConfig) {
    const supabase = getSupabaseClient();
    const payload = mapUserConfigToRow(config);

    const { data, error } = await supabase
      .from(USER_CONFIG_TABLE)
      .upsert(payload, { onConflict: "user_id" })
      .select(USER_CONFIG_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao salvar configuracoes do usuario.");
    }

    return mapRowToUserConfig(data as UserConfigRow);
  },

  async listMessageTemplates(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(MESSAGE_TEMPLATES_TABLE)
      .select(MESSAGE_TEMPLATE_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Falha ao carregar templates de mensagem.");
    }

    return (data || []).map((row) => mapTemplateRowToRecord(row as MessageTemplateRow));
  },

  async replaceMessageTemplates(userId: string, patterns: PatternMessage[]) {
    const supabase = getSupabaseClient();

    const { error: deleteError } = await supabase
      .from(MESSAGE_TEMPLATES_TABLE)
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      throw new Error(deleteError.message || "Falha ao limpar templates anteriores.");
    }

    if (!patterns.length) {
      return [];
    }

    const payload = patterns.map((pattern) => mapPatternToTemplateRow(userId, pattern));
    const { data, error } = await supabase
      .from(MESSAGE_TEMPLATES_TABLE)
      .insert(payload)
      .select(MESSAGE_TEMPLATE_FIELDS);

    if (error) {
      throw new Error(error.message || "Falha ao salvar templates de mensagem.");
    }

    return (data || []).map((row) => mapTemplateRowToRecord(row as MessageTemplateRow));
  }
};
