/**
 * messageTemplates.ts — templates de mensagem por tom (frontend).
 *
 * Mantidos em sincronia com supabase/functions/_shared/messageBuilder.ts.
 * Variáveis suportadas: {nome_cliente}, {documento}, {vencimento}, {valor_atualizado}
 */

export const MESSAGE_TEMPLATES: Record<string, string> = {
  amigavel: `Olá {nome_cliente}, tudo bem?
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

export const FALLBACK_TONE = "neutro";

/** Retorna o template para o tom informado, com fallback para neutro. */
export const getMessageTemplate = (tone: string): string =>
  MESSAGE_TEMPLATES[tone] ?? MESSAGE_TEMPLATES[FALLBACK_TONE];

/** Formata número para BRL (ex: 1250.5 → "1.250,50"). */
const formatBRL = (v: number): string => {
  const fixed = v.toFixed(2);
  const [int, dec] = fixed.split(".");
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
};

/** Normaliza data YYYY-MM-DD → DD/MM/YYYY. Se já for DD/MM/YYYY, mantém. */
const normalizeDate = (raw: string): string => {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw.trim();
};

export interface TemplateFillData {
  clientName:     string;
  documentNumber: string;
  dueDate:        string;
  amount:         number;
}

/**
 * Preenche o template substituindo as variáveis com dados reais de um devedor.
 * Útil para exibir um preview de exemplo no modal de confirmação.
 */
export const fillMessageTemplate = (
  template: string,
  debtor: TemplateFillData,
): string =>
  template
    .replace(/{nome_cliente}/g,     debtor.clientName     || "Cliente")
    .replace(/{documento}/g,        debtor.documentNumber || "—")
    .replace(/{documento_boleto}/g, debtor.documentNumber || "—")
    .replace(/{vencimento}/g,       normalizeDate(debtor.dueDate))
    .replace(/{valor_atualizado}/g, formatBRL(debtor.amount));
