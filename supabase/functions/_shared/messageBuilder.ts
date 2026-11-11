/**
 * messageBuilder.ts — constrói mensagens de cobrança a partir de templates.
 *
 * Variáveis suportadas:
 *   {nome_cliente}    → nome do devedor
 *   {documento}       → número do documento (CPF/CNPJ)
 *   {documento_boleto}→ alias de {documento}
 *   {vencimento}      → data de vencimento (DD/MM/YYYY ou ISO)
 *   {valor_atualizado}→ valor formatado em BRL (ex: 1.250,00)
 *   {empresa}         → nome da empresa que cobra (sem nome, some da assinatura)
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
  /** Nome da empresa que cobra (user_profiles.company_name) — preenche {empresa} */
  companyName?: string | null;
}

import { preencherMensagem } from "./agrupamento.ts";

// ─── Default templates (por tom) ──────────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, string> = {
  amigavel: `Olá {nome_cliente}, tudo bem? 😊
Aqui é do financeiro {empresa}. Passando para lembrar sobre o boleto abaixo em nosso acompanhamento.

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Se precisar de ajuda ou precisar dos dados para pagamento, é só chamar!
Estamos à disposição.

Equipe financeira {empresa}.`,

  neutro: `Prezado(a) {nome_cliente},

Aqui é do financeiro {empresa}. Informamos que identificamos o boleto abaixo em aberto em nosso sistema:

Documento: {documento}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Pedimos que verifique e regularize o pagamento o quanto antes para evitar encargos.

Atenciosamente,
Equipe financeira {empresa}.`,

  firme: `Caro(a) {nome_cliente},

Aqui é da equipe de cobrança {empresa}. Consta em nosso sistema o boleto com vencimento em {vencimento} no valor de R$ {valor_atualizado} (Documento: {documento}), ainda em aberto.

Solicitamos a regularização imediata para evitar a incidência de multa e juros adicionais.

Equipe de cobrança {empresa}.`,

  juridico: `Sr./Sra. {nome_cliente},

O departamento administrativo {empresa} notifica V.Sa. acerca do débito referente ao documento {documento}, com vencimento em {vencimento} e valor de R$ {valor_atualizado}, até o momento sem quitação em nosso sistema.

Solicitamos manifestação no prazo de 48 horas para evitar medidas administrativas e jurídicas cabíveis.

Departamento administrativo {empresa}.`,
};

const FALLBACK_TONE = "neutro";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
): string => buildGroupMessage([debtor], tone, customTemplate);

/**
 * Uma mensagem para vários títulos do mesmo cliente e tipo (_shared/agrupamento.ts).
 * Com um título só, sai igual ao buildMessage de sempre.
 */
export const buildGroupMessage = (
  debtors: DebtorForMessage[],
  tone = FALLBACK_TONE,
  customTemplate?: string | null,
): string => {
  const template =
    customTemplate?.trim() ||
    DEFAULT_TEMPLATES[tone] ||
    DEFAULT_TEMPLATES[FALLBACK_TONE];

  // NOTE: PDF link is appended by the calling Edge Function (not here),
  // so that it can use the correct public Storage URL with optional shortening.
  return preencherMensagem(template, {
    nomeCliente: debtors[0]?.clientName || "Cliente",
    empresa:     debtors[0]?.companyName,
    titulos:     debtors.map((d) => ({
      documento:  d.documentNumber,
      vencimento: normalizeDate(d.dueDate),
      valor:      d.amount,
      diasAtraso: d.daysOverdue ?? 0,
    })),
  });
};
