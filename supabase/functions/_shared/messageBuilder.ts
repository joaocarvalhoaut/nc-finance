/**
 * messageBuilder.ts — constrói mensagens de cobrança a partir de templates.
 *
 * Variáveis suportadas:
 *   {nome_cliente}    → nome do devedor
 *   {documento}       → número do documento (CPF/CNPJ)
 *   {documento_boleto}→ alias de {documento}
 *   {vencimento}      → data de vencimento (DD/MM/YYYY ou ISO)
 *   {valor_atualizado}→ valor formatado em BRL (ex: 1.250,00)
 *
 * Se `driveFileUrl` existir, um link de PDF é acrescentado ao final.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DebtorForMessage {
  clientName: string;
  documentNumber: string;
  dueDate: string;       // DD/MM/YYYY ou YYYY-MM-DD
  amount: number;
  driveFileUrl?: string | null;
  driveFileName?: string | null;
  /** Dias de atraso (para templates que usam {dias_atraso}) */
  daysOverdue?: number | null;
}

// ─── Default templates (por tom) ──────────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, string> = {
  amigavel: `Olá {nome_cliente}, tudo bem? 😊
Passando para lembrar sobre o boleto abaixo em nosso acompanhamento.

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Se precisar de ajuda ou precisar dos dados para pagamento, é só chamar!
Estamos à disposição.

Equipe NC Finance.`,

  neutro: `Prezado(a) {nome_cliente},

Informamos que identificamos o boleto abaixo em aberto em nosso sistema:

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Pedimos que verifique e regularize o pagamento o quanto antes para evitar encargos.

Atenciosamente,
Equipe NC Finance.`,

  firme: `Caro(a) {nome_cliente},

Consta em nosso sistema o boleto abaixo com vencimento em {vencimento} no valor de R$ {valor_atualizado} (Documento: {documento}), ainda em aberto.

Solicitamos a regularização imediata para evitar a incidência de multa e juros adicionais.

Equipe NC Finance.`,

  juridico: `Sr./Sra. {nome_cliente},

Notificamos V.Sa. acerca do débito referente ao documento {documento}, com vencimento em {vencimento} e valor atualizado de R$ {valor_atualizado}, até o momento sem quitação em nosso sistema.

Solicitamos manifestação no prazo de 48 horas para evitar medidas administrativas e jurídicas cabíveis.

Equipe NC Finance.`,
};

const FALLBACK_TONE = "neutro";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatBRL = (value: number): string => {
  // Manual BRL format for Deno (no Intl.NumberFormat locale guaranteed)
  const fixed = value.toFixed(2);
  const [int, dec] = fixed.split(".");
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${intFormatted},${dec}`;
};

/**
 * Normaliza data de YYYY-MM-DD para DD/MM/YYYY.
 * Se já estiver no formato DD/MM/YYYY, retorna como está.
 */
const normalizeDate = (raw: string): string => {
  const iso = raw.trim();
  const isoMatch = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  return iso; // já está no formato esperado
};

// ─── Build ────────────────────────────────────────────────────────────────────

/**
 * Monta a mensagem final para um devedor.
 *
 * @param debtor        Dados do devedor
 * @param tone          Tom da mensagem (amigavel | neutro | firme | juridico)
 * @param customTemplate Template personalizado com variáveis {…}, opcional
 */
export const buildMessage = (
  debtor: DebtorForMessage,
  tone = FALLBACK_TONE,
  customTemplate?: string | null,
): string => {
  const template =
    customTemplate?.trim() ||
    DEFAULT_TEMPLATES[tone] ||
    DEFAULT_TEMPLATES[FALLBACK_TONE];

  const dueFormatted = normalizeDate(debtor.dueDate);
  const amountFormatted = formatBRL(debtor.amount);

  const daysOverdueStr = String(debtor.daysOverdue ?? 0);

  let msg = template
    .replace(/{nome_cliente}/g,    debtor.clientName   || "Cliente")
    .replace(/{documento}/g,       debtor.documentNumber || "—")
    .replace(/{documento_boleto}/g, debtor.documentNumber || "—")
    .replace(/{vencimento}/g,      dueFormatted)
    .replace(/{valor_atualizado}/g, amountFormatted)
    .replace(/{dias_atraso}/g,     daysOverdueStr);

  // Appenda link do PDF do Drive, se disponível
  if (debtor.driveFileUrl) {
    const label = debtor.driveFileName
      ? ` (${debtor.driveFileName})`
      : "";
    msg += `\n\n📎 Boleto PDF${label}:\n${debtor.driveFileUrl}`;
  }

  return msg;
};
