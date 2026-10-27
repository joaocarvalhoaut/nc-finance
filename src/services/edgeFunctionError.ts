/**
 * Corpo de erro de uma Edge Function. Em resposta non-2xx o supabase-js só dá
 * "Edge Function returned a non-2xx status code"; o corpo real ({ error,
 * status, … }) vem na Response guardada em error.context.
 */
export async function readFunctionErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === "function") {
      const body = await ctx.json();
      return body && typeof body === "object" ? body as Record<string, unknown> : null;
    }
  } catch { /* corpo não-JSON: quem chama usa a mensagem padrão */ }
  return null;
}
