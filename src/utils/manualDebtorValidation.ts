export function isValidDueDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return false;
  const [, day, month, year] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Converte texto em valor monetário. Aceita APENAS o formato brasileiro:
 * ponto separa milhar, vírgula separa centavos (1.250,00).
 *
 * Ponto como separador decimal é rejeitado de propósito. "1.25" é ambíguo:
 * tanto pode ser alguém digitando 1,25 quanto alguém errando o último dígito
 * de 1.250. Aceitar transformaria um erro de digitação em cobrança de R$ 1,25
 * no lugar de R$ 1.250,00 — trocaria um erro visível por um erro silencioso,
 * que neste domínio é bem pior. Quem digita ponto recebe orientação na UI.
 */
export function parseManualAmount(value: string): number {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(text)) return NaN;
  const amount = Number(text.replaceAll('.', '').replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? amount : NaN;
}
