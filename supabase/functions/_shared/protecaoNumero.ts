/**
 * protecaoNumero.ts — quantas mensagens podem sair hoje do WhatsApp da conta.
 *
 * O número é do próprio cliente (Z-API / WhatsApp comum) e a Meta não publica
 * um teto: o bloqueio vem de pico de volume, número novo e envio para quem
 * nunca falou com ele. Duas travas, que valem para TODO envio (um por um,
 * lote e automação), em qualquer plano:
 *
 *   - Aquecimento: nos primeiros 30 dias de uso o teto sobe aos poucos
 *     (ETAPAS_AQUECIMENTO). Pode ser desligado por quem já usa o número há tempo.
 *   - Limite diário da conta: teto escolhido pelo usuário (opcional).
 *
 * Vale o menor dos dois. A contagem é de MENSAGENS: títulos do mesmo cliente
 * que foram juntos (mesmo provider_message_id) contam uma vez.
 *
 * Módulo puro (sem Deno/npm): usado pelo painel e pelas Edge Functions
 * (a leitura do banco fica em limiteDiario.ts).
 */

export const DIAS_DE_AQUECIMENTO = 30;

/** Teto por dia em cada etapa do aquecimento (dia 1 = primeiro dia de uso). */
export const ETAPAS_AQUECIMENTO: ReadonlyArray<{ ateODia: number; limite: number }> = [
  { ateODia: 3,  limite: 30 },
  { ateODia: 7,  limite: 50 },
  { ateODia: 14, limite: 80 },
  { ateODia: 21, limite: 120 },
  { ateODia: 30, limite: 200 },
];

/** Status de log que significam "a mensagem saiu" (o sync atualiza para entregue/lido). */
export const STATUS_ENVIADO = ["sucesso", "sent", "recebido", "entregue", "lido"] as const;

export interface ProtecaoNumero {
  /** Teto escolhido pelo usuário; null = sem teto próprio. */
  limiteDiario: number | null;
  aquecimentoAtivo: boolean;
  /** Primeiro dia do aquecimento (AAAA-MM-DD, Brasília); null = ainda não começou. */
  aquecimentoInicio: string | null;
}

export interface LimiteDeHoje {
  /** Mensagens permitidas hoje; null = sem limite. */
  limite: number | null;
  /** O que define o limite de hoje. */
  motivo: "aquecimento" | "conta" | null;
  /** Dia do aquecimento (1–30) quando ele ainda está valendo. */
  diaDoAquecimento: number | null;
}

/** Limite de hoje + quantas já saíram e quantas ainda podem sair. */
export interface SituacaoDoDia extends LimiteDeHoje {
  enviadasHoje: number;
  /** Quantas ainda podem sair hoje; null = sem limite. */
  restante: number | null;
}

const UM_DIA_MS = 86_400_000;
const BRASILIA_MS = -3 * 60 * 60 * 1000; // sem horário de verão desde 2019

/** Hoje no fuso de Brasília, AAAA-MM-DD. */
export const hojeEmBrasilia = (agora: Date = new Date()): string =>
  new Date(agora.getTime() + BRASILIA_MS).toISOString().slice(0, 10);

/** Início do dia (meia-noite em Brasília) em ISO/UTC, para filtrar logs. */
export const inicioDoDiaISO = (dia: string): string => `${dia}T03:00:00.000Z`;

const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / UM_DIA_MS);

/** Dia do aquecimento (1 = primeiro). Sem início registrado, hoje é o dia 1. */
export function diaDoAquecimento(inicio: string | null, hoje: string): number {
  if (!inicio || !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return 1;
  return Math.max(1, diasEntre(inicio, hoje) + 1);
}

/** Teto do aquecimento naquele dia; null depois do 30º dia (aquecimento concluído). */
export function limiteDoAquecimento(dia: number): number | null {
  return ETAPAS_AQUECIMENTO.find((e) => dia <= e.ateODia)?.limite ?? null;
}

export function limiteDeHoje(p: ProtecaoNumero, hoje: string): LimiteDeHoje {
  const dia = p.aquecimentoAtivo ? diaDoAquecimento(p.aquecimentoInicio, hoje) : null;
  const doAquecimento = dia !== null ? limiteDoAquecimento(dia) : null;
  const daConta = p.limiteDiario && p.limiteDiario > 0 ? Math.floor(p.limiteDiario) : null;
  const diaValendo = doAquecimento !== null ? dia : null;

  if (doAquecimento !== null && (daConta === null || doAquecimento <= daConta)) {
    return { limite: doAquecimento, motivo: "aquecimento", diaDoAquecimento: diaValendo };
  }
  if (daConta !== null) return { limite: daConta, motivo: "conta", diaDoAquecimento: diaValendo };
  return { limite: null, motivo: null, diaDoAquecimento: null };
}

/**
 * Mensagens que saíram, a partir dos registros do histórico já filtrados pelo
 * dia: títulos que foram juntos têm o mesmo id de mensagem e contam uma vez.
 */
export function contarMensagens(
  logs: ReadonlyArray<{ id: string; status: string; providerMessageId?: string | null }>,
): number {
  const enviadas = new Set<string>();
  for (const l of logs) {
    if (!(STATUS_ENVIADO as readonly string[]).includes(l.status)) continue;
    enviadas.add(l.providerMessageId ? `m:${l.providerMessageId}` : `l:${l.id}`);
  }
  return enviadas.size;
}

/** "aquecimento do número, dia 5 de 30" / "limite diário da conta". */
export function motivoDoLimite(l: LimiteDeHoje): string {
  if (l.motivo === "aquecimento") return `aquecimento do número, dia ${l.diaDoAquecimento} de ${DIAS_DE_AQUECIMENTO}`;
  if (l.motivo === "conta") return "limite diário da conta";
  return "";
}

/** Mensagem mostrada quando o limite de hoje acabou. */
export function mensagemLimiteAtingido(l: LimiteDeHoje): string {
  return `Limite de hoje atingido: ${l.limite} mensagens (${motivoDoLimite(l)}). ` +
    "Os envios voltam amanhã. Para proteger o seu número, o limite fica em Configurações › Proteção do número.";
}
