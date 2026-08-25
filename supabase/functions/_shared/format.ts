/**
 * Formatação de valores para pt-BR. Puro (sem Deno/Node API) — usável tanto nas
 * Edge Functions quanto em testes via tsx.
 *
 * Implementado com aritmética de centavos (inteiro) em vez de toLocaleString,
 * para saída determinística (sem espaço não-quebrável do ICU) e para absorver
 * ruído de ponto flutuante (ex.: 0.1 + 0.2).
 */

/** Formata um número como moeda brasileira: 1250.5 → "R$ 1.250,50". */
export function formatBRL(value: number): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const negative = n < 0;

  // Aritmética de centavos: arredonda uma vez, no menor grão monetário.
  const cents = Math.round(Math.abs(n) * 100);
  const intPart = Math.floor(cents / 100);
  const decPart = cents % 100;

  // Milhar com ponto; decimal com vírgula e sempre 2 dígitos.
  const intStr = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decStr = String(decPart).padStart(2, "0");

  return `${negative ? "-" : ""}R$ ${intStr},${decStr}`;
}
