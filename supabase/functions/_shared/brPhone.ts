/**
 * brPhone.ts — telefone brasileiro: nono dígito e formato para WhatsApp.
 *
 * FONTE ÚNICA usada pelo envio (zapi.ts), pela importação do Google Sheets e
 * pelo front (gravação de devedores e extração de documentos). Puro: sem Deno,
 * sem DOM, sem imports — roda nos dois lados.
 *
 * Desde 2016 todo CELULAR brasileiro tem 9 dígitos depois do DDD, começando
 * com 9. Planilhas e relatórios de ERP ainda trazem o formato antigo, de 8.
 *
 * A regra NÃO é "colocar 9 em tudo": telefone FIXO não ganha o 9, ou vira um
 * número que não existe. No formato antigo o primeiro algarismo indica o tipo:
 *   6, 7, 8 ou 9 → celular → recebe o 9
 *   2, 3, 4 ou 5 → fixo    → fica como está
 */

/**
 * Insere o nono dígito em celular brasileiro no formato antigo.
 *
 * Só reescreve quando de fato insere o 9 — devolve então só dígitos, mantendo o
 * DDI 55 se ele veio. Em qualquer outro caso (número já com 9, fixo, inválido,
 * texto) devolve a entrada INTACTA, formatação inclusive.
 *
 *   "33 9913-7848"     → "33999137848"
 *   "+55 77 9988-7720" → "5577999887720"
 *   "38 3572-1919"     → "38 3572-1919"   (fixo)
 *   "77 99988-7720"    → "77 99988-7720"  (já tem o 9)
 */
export function ensureNinthDigit(raw: string): string {
  const original = raw ?? "";
  let d = original.replace(/\D/g, "");
  if (!d) return original;
  if (d.startsWith("0")) d = d.slice(1); // discagem com 0 à frente

  let ddi = "";
  if (d.length === 12 && d.startsWith("55")) { ddi = "55"; d = d.slice(2); }

  // 10 dígitos = DDD + 8: o único tamanho em que pode faltar o 9.
  if (d.length !== 10) return original;

  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  if (!/^[6-9]/.test(local)) return original; // fixo

  return `${ddi}${ddd}9${local}`;
}

/**
 * Formato de envio para WhatsApp: só dígitos, com DDI 55 e nono dígito.
 *
 *   "33 9913-7848"   → "5533999137848"
 *   "011 98765-4321" → "5511987654321"
 *   "38 3572-1919"   → "553835721919"   (fixo: sem 9)
 *
 * Tamanho fora do esperado volta só com dígitos — validatePhone rejeita depois.
 */
export function toWhatsappNumber(raw: string): string {
  const digits = ensureNinthDigit(raw).replace(/\D/g, "");
  const semZero = digits.startsWith("0") ? digits.slice(1) : digits;
  if (semZero.length === 12 || semZero.length === 13) return semZero;
  if (semZero.length === 10 || semZero.length === 11) return `55${semZero}`;
  return semZero;
}
