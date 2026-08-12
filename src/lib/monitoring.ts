import * as Sentry from "@sentry/react";

/**
 * Monitoramento de erros (Sentry). No-op se VITE_SENTRY_DSN não estiver
 * definido — o app funciona normalmente sem monitoramento, e liga sozinho
 * quando o DSN é configurado no ambiente (Vercel → Environment Variables).
 */
export function initMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Amostragem de performance baixa (custo); erros são sempre capturados.
    tracesSampleRate: 0.1,
    // Não envia PII por padrão.
    sendDefaultPii: false,
    beforeSend(event) {
      // Remove query strings que possam conter tokens antes de enviar.
      if (event.request?.url) event.request.url = event.request.url.split("?")[0];
      return event;
    },
  });
}

export { Sentry };
