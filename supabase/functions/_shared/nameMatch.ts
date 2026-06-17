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

/** Tokens significativos (≥ 3 chars, sem stopwords). */
function tokens(s: string): string[] {
  return strip(s).split(" ").filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Peso de especificidade: termos genéricos valem pouco; nomes próprios, muito. */
function weight(t: string): number {
  if (WEAK.has(t)) return 0.3;
  // len3 → 0.5 (já distintivo, ex: "GIL"), len8+ → 1.0
  return Math.min(1, 0.5 + (t.length - 3) * 0.1);
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
  const d = tokens(debtorName);
  const c = tokens(candidate);
  if (d.length === 0 || c.length === 0) return 0;

  // Casa cada token do devedor com o melhor token ainda livre do candidato.
  let matchedWeight = 0;
  let strongMatched = false;
  const usedC = new Set<number>();

  for (const dt of d) {
    let bestIdx = -1;
    let bestW = 0;
    c.forEach((ct, i) => {
      if (usedC.has(i)) return;
      if (tokenMatch(dt, ct)) {
        const w = Math.min(weight(dt), weight(ct));
        if (w > bestW) { bestW = w; bestIdx = i; }
      }
    });
    if (bestIdx >= 0) {
      usedC.add(bestIdx);
      matchedWeight += bestW;
      if (bestW >= 0.5) strongMatched = true; // casou um token distintivo
    }
  }

  if (matchedWeight === 0) return 0;

  const dW = d.reduce((s, t) => s + weight(t), 0);
  const cW = c.reduce((s, t) => s + weight(t), 0);
  const recall = matchedWeight / dW;       // quanto do nome do devedor apareceu
  const precision = matchedWeight / cW;    // quão "limpo" é o nome do arquivo

  const f = recall > 0 && precision > 0
    ? (2 * recall * precision) / (recall + precision)
    : 0;
  let score = Math.max(f, 0.5 * recall + 0.5 * precision);

  // Sem nenhum token distintivo forte → limita (evita FP por termo genérico
  // como "MOVEIS.pdf" casar com qualquer loja de móveis).
  if (!strongMatched) score = Math.min(score, 0.4);

  return Math.max(0, Math.min(1, score));
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
