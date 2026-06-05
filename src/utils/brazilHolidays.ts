/**
 * brazilHolidays.ts
 * Feriados nacionais brasileiros — fixos + móveis (calculados via Páscoa).
 */

/** Algoritmo de Meeus/Jones/Butcher para calcular a Páscoa */
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toKey(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

/** Retorna Set com todas as datas de feriados do ano no formato "MM-DD" */
export function getBrazilHolidays(year: number): Set<string> {
  const fixed = [
    "01-01", // Confraternização Universal
    "04-21", // Tiradentes
    "05-01", // Dia do Trabalho
    "09-07", // Independência do Brasil
    "10-12", // Nossa Sra. Aparecida
    "11-02", // Finados
    "11-15", // Proclamação da República
    "11-20", // Consciência Negra
    "12-25", // Natal
  ];

  const easter = easterDate(year);
  const moveable = [
    addDays(easter, -47), // Carnaval (segunda)
    addDays(easter, -48), // Carnaval (terça) — opcional, muitos consideram
    addDays(easter, -2),  // Sexta-feira Santa
    easter,               // Páscoa
    addDays(easter, 60),  // Corpus Christi
  ].map(toKey);

  return new Set([...fixed, ...moveable]);
}

/**
 * Verifica se uma data é feriado nacional brasileiro.
 * @param date — padrão: hoje
 */
export function isBrazilHoliday(date: Date = new Date()): boolean {
  const holidays = getBrazilHolidays(date.getFullYear());
  return holidays.has(toKey(date));
}

/**
 * Verifica se uma data é dia útil (seg–sex, não feriado).
 */
export function isBusinessDay(date: Date = new Date(), checkHolidays = true): boolean {
  const dow = date.getDay(); // 0=dom, 6=sab
  if (dow === 0 || dow === 6) return false;
  if (checkHolidays && isBrazilHoliday(date)) return false;
  return true;
}

/** Nome do feriado para exibição (se for feriado hoje) */
export function getBrazilHolidayName(date: Date = new Date()): string | null {
  const key = toKey(date);
  const easter = easterDate(date.getFullYear());

  const names: Record<string, string> = {
    "01-01": "Confraternização Universal",
    "04-21": "Tiradentes",
    "05-01": "Dia do Trabalho",
    "09-07": "Independência do Brasil",
    "10-12": "Nossa Sra. Aparecida",
    "11-02": "Finados",
    "11-15": "Proclamação da República",
    "11-20": "Consciência Negra",
    "12-25": "Natal",
    [toKey(addDays(easter, -47))]: "Carnaval",
    [toKey(addDays(easter, -48))]: "Carnaval",
    [toKey(addDays(easter, -2))]:  "Sexta-feira Santa",
    [toKey(easter)]:               "Páscoa",
    [toKey(addDays(easter, 60))]:  "Corpus Christi",
  };

  return names[key] ?? null;
}
