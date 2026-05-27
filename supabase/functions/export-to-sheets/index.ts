/**
 * export-to-sheets — Exporta os registros da Visão Geral para uma planilha Google Sheets.
 *
 * Fluxo:
 *  1. Valida JWT / auth.uid()
 *  2. Valida payload (spreadsheetUrl obrigatório)
 *  3. Valida credenciais Google (backend-only)
 *  4. Valida assinatura Stripe (trialing | active)
 *  5. Extrai spreadsheetId da URL
 *  6. Obtém access token Google com escopo de escrita
 *  7. Lê registros financeiros do usuário do DB
 *  8. Limpa o intervalo da aba alvo
 *  9. Escreve cabeçalho + linhas
 * 10. Registra em user_import_logs
 * 11. Retorna resumo
 *
 * Segredos (Supabase Secrets — NUNCA no frontend):
 *   GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { corsHeaders } from "../_shared/cors.ts";
import {
  extractSpreadsheetId,
  getGoogleAccessToken,
} from "../_shared/googleSheets.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")               || "";
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")          || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")  || "";
const GOOGLE_EMAIL       = Deno.env.get("GOOGLE_CLIENT_EMAIL")        || "";
const GOOGLE_PRIVATE_KEY = Deno.env.get("GOOGLE_PRIVATE_KEY")        || "";

// ─── Label maps ───────────────────────────────────────────────────────────────

const CATEGORY_PT: Record<string, string> = {
  vencidos:  "Vencido",
  a_vencer:  "A Vencer",
  liquidado: "Liquidado",
};

const STATUS_PT: Record<string, string> = {
  pending: "Pendente",
  sent:    "Enviado",
  failed:  "Falhou",
};

// ─── Response helpers ─────────────────────────────────────────────────────────

const okResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── Google Sheets write helpers ──────────────────────────────────────────────

/**
 * Busca as abas existentes na planilha e cria a aba alvo se ela não existir.
 * Retorna o título real da aba a ser usada.
 */
const ensureSheetExists = async (
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
): Promise<string> => {
  // 1. Busca metadados da planilha
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const txt = await metaRes.text();
    throw new Error(`Não foi possível acessar a planilha ${metaRes.status}: ${txt}`);
  }

  const meta = await metaRes.json() as { sheets?: Array<{ properties: { title: string } }> };
  const existingTitles = (meta.sheets ?? []).map((s) => s.properties.title);

  // 2. Se a aba já existe, usa ela
  if (existingTitles.includes(sheetName)) {
    return sheetName;
  }

  // 3. Se não existe, cria
  const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    }),
  });

  if (!createRes.ok) {
    // Se falhou criar, usa a primeira aba existente
    if (existingTitles.length > 0) {
      console.warn(`[export-to-sheets] Não foi possível criar aba "${sheetName}", usando "${existingTitles[0]}"`);
      return existingTitles[0];
    }
    const txt = await createRes.text();
    throw new Error(`Falha ao criar aba "${sheetName}": ${txt}`);
  }

  return sheetName;
};

/**
 * Limpa todas as células da aba via batchClear (range no BODY).
 */
const clearSheet = async (
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
): Promise<void> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    // Usa apenas o nome da aba sem aspas simples para o clear — range simples
    body: JSON.stringify({ ranges: [`${sheetName}!A:Z`] }),
  });

  if (!res.ok) {
    const txt = await res.text();
    console.warn(`[export-to-sheets] clear warn ${res.status}: ${txt}`);
  }
};

/**
 * Escreve uma matriz de valores via batchUpdate (range no BODY).
 */
const writeRows = async (
  spreadsheetId: string,
  sheetName: string,
  rows: string[][],
  accessToken: string,
): Promise<number> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: [
        {
          range: `${sheetName}!A1`,
          values: rows,
        },
      ],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Sheets API erro de escrita ${res.status}: ${txt}`);
  }

  // totalUpdatedRows inclui o cabeçalho; rows.length já inclui o cabeçalho,
  // então subtraímos 1 para exibir somente a contagem de linhas de dados.
  const json = await res.json() as { totalUpdatedRows?: number };
  const total = json.totalUpdatedRows ?? rows.length;
  return Math.max(0, total - 1); // desconta o cabeçalho
};

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autenticação ────────────────────────────────────────────────────────
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
      return errResponse(401, { error: "Não autenticado.", status: "nao_autenticado" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return errResponse(401, { error: "Sessão inválida.", status: "sessao_invalida" });
    }
    const userId = user.id;

    // ── 2. Parse payload ───────────────────────────────────────────────────────
    let body: { spreadsheetUrl?: string; sheetName?: string };
    try {
      body = await request.json();
    } catch {
      return errResponse(400, { error: "Payload inválido.", status: "payload_invalido" });
    }

    if (!body.spreadsheetUrl?.trim()) {
      return errResponse(400, {
        error: "Campo obrigatório: spreadsheetUrl.",
        status: "payload_invalido",
      });
    }

    const sheetName = body.sheetName?.trim() || "Visão Geral";

    // ── 3. Valida credenciais Google ───────────────────────────────────────────
    if (!GOOGLE_EMAIL || !GOOGLE_PRIVATE_KEY) {
      return errResponse(503, {
        error: "Integração Google Sheets não configurada na plataforma. Contate o suporte.",
        status: "google_nao_configurado",
      });
    }

    // ── 4. Valida assinatura Stripe ────────────────────────────────────────────
    const { data: subscription } = await admin
      .from("user_subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle();

    if (!subscription || !["trialing", "active"].includes(subscription.status)) {
      return errResponse(403, {
        error: "Assinatura necessária (trialing ou active) para usar sincronização de planilhas.",
        status: "bloqueado_assinatura",
      });
    }

    // ── 5. Extrai spreadsheetId ────────────────────────────────────────────────
    let spreadsheetId: string;
    try {
      spreadsheetId = extractSpreadsheetId(body.spreadsheetUrl);
    } catch (e) {
      return errResponse(400, {
        error: e instanceof Error ? e.message : "URL de planilha inválida.",
        status: "url_invalida",
      });
    }

    // ── 6. Access token com escopo de escrita ──────────────────────────────────
    let accessToken: string;
    try {
      accessToken = await getGoogleAccessToken(
        GOOGLE_EMAIL,
        GOOGLE_PRIVATE_KEY,
        "https://www.googleapis.com/auth/spreadsheets", // leitura + escrita
      );
    } catch (e) {
      return errResponse(502, {
        error: e instanceof Error ? e.message : "Falha na autenticação Google.",
        status: "google_auth_erro",
      });
    }

    // ── 7. Lê registros financeiros do DB ─────────────────────────────────────
    const { data: records, error: dbErr } = await admin
      .from("user_registros_financeiros")
      .select(
        "client_name, document_number, due_date, amount, interest_applied, fine_applied, updated_value, phone, category, status, notes",
      )
      .eq("user_id", userId)
      .order("due_date", { ascending: true });

    if (dbErr) {
      console.error("[export-to-sheets] DB read error:", dbErr);
      return errResponse(500, { error: "Erro ao ler registros financeiros.", status: "erro_interno" });
    }

    const rows = (records ?? []) as Array<Record<string, unknown>>;

    // ── 8. Monta dados da planilha ─────────────────────────────────────────────
    const header = [
      "Cliente",
      "Documento",
      "Vencimento",
      "Valor Original (R$)",
      "Juros (%)",
      "Multa (%)",
      "Valor Atualizado (R$)",
      "Telefone",
      "Categoria",
      "Status",
      "Observações",
    ];

    const dataRows = rows.map((r) => {
      const amount  = Number(r.amount  ?? 0);
      const updated = Number(r.updated_value ?? 0) || amount;

      // Converte data de YYYY-MM-DD para DD/MM/YYYY
      const rawDate = String(r.due_date ?? "");
      const dueDatePt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? `${rawDate.slice(8, 10)}/${rawDate.slice(5, 7)}/${rawDate.slice(0, 4)}`
        : rawDate;

      // Prefixo ' força texto no Sheets (evita formatação numérica do telefone)
      const phone = r.phone ? `'${String(r.phone)}` : "";

      return [
        String(r.client_name       ?? ""),
        String(r.document_number   ?? ""),
        dueDatePt,
        amount.toFixed(2).replace(".", ","),
        Number(r.interest_applied  ?? 0).toFixed(2),
        Number(r.fine_applied      ?? 0).toFixed(2),
        updated.toFixed(2).replace(".", ","),
        phone,
        CATEGORY_PT[String(r.category ?? "")] ?? String(r.category ?? ""),
        STATUS_PT[String(r.status   ?? "")] ?? String(r.status ?? ""),
        String(r.notes             ?? ""),
      ];
    });

    const allRows = [header, ...dataRows];

    // ── 9. Garante que a aba existe (cria se necessário) ──────────────────────
    let targetSheet: string;
    try {
      targetSheet = await ensureSheetExists(spreadsheetId, sheetName, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao verificar abas da planilha.";
      console.error("[export-to-sheets] ensureSheet error:", msg);
      return errResponse(422, { error: msg, status: "escrita_erro" });
    }

    // ── 10. Limpa aba e escreve dados ──────────────────────────────────────────
    await clearSheet(spreadsheetId, targetSheet, accessToken);

    let rowsExported: number;
    try {
      rowsExported = await writeRows(spreadsheetId, targetSheet, allRows, accessToken);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao escrever na planilha.";
      console.error("[export-to-sheets] write error:", msg);
      return errResponse(422, { error: msg, status: "escrita_erro" });
    }

    // ── 11. Registra log ───────────────────────────────────────────────────────
    await admin.from("user_import_logs").insert({
      user_id:       userId,
      provider:      "google_sheets",
      status:        "success",
      rows_total:    rows.length,
      rows_imported: rowsExported,
      rows_skipped:  0,
      error_message: null,
      metadata: {
        spreadsheetId,
        sheetName:  targetSheet,
        direction:  "export",
        plan:       subscription.plan,
      },
    });

    // ── 12. Resposta ───────────────────────────────────────────────────────────
    return okResponse({
      success:      true,
      status:       "success",
      rowsExported,
      rowsTotal:    rows.length,
      spreadsheetId,
      sheetName:    targetSheet,
      exportedAt:   new Date().toISOString(),
      error:        null,
    });

  } catch (err) {
    console.error("[export-to-sheets] unhandled:", err);
    return errResponse(500, {
      error:  "Erro interno. Tente novamente ou contate o suporte.",
      status: "erro_interno",
    });
  }
});
