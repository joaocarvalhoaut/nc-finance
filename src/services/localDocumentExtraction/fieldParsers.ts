/**
 * Leitura de campos de cobrança a partir do texto de uma célula: data, valor,
 * telefone. Puro (sem DOM) — usado pelo intérprete de tabelas e testado em Node.
 *
 * Diferente dos regexExtractors (que CAÇAM o campo dentro de um texto longo),
 * aqui o texto já é a célula inteira: a pergunta é "isto é uma data válida?",
 * e a resposta vem normalizada ou null.
 */

import { parseBRLAmount } from "./regexExtractors";

// ── Datas ─────────────────────────────────────────────────────────────────────

/** Ordem dia/mês de uma coluna. Exportações de sistemas americanos usam MM/DD. */
export type OrdemData = "dmy" | "mdy";

const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6,
  jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12,
};

const doisDigitos = (n: number) => String(n).padStart(2, "0");

function montarData(d: number, m: number, y: number): string | null {
  if (m < 1 || m > 12 || d < 1 || y < 1990 || y > 2100) return null;
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > diasNoMes) return null;
  return `${doisDigitos(d)}/${doisDigitos(m)}/${y}`;
}

/** Ano de 2 dígitos é sempre 20xx: títulos em cobrança são recentes. */
const anoCompleto = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Número serial de data do Excel (dias desde 30/12/1899) → DD/MM/AAAA.
 * Aparece quando a planilha foi exportada para CSV sem formatar a coluna.
 */
export function serialExcelParaData(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 32874 || serial > 73051) return null; // 1990..2099
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000;
  const dt = new Date(ms);
  return montarData(dt.getUTCDate(), dt.getUTCMonth() + 1, dt.getUTCFullYear());
}

/**
 * Data em DD/MM/AAAA, ou null se o texto não for uma data válida.
 *
 * Aceita 15/06/2026, 15/06/26, 15-06-2026, 15.06.26, 5/6/2026, 2026-06-15 (ISO,
 * com ou sem hora), "15/06/2026 00:00", 15/jun/2026, "15 de junho de 2026" e,
 * com `aceitarSerial`, o número serial do Excel (46188).
 *
 * Datas impossíveis (31/02, mês 13) voltam null: melhor um campo vazio para o
 * operador preencher do que um vencimento errado.
 */
export function parseDateBR(raw: string, ordem: OrdemData = "dmy", aceitarSerial = false): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) return montarData(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  const num = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    const y = anoCompleto(num[3]);
    return ordem === "mdy" ? montarData(b, a, y) : montarData(a, b, y);
  }

  const porExtenso = semAcento(s).toLowerCase()
    .match(/^(\d{1,2})(?:\s+de\s+|[\s/\-.]+)([a-z]{3,9})\.?(?:\s+de\s+|[\s/\-.]+)(\d{4}|\d{2})$/);
  if (porExtenso) {
    const mes = MESES[porExtenso[2].slice(0, 3)];
    if (mes) return montarData(Number(porExtenso[1]), mes, anoCompleto(porExtenso[3]));
  }

  if (aceitarSerial && /^\d{5}(?:[.,]\d+)?$/.test(s)) {
    return serialExcelParaData(Number(s.replace(",", ".")));
  }
  return null;
}

/**
 * Ordem mais provável de uma coluna de datas. Basta uma data com "dia" acima de
 * 12 na segunda posição (06/15/2026) para a coluna ser MM/DD; na dúvida, DD/MM.
 */
export function detectarOrdemDatas(valores: string[]): OrdemData {
  let dmy = 0;
  let mdy = 0;
  for (const v of valores) {
    const m = (v ?? "").trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

/** "15/06/2026" → número comparável (AAAAMMDD), para escolher entre colunas de data. */
export function dataComparavel(dataBR: string): number {
  const m = dataBR.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Number(`${m[3]}${m[2]}${m[1]}`) : 0;
}

// ── Valores ───────────────────────────────────────────────────────────────────

/**
 * Valor em reais, ou null. Aceita "R$ 1.234,56", "1234,56", "1.234", "1,234.56",
 * "1234.5" (célula numérica), "-1.234,56", "(1.234,56)", "1.234,56 D".
 *
 * O sinal é descartado: a importação é sempre de valores devidos, e há relatório
 * que mostra o débito como negativo.
 */
export function parseMoney(raw: string): number | null {
  const s = (raw ?? "")
    .replace(/ /g, " ")
    .replace(/R\$|BRL|reais/gi, "")
    .replace(/\s+[DC]$/i, "")
    .replace(/[()\s-]/g, "")
    .trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const n = parseBRLAmount(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// ── Telefones ─────────────────────────────────────────────────────────────────

/**
 * DDD + número (10 ou 11 dígitos), sem DDI 55 e sem o 0 de discagem; null se
 * não for um telefone brasileiro com DDD.
 */
export function normalizarTelefone(digitos: string): string | null {
  let d = (digitos ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  // DDD válido: 11 a 99, sem zero no segundo dígito.
  if (!/^[1-9][1-9]/.test(d)) return null;
  // Com 11 dígitos, o número local é celular e começa com 9.
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

const ehCelular = (tel: string) =>
  (tel.length === 11 && tel[2] === "9") || (tel.length === 10 && /[6-9]/.test(tel[2]));

/**
 * O melhor telefone de uma célula, só dígitos (DDD + número), ou null.
 *
 * Célula com mais de um número ("(11) 98765-4321 / (11) 3333-4444") fica com o
 * CELULAR, que é o que recebe WhatsApp. Antes os dígitos dos dois números eram
 * colados num só, e a cobrança ia para um número que não existe.
 */
export function pickPhone(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  const encontrados: string[] = [];
  const re = /(?:\+?55[\s.-]?)?(?:\(\s*0?\d{2}\s*\)|0?\d{2})[\s.-]?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/g;
  for (const m of s.matchAll(re)) {
    const tel = normalizarTelefone(m[0]);
    if (tel) encontrados.push(tel);
  }
  if (encontrados.length === 0) {
    const tel = normalizarTelefone(s);
    if (tel) encontrados.push(tel);
  }
  return encontrados.find(ehCelular) ?? encontrados[0] ?? null;
}

// ── Classificação de células (para inferir colunas sem cabeçalho) ─────────────

export const pareceData = (s: string) => parseDateBR(s, "dmy", false) !== null || parseDateBR(s, "mdy", false) !== null;
export const pareceValor = (s: string) => /[.,]\d{2}$|^R\$/.test(s.trim()) && parseMoney(s) !== null;
export const pareceTelefone = (s: string) => pickPhone(s) !== null && !/[a-z]{3}/i.test(s);
export const pareceCpfCnpj = (s: string) =>
  /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(s.trim()) || /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/.test(s.trim());
export const pareceNome = (s: string) => {
  const letras = (s.match(/\p{L}/gu) ?? []).length;
  return letras >= 3 && letras / Math.max(s.replace(/\s/g, "").length, 1) >= 0.6;
};
/** Código de título/documento: "4254-2", "NF-001", "1243/002", "000123". */
export const pareceCodigo = (s: string) =>
  /^[A-Z]{0,5}[\s-]?\d[\w./-]{0,24}$/i.test(s.trim()) && !pareceData(s) && !/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s.trim());

/**
 * Linha de total/subtotal do relatório ("TOTAL GERAL", "Subtotal:", "Totais").
 * Sem esse filtro o total vira um devedor fictício com a soma da carteira.
 * Nome de empresa com "TOTAL" ("TOTAL DISTRIBUIDORA LTDA") não é total.
 */
export function pareceLinhaDeTotal(texto: string): boolean {
  const t = semAcento((texto ?? "").trim()).toLowerCase();
  if (!t || t.length > 40) return false;
  if (/\b(ltda|eireli|me|epp|s\.?a\.?|comercio|distribuidora|industria|servicos)\b/.test(t)) return false;
  return /^(sub[\s-]?)?tota(l|is)\b|^soma\b|^saldo (total|geral)\b|^(qtd|quantidade) (de )?(titulos|registros)\b/.test(t);
}
