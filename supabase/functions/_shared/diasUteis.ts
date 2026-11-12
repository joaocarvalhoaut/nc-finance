/**
 * diasUteis.ts — vencimento em dia sem expediente bancário (Lei 7.089/1983).
 *
 * Título que vence em sábado, domingo ou feriado pode ser pago no primeiro dia
 * útil seguinte sem juros de mora. Até esse dia o título não corre encargos
 * (nem multa nem juros); depois dele, o atraso conta do vencimento original,
 * como sempre.
 *
 * Feriados: os nacionais (Lei 662/1949, Lei 6.802/1980, Lei 14.759/2023 —
 * 20/11 a partir de 2024) e os dias em que os bancos não abrem na maior parte
 * do país (segunda e terça de Carnaval, Sexta-feira Santa, Corpus Christi).
 * Feriados estaduais e municipais não entram. Na dúvida, o dia conta como sem
 * expediente: o erro fica a favor do devedor (um dia sem encargos).
 *
 * Módulo puro (sem Deno/npm): usado pelo painel (App.tsx) e pelo servidor
 * (encargos.ts). Datas em "AAAA-MM-DD".
 */

const UM_DIA_MS = 86_400_000;

const paraMs = (ymd: string): number => Date.parse(`${ymd}T00:00:00Z`);
const paraYmd = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const somarDias = (ymd: string, dias: number): string => paraYmd(paraMs(ymd) + dias * UM_DIA_MS);

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), "AAAA-MM-DD". */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const cache = new Map<number, Set<string>>();

/** Feriados nacionais e dias sem expediente bancário do ano. */
export function feriadosBancarios(ano: number): Set<string> {
  const pronto = cache.get(ano);
  if (pronto) return pronto;
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
  if (ano >= 2024) fixos.push("11-20");
  const p = pascoa(ano);
  const dias = new Set<string>([
    ...fixos.map((md) => `${ano}-${md}`),
    somarDias(p, -48), // segunda de Carnaval
    somarDias(p, -47), // terça de Carnaval
    somarDias(p, -2),  // Sexta-feira Santa
    somarDias(p, 60),  // Corpus Christi
  ]);
  cache.set(ano, dias);
  return dias;
}

const valida = (ymd: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(paraMs(ymd));

/** Dia com expediente bancário: de segunda a sexta e fora dos feriados. */
export function ehDiaUtil(ymd: string): boolean {
  const semana = new Date(paraMs(ymd)).getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !feriadosBancarios(Number(ymd.slice(0, 4))).has(ymd);
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
