/**
 * nameMatch.ts — similaridade de nome de cliente para matching de boletos.
 *
 * Função pura (sem dependências) compartilhada por:
 *   - scoreRow      (caminho com índice — driveFolderIndex.ts)
 *   - matchScore    (caminho legado por filename — googleDrive.ts)
 *
 * Melhora sobre o Jaccard simples usado antes:
 *   1. Stopwords societárias (LTDA, ME, SA, EIRELI…) são ignoradas.
 *   2. Termos genéricos de ramo (COMÉRCIO, MÓVEIS, ELETRO, SERVIÇOS…) recebem
 *      peso baixo — casá-los sozinhos não basta para um match forte.
 *   3. Match por prefixo/substring: ELETRO ↔ ELETRODOMESTICOS,
 *      DISTRIB ↔ DISTRIBUIDORA, REPRES ↔ REPRESENTACOES.
 *   4. Combinação precision/recall ponderada pela especificidade de cada token,
 *      favorecendo levemente arquivos nomeados pelo nome distintivo do cliente.
 */

/** Termos sem valor distintivo — formas societárias, conectores e extensões. */
const STOPWORDS = new Set([
  "ltda", "me", "mei", "epp", "eireli", "sa", "cia", "ei",
  "de", "da", "do", "das", "dos", "e", "em", "para", "por", "the",
  // extensões de arquivo (caso o candidato venha com o nome bruto do arquivo)
  "pdf", "png", "jpg", "jpeg", "xml", "doc", "docx", "tif", "tiff",
]);

/** Termos comuns de ramo — distintivos fracos (peso reduzido). */
const WEAK = new Set([
  "comercio", "comercial", "industria", "industrial", "distribuidora", "distribuidor",
  "servicos", "servico", "produtos", "produto", "materiais", "material",
  "representacoes", "representacao", "empreendimentos", "participacoes",
  "transportes", "transporte", "moveis", "eletro", "eletrodomesticos",
  "alimentos", "construcao", "confeccoes", "tecnologia", "solucoes",
  "grupo", "loja", "lojas", "casa", "center", "auto", "supermercado",
  // termos de organização de pastas (caminho do Drive vira sinal de nome)
  "clientes", "cliente", "boletos", "boleto", "notas", "nota", "faturas", "fatura",
  "documentos", "documento", "arquivos", "arquivo", "pasta", "pastas", "geral",
  "diversos", "pagos", "vencidos", "novos", "antigos", "cobranca", "cobrancas",
  "titulos", "titulo", "recibos", "recibo", "pdf", "pdfs",
]);

/** lowercase + remove acentos + troca não-alfanumérico por espaço. */
function strip(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Peso de especificidade: termos genéricos valem pouco; nomes próprios, muito. */
function weight(t: string): number {
  if (WEAK.has(t)) return 0.3;
  // tokens puramente numéricos (anos "2026", pastas "001") quase não distinguem nome
  if (/^\d+$/.test(t)) return 0.2;
  // len3 → 0.5 (já distintivo, ex: "GIL"), len8+ → 1.0
  return Math.min(1, 0.5 + (t.length - 3) * 0.1);
}

/** Forma preparada de um nome: tokens, pesos e peso total. */
interface Prepared {
  toks: string[];
  wts: number[];
  totalW: number;
}

// Memo de preparação por string. O matching compara N devedores × M arquivos,
// repetindo as MESMAS strings centenas de milhares de vezes — sem o memo, isso
// estoura o limite de CPU da Edge Function. Limpa quando fica grande demais.
const prepCache = new Map<string, Prepared>();
const PREP_CACHE_MAX = 20_000;

function prepare(s: string): Prepared {
  const cached = prepCache.get(s);
  if (cached) return cached;

  const toks = strip(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const wts = toks.map(weight);
  const totalW = wts.reduce((a, b) => a + b, 0);
  const prep: Prepared = { toks, wts, totalW };

  if (prepCache.size >= PREP_CACHE_MAX) prepCache.clear();
  prepCache.set(s, prep);
  return prep;
}

/** Dois tokens "casam" por igualdade, prefixo (≥4) ou substring (≥5). */
function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length >= 4 && long.startsWith(short)) return true;
  if (short.length >= 5 && long.includes(short)) return true;
  return false;
}

/**
 * Similaridade 0–1 entre o nome do devedor e um texto candidato
 * (nome do arquivo ou nome extraído do PDF / pasta).
 */
export function nameSimilarity(debtorName: string, candidate: string): number {
  const d = prepare(debtorName);
  const c = prepare(candidate);
  if (d.toks.length === 0 || c.toks.length === 0) return 0;

  // Casa cada token do devedor com o melhor token ainda livre do candidato.
  // usedMask é um bitmask (sem alocação de Set) — crítico para performance,
  // pois esta função roda centenas de milhares de vezes por busca.
  let matchedWeight = 0;
  let strongMatched = false;
  let usedMask = 0;
  const cLen = Math.min(c.toks.length, 30); // bitmask cabe em 30 bits

  for (let di = 0; di < d.toks.length; di++) {
    const dt = d.toks[di];
    let bestIdx = -1;
    let bestW = 0;
    for (let ci = 0; ci < cLen; ci++) {
      if (usedMask & (1 << ci)) continue;
      if (tokenMatch(dt, c.toks[ci])) {
        const w = Math.min(d.wts[di], c.wts[ci]);
        if (w > bestW) { bestW = w; bestIdx = ci; }
      }
    }
    if (bestIdx >= 0) {
      usedMask |= (1 << bestIdx);
      matchedWeight += bestW;
      if (bestW >= 0.5) strongMatched = true; // casou um token distintivo
    }
  }

  if (matchedWeight === 0) return 0;

  const recall = matchedWeight / d.totalW;     // quanto do nome do devedor apareceu
  const precision = matchedWeight / c.totalW;  // quão "limpo" é o nome do arquivo

  const f = recall > 0 && precision > 0
    ? (2 * recall * precision) / (recall + precision)
    : 0;
  let score = Math.max(f, 0.5 * recall + 0.5 * precision);

  // Sem nenhum token distintivo forte → limita (evita FP por termo genérico
  // como "MOVEIS.pdf" casar com qualquer loja de móveis).
  if (!strongMatched) score = Math.min(score, 0.4);

  return Math.max(0, Math.min(1, score));
}

/**
 * Chaves de bloqueio (blocking) para indexação invertida: prefixos de 4 chars
 * dos tokens DISTINTIVOS (ignora stopwords, termos de ramo e números). Dois
 * nomes só precisam ser comparados a fundo se compartilham ao menos uma chave —
 * isso captura também prefixo/substring (ELETRO ↔ ELETRODOMESTICOS → "elet").
 */
export function blockingKeys(name: string): string[] {
  const keys = new Set<string>();
  for (const t of strip(name).split(" ")) {
    if (t.length < 4 || STOPWORDS.has(t) || WEAK.has(t) || /^\d+$/.test(t)) continue;
    keys.add(t.slice(0, 4));
  }
  return [...keys];
}

/** Maior similaridade entre o nome do devedor e vários candidatos. */
export function bestNameSimilarity(debtorName: string, candidates: Array<string | null | undefined>): number {
  let best = 0;
  for (const cand of candidates) {
    if (!cand) continue;
    const s = nameSimilarity(debtorName, cand);
    if (s > best) best = s;
  }
  return best;
}
