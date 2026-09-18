// Contrato das automações: horário de Brasília UTC-3, como no cron existente.
const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export function automationTime(now: Date): string {
  return new Date(now.getTime() - OFFSET_MS).toISOString().slice(11, 16);
}
export function automationStart(time: string, now: Date): Date {
  const date = new Date(now.getTime() - OFFSET_MS).toISOString().slice(0, 10);
  return new Date(date + 'T' + time.slice(0, 5) + ':00-03:00');
}
export function nextAutomationStart(time: string, now: Date): Date {
  const start = automationStart(time, now);
  return start <= now ? new Date(start.getTime() + DAY_MS) : start;
}
export function scheduledAutomationStart(time: string | null, now: Date): string {
  if (!time) return now.toISOString();
  const start = automationStart(time, now);
  return (start < now ? now : start).toISOString();
}

/** Retorna o próximo início se estiver fora da janela; fim inclusivo por minuto. */
export function deferredAutomationStart(start: string, end: string, now: Date): Date | null {
  const current = automationTime(now);
  return current < start.slice(0, 5) || current > end.slice(0, 5)
    ? nextAutomationStart(start, now) : null;
}
