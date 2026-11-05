/**
 * limiteDiario.ts — situação do dia da conta (lado servidor).
 *
 * Lê a proteção do número em user_configuracoes, conta as mensagens que já
 * saíram hoje (user_logs_cobranca) e devolve quantas ainda podem sair.
 * As regras ficam em protecaoNumero.ts (o painel usa as mesmas).
 *
 * Fail-open: se a leitura falhar (ex.: migração ainda não aplicada), devolve
 * "sem limite" — a trava protege o número, não pode derrubar o envio.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import {
  STATUS_ENVIADO, contarMensagens, hojeEmBrasilia, inicioDoDiaISO, limiteDeHoje,
  type SituacaoDoDia,
} from "./protecaoNumero.ts";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

const SEM_LIMITE: SituacaoDoDia = { limite: null, motivo: null, diaDoAquecimento: null, enviadasHoje: 0, restante: null };

export async function lerSituacaoDoDia(admin: AdminClient, userId: string): Promise<SituacaoDoDia> {
  try {
    const hoje = hojeEmBrasilia();
    const { data: cfg, error } = await admin
      .from("user_configuracoes")
      .select("limite_diario_envios, aquecimento_ativo, aquecimento_inicio")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const c = cfg as { limite_diario_envios: number | null; aquecimento_ativo: boolean | null; aquecimento_inicio: string | null } | null;
    const aquecimentoAtivo = c?.aquecimento_ativo !== false;
    let aquecimentoInicio = c?.aquecimento_inicio ?? null;

    // O aquecimento começa no primeiro envio: grava o dia 1.
    if (aquecimentoAtivo && !aquecimentoInicio) {
      aquecimentoInicio = hoje;
      if (c) {
        await admin.from("user_configuracoes")
          .update({ aquecimento_inicio: hoje })
          .eq("user_id", userId)
          .is("aquecimento_inicio", null);
      } else {
        await admin.from("user_configuracoes")
          .upsert({ user_id: userId, aquecimento_inicio: hoje }, { onConflict: "user_id", ignoreDuplicates: true });
      }
    }

    const limite = limiteDeHoje({
      limiteDiario: c?.limite_diario_envios ?? null,
      aquecimentoAtivo,
      aquecimentoInicio,
    }, hoje);
    if (limite.limite === null) return { ...limite, enviadasHoje: 0, restante: null };

    const { data: logs, error: logsErr } = await admin
      .from("user_logs_cobranca")
      .select("id, status, provider_message_id")
      .eq("user_id", userId)
      .gte("sent_at", inicioDoDiaISO(hoje))
      .in("status", [...STATUS_ENVIADO])
      .limit(5000);
    if (logsErr) throw new Error(logsErr.message);

    const enviadasHoje = contarMensagens(
      ((logs ?? []) as Array<{ id: string; status: string; provider_message_id: string | null }>)
        .map((l) => ({ id: l.id, status: l.status, providerMessageId: l.provider_message_id })),
    );
    return { ...limite, enviadasHoje, restante: Math.max(0, limite.limite - enviadasHoje) };
  } catch (e) {
    console.error("[limiteDiario] leitura falhou (sem limite):", e instanceof Error ? e.message : String(e));
    return SEM_LIMITE;
  }
}
