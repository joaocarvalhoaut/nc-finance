import type { AutomationRuleCreate } from '../services/automationService';

export function validateNewAutomationRule(rule: AutomationRuleCreate): string | null {
  if (!rule.name.trim()) return 'Informe o nome da regra.';
  if (rule.ruleType === 'due_in_days' && (!Number.isInteger(rule.daysBefore) || (rule.daysBefore ?? -1) < 0)) return 'Informe um número inteiro de dias, igual ou maior que zero.';
  if (rule.maxDailySends != null && (!Number.isInteger(rule.maxDailySends) || rule.maxDailySends < 1 || rule.maxDailySends > 500)) return 'O limite diário deve ser um número inteiro entre 1 e 500.';
  const start = rule.sendWindowStart, end = rule.sendWindowEnd;
  if (Boolean(start) !== Boolean(end)) return 'Preencha o início e o fim da janela de envio.';
  if (start && end) {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(start) || !time.test(end)) return 'Informe horários válidos no formato HH:MM.';
    if (start >= end) return 'O fim da janela deve ser posterior ao início no mesmo dia.';
  }
  return null;
}
