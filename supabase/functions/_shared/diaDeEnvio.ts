/**
 * Dia de envio das automações — "Só dias úteis (seg–sex)" e "Pular feriados
 * nacionais" da regra. Data no horário de Brasília (UTC-3, como em
 * automationClock.ts). Feriados: mesma lista de src/utils/brazilHolidays.ts
 * (a que a tela usa para avisar "Hoje é feriado"). Mudou lá, muda aqui.
 */

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Páscoa (Meeus/Jones/Butcher), em UTC. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const chave = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

export function feriadoNacional(dataBrasilia: Date): string | null {
  const fixos: Record<string, string> = {
    "01-01": "Confraternização Universal", "04-21": "Tiradentes", "05-01": "Dia do Trabalho",
    "09-07": "Independência", "10-12": "Nossa Sra. Aparecida", "11-02": "Finados",
    "11-15": "Proclamação da República", "11-20": "Consciência Negra", "12-25": "Natal",
  };
  const p = pascoa(dataBrasilia.getUTCFullYear()).getTime();
  const moveis: Record<string, string> = {
    [chave(new Date(p - 48 * DIA_MS))]: "Carnaval",
    [chave(new Date(p - 47 * DIA_MS))]: "Carnaval",
    [chave(new Date(p - 2 * DIA_MS))]:  "Sexta-feira Santa",
    [chave(new Date(p))]:               "Páscoa",
    [chave(new Date(p + 60 * DIA_MS))]: "Corpus Christi",
  };
  const k = chave(dataBrasilia);
  return fixos[k] ?? moveis[k] ?? null;
}

const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** null = hoje é dia de envio; senão, o motivo ("sábado", "feriado: Finados"). */
export function motivoSemEnvio(modo: string | null | undefined, pularFeriados: boolean, agora: Date): string | null {
  const brasilia = new Date(agora.getTime() - OFFSET_MS);
  const dow = brasilia.getUTCDay();
  if (modo === "weekdays" && (dow === 0 || dow === 6)) return NOMES_DIA[dow];
  if (pularFeriados) {
    const f = feriadoNacional(brasilia);
    if (f) return `feriado: ${f}`;
  }
  return null;
}
