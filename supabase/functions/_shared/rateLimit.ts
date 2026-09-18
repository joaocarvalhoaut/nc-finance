// deno-lint-ignore-file no-explicit-any
/**
 * Rate limiting compartilhado para Edge Functions.
 *
 * Usa a função Postgres `check_rate_limit` (janela fixa atômica) — ver migration
 * 20260810211000_rate_limiting.sql. Se o limitador falhar, a operação aguarda uma nova tentativa.
 * Falhas de infraestrutura nunca autorizam consumo ilimitado.
 */

export interface RateLimitResult {
  allowed:   boolean;
  /** Segundos até a janela reiniciar (para o header Retry-After). */
  retryAfter: number;
}

/**
 * Verifica e incrementa o contador de rate limit para `key`.
 *
 * @param admin          cliente Supabase com service_role
 * @param key            identificador do bucket (ex.: "send-charge:<userId>")
 * @param max            máximo de requisições permitidas na janela
 * @param windowSeconds  tamanho da janela em segundos
 */
export async function checkRateLimit(
  admin: any,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn("[rateLimit] indisponível; operação temporariamente bloqueada.");
      return { allowed: false, retryAfter: Math.max(1, windowSeconds) };
    }
    const allowed = data === true;
    return { allowed, retryAfter: allowed ? 0 : windowSeconds };
  } catch (e) {
    console.warn("[rateLimit] indisponível; operação temporariamente bloqueada.");
    return { allowed: false, retryAfter: Math.max(1, windowSeconds) };
  }
}

/** Extrai o IP do cliente dos headers de proxy (Supabase/Vercel). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Resposta 429 padronizada com Retry-After. */
export function tooManyRequests(retryAfter: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: "Muitas requisições em pouco tempo. Aguarde e tente novamente.",
      status: "rate_limited",
      retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, retryAfter)),
        ...extraHeaders,
      },
    },
  );
}
