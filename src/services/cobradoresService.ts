/**
 * cobradoresService — quem cobra cada devedor (tabela user_cobradores).
 *
 * Cobrador NÃO é o representante/responsável (user_representantes): são
 * cadastros diferentes. Cada cobrador ganha uma aba na Carteira. RLS isola
 * por user_id.
 */

import type { Cobrador } from "../types";
import { getSupabaseClient } from "./supabaseClient";

const TABELA = "user_cobradores";
const CAMPOS = "id, user_id, name, phone, color, created_at, updated_at";

type Linha = {
  id: string; user_id: string; name: string; phone: string | null; color: string | null;
  created_at: string; updated_at: string;
};

const paraCobrador = (l: Linha): Cobrador => ({
  id: l.id,
  userId: l.user_id,
  name: l.name,
  phone: l.phone ?? "",
  color: l.color ?? "bg-emerald-500",
  createdAt: l.created_at,
  updatedAt: l.updated_at,
});

export const cobradoresService = {
  async listByUser(userId: string): Promise<Cobrador[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABELA)
      .select(CAMPOS)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Não foi possível carregar os cobradores.");
    return ((data ?? []) as Linha[]).map(paraCobrador);
  },

  async create(userId: string, c: { name: string; phone: string; color: string }): Promise<Cobrador> {
    const { data, error } = await getSupabaseClient()
      .from(TABELA)
      .insert({ user_id: userId, name: c.name.trim(), phone: c.phone.replace(/\D/g, ""), color: c.color })
      .select(CAMPOS)
      .single();
    if (error) throw new Error("Não foi possível criar o cobrador. Tente de novo.");
    return paraCobrador(data as Linha);
  },

  /** Os títulos dele ficam sem cobrador (o banco faz: on delete set null). */
  async remove(userId: string, id: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABELA)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error("Não foi possível excluir o cobrador. Tente de novo.");
  },
};
