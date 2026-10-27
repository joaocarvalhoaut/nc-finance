/**
 * tituloBase — número do título sem a parcela, para casar boletos nomeados só
 * com o título ("2718 CLIENTE.pdf") com devedores importados com a parcela
 * ("2718/1"). Puro (sem Deno/npm) para rodar nos testes com tsx.
 */

/** "2718/1" → "2718", "1382-5" → "1382". Null fora desse formato. */
export function tituloBase(documentNumber: string): string | null {
  const m = documentNumber.trim().match(/^(\d{3,})\s*[\/\-]\s*\d{1,3}$/);
  return m ? m[1] : null;
}

/**
 * Títulos que aparecem em mais de um devedor (várias parcelas cadastradas):
 * um arquivo com só o número do título não diz de qual parcela é.
 */
export function titulosRepetidos(documentNumbers: Array<string | null | undefined>): Set<string> {
  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const doc of documentNumbers) {
    const base = tituloBase(doc ?? "");
    if (!base) continue;
    if (vistos.has(base)) repetidos.add(base); else vistos.add(base);
  }
  return repetidos;
}

/** Números do nome do arquivo, como o casamento os enxerga ("1382-005" → "1382005"). */
export function numerosDoArquivo(fileNameNormalized: string): string[] {
  return [...fileNameNormalized.matchAll(/\d(?:[\d\/\-.]*\d)?/g)].map((m) => m[0].replace(/\D/g, ""));
}
