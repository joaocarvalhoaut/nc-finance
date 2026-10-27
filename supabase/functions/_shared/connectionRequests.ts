/**
 * connectionRequests.ts — pedidos de conexão de WhatsApp sem instância.
 * Deno / Edge Functions apenas.
 *
 * Usado enquanto a criação automática (programa Partner da Z-API) não está
 * ativa: o cliente pede, o suporte vê a lista e liga uma instância à conta.
 *
 * Aviso por e-mail ao suporte (opcional): com RESEND_API_KEY configurado,
 * cada pedido novo manda um e-mail para ADMIN_EMAILS. Sem a chave, o pedido
 * aparece só na lista do cartão do WhatsApp.
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// deno-lint-ignore no-explicit-any
type AdminClient = ReturnType<typeof createClient<any, any, any>>;

/** Não repete o e-mail ao suporte se o cliente clicar várias vezes. */
const REAVISO_MS = 24 * 60 * 60 * 1000;

export interface PendingRequest {
  email: string | null;
  requested_at: string;
}

const adminEmails = () =>
  (Deno.env.get("ADMIN_EMAILS") ?? "").split(",").map((e) => e.trim()).filter(Boolean);

/** Manda o aviso ao suporte pela Resend. Nunca lança. */
const avisarSuporte = async (emailCliente: string | null): Promise<boolean> => {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const destinatarios = adminEmails();
  if (!apiKey || destinatarios.length === 0) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM") || "NC Finance <nao-responda@ncfinance.com.br>",
        to: destinatarios,
        subject: "Cliente aguardando número de WhatsApp",
        text:
          `A conta ${emailCliente ?? "(sem e-mail)"} clicou em "Conectar WhatsApp" e ainda não tem instância.\n\n` +
          `Para liberar: compre uma instância no painel da Z-API e, no NC Finance, vá em ` +
          `Minha Conta > Configuração manual (suporte) > Clientes aguardando número > Ligar instância.`,
      }),
    });
    if (!res.ok) {
      console.log(JSON.stringify({ source: "connection-request.email_error", http: res.status }));
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/**
 * Registra (ou mantém) o pedido da conta e avisa o suporte se for novo ou se
 * o último aviso tiver mais de 24 h. Nunca lança — o cliente vê a mesma
 * mensagem mesmo se o registro falhar.
 */
export const registerConnectionRequest = async (
  admin: AdminClient,
  userId: string,
  email: string | null,
): Promise<void> => {
  try {
    const { data: atual } = await admin
      .from("zapi_connection_requests")
      .select("requested_at, notified_at, fulfilled_at")
      .eq("user_id", userId)
      .maybeSingle();

    const agora = new Date();
    // Pedido atendido antes (instância desligada depois) conta como pedido novo.
    const novo = !atual || atual.fulfilled_at;
    const ultimoAviso = atual?.notified_at ? Date.parse(atual.notified_at) : 0;
    const devoAvisar = novo || agora.getTime() - ultimoAviso > REAVISO_MS;

    const avisou = devoAvisar ? await avisarSuporte(email) : false;

    await admin.from("zapi_connection_requests").upsert(
      {
        user_id: userId,
        email,
        requested_at: novo ? agora.toISOString() : atual!.requested_at,
        notified_at: avisou ? agora.toISOString() : atual?.notified_at ?? null,
        fulfilled_at: null,
      },
      { onConflict: "user_id" },
    );

    if (novo) console.log(JSON.stringify({ source: "connection-request.created", user_id: userId, emailed: avisou }));
  } catch (err) {
    console.log(JSON.stringify({
      source: "connection-request.error", user_id: userId,
      message: err instanceof Error ? err.message : String(err),
    }));
  }
};

/** Pedidos ainda não atendidos, mais antigos primeiro (para o suporte). */
export const listPendingRequests = async (admin: AdminClient): Promise<PendingRequest[]> => {
  const { data, error } = await admin
    .from("zapi_connection_requests")
    .select("email, requested_at")
    .is("fulfilled_at", null)
    .order("requested_at", { ascending: true })
    .limit(50);
  if (error) return []; // tabela ainda não criada: lista vazia
  return (data ?? []) as PendingRequest[];
};

/** Marca o pedido da conta como atendido (instância ligada). Nunca lança. */
export const markRequestFulfilled = async (admin: AdminClient, userId: string): Promise<void> => {
  try {
    await admin
      .from("zapi_connection_requests")
      .update({ fulfilled_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("fulfilled_at", null);
  } catch { /* tabela ainda não criada */ }
};
