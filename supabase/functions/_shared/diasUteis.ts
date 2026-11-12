/**
 * diasUteis.ts — vencimento em dia sem expediente bancário (Lei 7.089/1983).
 *
 * Título que vence em sábado, domingo ou feriado pode ser pago no primeiro dia
 * útil seguinte sem juros de mora. Até esse dia o título não corre encargos
 * (nem multa nem juros); depois dele, o atraso conta do vencimento original,
 * como sempre.
 *
 * Feriados: a mesma lista das automações (feriadoNacional, em diaDeEnvio.ts —
 * nacionais + Carnaval, Sexta-feira Santa e Corpus Christi, dias em que os
 * bancos não abrem na maior parte do país). Estaduais e municipais não entram.
 *
 * Módulo puro (sem Deno/npm): usado pelo painel (App.tsx) e pelo servidor
 * (encargos.ts). Datas em "AAAA-MM-DD".
 */

import { feriadoNacional } from "./diaDeEnvio.ts";

const UM_DIA_MS = 86_400_000;

const paraMs = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`);
const somarDias = (ymd: string, dias: number): string =>
  new Date(paraMs(ymd) + dias * UM_DIA_MS).toISOString().slice(0, 10);

const valida = (ymd: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(paraMs(ymd));

/** Dia com expediente bancário: de segunda a sexta e fora dos feriados. */
export function ehDiaUtil(ymd: string): boolean {
  const data = new Date(paraMs(ymd)); // getUTC* devolve o próprio AAAA-MM-DD
  const semana = data.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return feriadoNacional(data) === null;
}

/** O próprio dia, se for útil; senão o primeiro dia útil depois dele. */
export function proximoDiaUtil(ymd: string): string {
  let dia = ymd;
  for (let i = 0; i < 15 && !ehDiaUtil(dia); i++) dia = somarDias(dia, 1);
  return dia;
}

/**
 * true quando o vencimento caiu em dia sem expediente e hoje ainda é, no
 * máximo, o primeiro dia útil seguinte: o título ainda não está em atraso.
 * Data inválida: false (o cálculo segue como antes).
 */
export function noPrazoDoDiaUtil(vencimento: string, hoje: string): boolean {
  if (!valida(vencimento) || !valida(hoje)) return false;
  if (ehDiaUtil(vencimento)) return false;
  return hoje <= proximoDiaUtil(vencimento);
}

/** "DD/MM/AAAA" (painel) → "AAAA-MM-DD"; outro formato passa como veio. */
export const ymdDeDataBr = (data: string): string => {
  const m = (data || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : (data || "").slice(0, 10);
};

/** Hoje no relógio local, "AAAA-MM-DD" (painel; o servidor usa Brasília). */
export const hojeLocal = (agora: Date = new Date()): string =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
