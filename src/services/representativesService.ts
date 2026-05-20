import type { Representative } from "../types";
import { getSupabaseClient } from "./supabaseClient";

interface RepresentativeRow {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  role: string;
  color: string;
  created_at: string;
  updated_at: string;
}

const TABLE_NAME = "user_representantes";
const SELECT_FIELDS = "id, user_id, name, phone, role, color, created_at, updated_at";

const mapRowToRepresentative = (row: RepresentativeRow): Representative => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  phone: row.phone,
  role: row.role,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapRepresentativeToRow = (userId: string, representative: Representative) => ({
  id: representative.id || undefined,
  user_id: userId,
  name: representative.name,
  phone: representative.phone,
  role: representative.role,
  color: representative.color
});

export const representativesService = {
  async listByUser(userId: string) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "Falha ao carregar representantes.");
    }

    return (data || []).map((row) => mapRowToRepresentative(row as RepresentativeRow));
  },

  async create(userId: string, representative: Representative) {
    const supabase = getSupabaseClient();
    const payload = mapRepresentativeToRow(userId, representative);
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao criar representante.");
    }

    return mapRowToRepresentative(data as RepresentativeRow);
  },

  async createMany(userId: string, representatives: Representative[]) {
    if (!representatives.length) return [];

    const supabase = getSupabaseClient();
    const payload = representatives.map((representative) => {
      const row = mapRepresentativeToRow(userId, representative);
      delete row.id;
      return row;
    });

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .insert(payload)
      .select(SELECT_FIELDS);

    if (error) {
      throw new Error(error.message || "Falha ao criar representantes.");
    }

    return (data || []).map((row) => mapRowToRepresentative(row as RepresentativeRow));
  },

  async update(userId: string, representative: Representative) {
    const supabase = getSupabaseClient();
    const payload = mapRepresentativeToRow(userId, representative);
    delete payload.id;

    const { data, error } = await supabase
      .from(TABLE_NAME)
      .update(payload)
      .eq("id", representative.id)
      .eq("user_id", userId)
      .select(SELECT_FIELDS)
      .single();

    if (error) {
      throw new Error(error.message || "Falha ao atualizar representante.");
    }

    return mapRowToRepresentative(data as RepresentativeRow);
  },

  async remove(userId: string, representativeId: string) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from(TABLE_NAME)
      .delete()
      .eq("id", representativeId)
      .eq("user_id", userId);

    if (error) {
      throw new Error(error.message || "Falha ao excluir representante.");
    }
  }
};
