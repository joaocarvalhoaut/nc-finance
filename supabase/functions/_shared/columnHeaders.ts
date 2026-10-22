/**
 * columnHeaders.ts — reconhecimento de cabeçalhos de planilhas e relatórios.
 *
 * FONTE ÚNICA usada por:
 *   - src/services/localDocumentExtraction/tableParser.ts (PDF, Excel, CSV, texto)
 *   - supabase/functions/_shared/googleSheets.ts          (importação do Google Sheets)
 *
 * Antes cada importador tinha a própria lista de sinônimos, e elas divergiam: o
 * Google Sheets não conhecia "sacado" nem "pagador", e comparava por igualdade
 * exata, deixando passar "Data de Vencimento", "Venc." e "Vcto". O de PDF/Excel
 * comparava por substring, e "Sacador" (o fornecedor) contém "sacado" — se a
 * coluna Sacador viesse antes, o cliente era mapeado para a coluna errada.
 *
 * Este módulo é puro (sem Deno, sem DOM, sem imports) para rodar nos dois lados.
 *
 * Como funciona:
 *   1. normaliza o cabeçalho: sem acento, minúsculo, pontuação vira espaço,
 *      preposições removidas — "Dt. de Venc." vira "dt venc";
 *   2. cada campo tem regras com uma pontuação; campos que descrevem um ATRIBUTO
 *      (telefone, CPF, vencimento, valor) pontuam mais que os de NOME (cliente,
 *      fornecedor), então "Telefone do Sacado" vai para telefone, não para cliente;
 *   3. palavras de exclusão zeram o campo ("Valor Pago" nunca é o valor devido);
 *   4. erros de digitação de 1 letra são tolerados em palavras longas, desde que
 *      não haja ambiguidade entre campos;
 *   5. cada coluna vai para no máximo um campo, e cada campo para no máximo uma
 *      coluna, sempre pela maior pontuação.
 */

export type HeaderField =
  | "client"
  | "supplier"
  | "cnpj"
  | "document"
  | "dueDate"
  | "value"
  | "phone"
  | "status"
  | "docType"
  | "bank"
  | "notes";

interface Rule {
  /** Expressão já normalizada; várias palavras devem aparecer em sequência. */
  phrase: string;
  score: number;
  /** A última palavra casa por prefixo: "venc" cobre "vencto", "vencimento"… */
  prefix?: boolean;
}

interface FieldSpec {
  rules: Rule[];
  /** Se o cabeçalho tiver qualquer uma, o campo não se aplica. */
  excludes?: string[];
  /** Reduzem a pontuação: são válidas, mas perdem para uma coluna melhor. */
  penalties?: string[];
}

const r = (phrase: string, score: number, prefix = false): Rule => ({ phrase, score, prefix });

const FIELDS: Record<HeaderField, FieldSpec> = {
  // ── Atributos: pontuam alto, vencem os nomes quando dividem a mesma coluna ──
  cnpj: {
    rules: [r("cpf", 97), r("cnpj", 97)],
  },
  phone: {
    rules: [
      r("telefone", 96), r("fone", 96), r("celular", 96), r("cel", 96), r("tel", 96),
      r("whatsapp", 96), r("whats", 96), r("wpp", 96), r("zap", 96),
      r("phone", 96), r("mobile", 96), r("contato", 60),
    ],
    excludes: ["email", "mail"],
  },
  dueDate: {
    rules: [
      // "venc" cobre venc, venc., vencto, vencimento e até "vencimeto" digitado errado.
      r("venc", 96, true), r("vcto", 96), r("vecto", 96), r("vct", 96), r("vto", 96),
      r("due date", 96), r("due", 70), r("data limite", 80),
    ],
    // Datas que NÃO são o vencimento.
    excludes: ["emissao", "emitido", "pagamento", "pago", "baixa", "liquidacao", "cadastro", "criacao"],
  },
  value: {
    rules: [
      r("valor original", 99), r("valor nominal", 99), r("valor titulo", 97),
      r("valor devido", 97), r("valor face", 97),
      r("valor", 90), r("vlr", 90), r("vl", 90), r("montante", 90), r("amount", 90),
      r("saldo", 85), r("debito", 85), r("total", 70),
    ],
    // "Valor Pago", "Juros", "Multa"… nunca são o valor a cobrar.
    excludes: ["pago", "paga", "recebido", "juros", "multa", "desconto", "abatimento", "mora", "encargo", "encargos", "tarifa", "taxa"],
    // A cobrança usa o valor base: se houver as duas colunas, a original vence.
    penalties: ["atualizado", "corrigido", "total"],
  },
  docType: {
    // 96: "Tipo de Documento" é tipo, não número do documento.
    rules: [r("tipo", 96), r("especie", 96), r("modalidade", 80)],
  },
  status: {
    rules: [r("status", 90), r("situacao", 90), r("posicao", 75), r("estado", 70), r("categoria", 70)],
  },
  document: {
    rules: [
      r("nosso numero", 95), r("documento", 92), r("doc", 92), r("duplicata", 92),
      r("nota fiscal", 92), r("nf", 90), r("nfe", 90), r("boleto", 90),
      r("titulo", 88), r("fatura", 88),
      r("numero", 60), r("num", 60), r("nr", 60), r("n", 60),
    ],
    // CPF/CNPJ identifica a PESSOA, não o boleto: usá-lo como número do documento
    // faz dois boletos do mesmo cliente colidirem.
    excludes: ["cpf", "cnpj"],
  },
  bank: {
    rules: [r("banco", 90), r("bank", 90), r("instituicao", 85), r("inst financeira", 85), r("portador", 80)],
  },
  // ── Nomes: pontuam menos que os atributos ───────────────────────────────────
  client: {
    rules: [
      // "Pagador" é o nome atual de "sacado" nos boletos (padrão FEBRABAN).
      r("sacado", 93), r("pagador", 93), r("cliente", 93), r("devedor", 93),
      r("inadimplente", 93), r("comprador", 90), r("consumidor", 90), r("tomador", 90),
      r("razao social", 90), r("customer", 90),
      r("nome", 70), r("name", 70), r("titular", 70), r("destinatario", 70), r("contratante", 70),
    ],
    // O outro lado da cobrança — nunca é o devedor.
    excludes: [
      "sacador", "avalista", "cedente", "beneficiario", "fornecedor", "emissor", "emitente",
      "credor", "vendedor", "representante", "responsavel", "banco", "empresa",
    ],
  },
  supplier: {
    rules: [
      // "Beneficiário" é o nome atual de "cedente" nos boletos.
      r("sacador", 93), r("cedente", 93), r("beneficiario", 93), r("fornecedor", 93),
      r("emitente", 90), r("emissor", 90), r("credor", 90), r("supplier", 90),
      r("empresa", 75), r("loja", 60), r("filial", 60),
    ],
  },
  notes: {
    rules: [
      r("observacao", 90), r("obs", 90), r("notes", 90), r("comentario", 90),
      r("historico", 80), r("descricao", 75), r("nota", 50),
    ],
  },
};

/** Preposições que só atrapalham a comparação ("Data DE Vencimento"). */
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "Dt. de Venc." → "dt venc"; "Nº Doc" → "n doc"; "Data_Vencimento" → "data vencimento". */
export function normalizeHeader(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[º°ª]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .join(" ");
}

const hasPhrase = (tokens: string[], phrase: string, prefix: boolean): boolean => {
  const p = phrase.split(" ");
  outer: for (let i = 0; i + p.length <= tokens.length; i++) {
    for (let j = 0; j < p.length; j++) {
      const t = tokens[i + j];
      const last = j === p.length - 1;
      if (!(t === p[j] || (prefix && last && t.startsWith(p[j])))) continue outer;
    }
    return true;
  }
  return false;
};

/** Distância de edição limitada a 1 — suficiente para um erro de digitação. */
const withinOneEdit = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/** Toda palavra-chave conhecida, de qualquer campo — base para a tolerância a erro. */
const KNOWN_WORDS = new Set<string>();
for (const spec of Object.values(FIELDS)) {
  for (const rule of spec.rules) rule.phrase.split(" ").forEach((w) => KNOWN_WORDS.add(w));
  spec.excludes?.forEach((w) => KNOWN_WORDS.add(w));
}

/**
 * Corrige um erro de digitação de 1 letra em palavras de 6+ letras, mas só quando
 * há UMA palavra conhecida possível. "sacadoo" fica sem correção, porque está a
 * uma letra tanto de "sacado" (cliente) quanto de "sacador" (fornecedor).
 */
const fixTypo = (token: string): string => {
  if (token.length < 6 || KNOWN_WORDS.has(token)) return token;
  const candidates = [...KNOWN_WORDS].filter((w) => w.length >= 6 && withinOneEdit(token, w));
  return candidates.length === 1 ? candidates[0] : token;
};

/** Pontuação de 0 a 100 de um cabeçalho para um campo. */
export function scoreHeader(header: string, field: HeaderField): number {
  const tokens = normalizeHeader(header).split(" ").filter(Boolean).map(fixTypo);
  if (!tokens.length) return 0;

  const spec = FIELDS[field];
  if (spec.excludes?.some((w) => tokens.includes(w))) return 0;

  let best = 0;
  for (const rule of spec.rules) {
    if (rule.score > best && hasPhrase(tokens, rule.phrase, Boolean(rule.prefix))) best = rule.score;
  }
  if (best && spec.penalties?.some((w) => tokens.includes(w))) best -= 15;
  return best;
}

/**
 * Mapeia cada campo pedido para o índice da melhor coluna.
 * Cada coluna vai para no máximo um campo, sempre pela maior pontuação.
 */
export function mapHeaders<F extends HeaderField>(
  headers: string[],
  fields: readonly F[],
  minScore = 50,
): Partial<Record<F, number>> {
  const candidates: { col: number; field: F; score: number }[] = [];
  headers.forEach((h, col) => {
    for (const field of fields) {
      const score = scoreHeader(h, field);
      if (score >= minScore) candidates.push({ col, field, score });
    }
  });

  // Maior pontuação primeiro; empate fica com a coluna mais à esquerda.
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);

  const result: Partial<Record<F, number>> = {};
  const usedCols = new Set<number>();
  for (const c of candidates) {
    if (c.field in result || usedCols.has(c.col)) continue;
    result[c.field] = c.col;
    usedCols.add(c.col);
  }
  return result;
}

/**
 * Quantos campos DIFERENTES uma linha menciona com segurança (pontuação ≥ 85).
 * Base para decidir se a linha é um cabeçalho.
 */
export function countStrongFields(line: string): number {
  const tokens = normalizeHeader(line).split(" ").filter(Boolean).map(fixTypo);
  let count = 0;
  for (const field of Object.keys(FIELDS) as HeaderField[]) {
    const spec = FIELDS[field];
    if (spec.rules.some((rule) => rule.score >= 85 && hasPhrase(tokens, rule.phrase, Boolean(rule.prefix)))) {
      count++;
    }
  }
  return count;
}
