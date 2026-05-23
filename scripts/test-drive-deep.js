#!/usr/bin/env node
/**
 * test-drive-deep.js
 *
 * Valida o fix de matching por subpastas nomeadas com cliente.
 * 1. Autentica
 * 2. Força re-sync da pasta Drive (action:"sync")
 * 3. Chama match-drive-files
 * 4. Mostra quantos devedores foram vinculados
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}

const SUPABASE_URL        = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY   = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_EMAIL          = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD       = process.env.TEST_USER_PASSWORD;

const log = (tag, msg, data) => {
  const ico = { OK:"✅", FAIL:"❌", INFO:"ℹ️", WARN:"⚠️" }[tag] ?? "•";
  console.log(`${ico} [${tag}] ${msg}`);
  if (data !== undefined) console.log("   ", JSON.stringify(data, null, 2));
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Auth ──────────────────────────────────────────────────────────────────────
log("INFO", "Autenticando...");
const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});
if (authErr || !authData.session) {
  log("FAIL", "Auth falhou", authErr?.message);
  process.exit(1);
}
const token = authData.session.access_token;
const userId = authData.user.id;
log("OK", `Auth OK — userId=${userId.slice(0,8)}...`);

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${token}`,
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Garante assinatura ativa ──────────────────────────────────────────────────
await admin.from("user_subscriptions").upsert(
  { user_id: userId, status: "trialing", plan: "pro", updated_at: new Date().toISOString() },
  { onConflict: "user_id" }
);
log("INFO", "Assinatura pro/trialing garantida");

// ─── Limpa índice antigo (força re-index) ───────────────────────────────────────
const { error: delErr } = await admin
  .from("user_drive_index")
  .delete()
  .eq("user_id", userId);
if (!delErr) log("INFO", "Índice Drive antigo removido → re-indexação completa");

// ─── Verifica devedores no DB ─────────────────────────────────────────────────
const { data: existingDebtors } = await admin
  .from("user_registros_financeiros")
  .select("id, client_name")
  .eq("user_id", userId)
  .neq("category", "liquidado")
  .limit(5);

// Sempre limpa e recria para testar os dois critérios: nome e número
await admin.from("user_registros_financeiros").delete().eq("user_id", userId);

const { data: inserted } = await admin
  .from("user_registros_financeiros")
  .insert([
    // Deve casar por NOME: "MOBILAR" nos tokens
    {
      user_id: userId, supplier_name: "TEST", due_date: "2026-07-01",
      client_name: "MOBILAR COMERCIO DE MOVEIS",
      document_number: "MOBILAR-001",
      amount: 1500, phone: "5577981376867",
      category: "a_vencer", status: "pending",
      interest_applied: 0, fine_applied: 0, updated_value: 1500,
    },
    // Deve casar por NÚMERO: "26" no nome do arquivo "26.pdf"
    {
      user_id: userId, supplier_name: "TEST", due_date: "2026-07-01",
      client_name: "JOICE SILVA",
      document_number: "26",
      amount: 500, phone: "5577981376867",
      category: "a_vencer", status: "pending",
      interest_applied: 0, fine_applied: 0, updated_value: 500,
    },
    // Deve casar por NOME + NÚMERO: "JOICE" + "26"
    {
      user_id: userId, supplier_name: "TEST", due_date: "2026-07-01",
      client_name: "JOICE MENDES",
      document_number: "26",
      amount: 800, phone: "5577981376867",
      category: "a_vencer", status: "pending",
      interest_applied: 0, fine_applied: 0, updated_value: 800,
    },
  ])
  .select("id, client_name, document_number");

log("INFO", `${inserted?.length ?? 0} devedores de teste inseridos:`);
for (const r of inserted ?? []) {
  console.log(`   • "${r.client_name}" | doc="${r.document_number}"`);
}

// ─── Salva/garante pasta Drive configurada ──────────────────────────────────────
const FOLDER_URL = "https://drive.google.com/drive/folders/1prDyfNeoBFh3Y1npBgKaVesmM-OjOrUS";

// Verifica se já tem pasta
const { data: folderCfg } = await admin
  .from("user_drive_folders")
  .select("folder_id")
  .eq("user_id", userId)
  .maybeSingle();

if (!folderCfg) {
  log("INFO", "Pasta não configurada. Salvando via action:save...");
  const saveRes = await fetch(`${SUPABASE_URL}/functions/v1/drive-index-folder`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "save", folderUrl: FOLDER_URL }),
  });
  const saveJson = await saveRes.json();
  log(saveRes.ok ? "OK" : "FAIL", `Save pasta ${saveRes.status}`, {
    folderName: saveJson.folderName,
    fileCount:  saveJson.fileCount,
    status:     saveJson.status,
    error:      saveJson.error ?? null,
  });
  // Aguarda indexação em background (a save dispara async)
  await new Promise(r => setTimeout(r, 8000));
} else {
  log("INFO", `Pasta já configurada: ${folderCfg.folder_id}`);
}

// ─── Re-sync ───────────────────────────────────────────────────────────────────
log("INFO", "Acionando re-sync da pasta Drive...");
const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/drive-index-folder`, {
  method: "POST",
  headers,
  body: JSON.stringify({ action: "sync" }),
});
const syncJson = await syncRes.json();
log(syncRes.ok ? "OK" : "FAIL", `Sync ${syncRes.status}`, {
  filesFound:   syncJson.filesFound,
  filesIndexed: syncJson.filesIndexed,
  filesSkipped: syncJson.filesSkipped,
  debtorsMatched: syncJson.debtorsMatched,
  debtorsTotal:   syncJson.debtorsTotal,
  error: syncJson.error ?? null,
});

if (!syncRes.ok) {
  log("WARN", "Detalhes:", syncJson);
}

// ─── Verifica o índice no DB ────────────────────────────────────────────────────
const { data: indexRows } = await admin
  .from("user_drive_index")
  .select("file_id, file_name, file_name_normalized, client_name_extracted")
  .eq("user_id", userId)
  .limit(20);

log("INFO", `Índice tem ${indexRows?.length ?? 0} arquivo(s) indexado(s):`);
for (const r of indexRows ?? []) {
  console.log(`   • ${r.file_name} → norm="${r.file_name_normalized}" | cliente="${r.client_name_extracted}"`);
}

// ─── Match ─────────────────────────────────────────────────────────────────────
log("INFO", "Rodando match-drive-files...");
const matchRes = await fetch(`${SUPABASE_URL}/functions/v1/match-drive-files`, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});
const matchJson = await matchRes.json();
log(matchRes.ok ? "OK" : "FAIL", `Match ${matchRes.status}`, {
  filesFound:     matchJson.filesFound,
  debtorsTotal:   matchJson.debtorsTotal,
  debtorsMatched: matchJson.debtorsMatched,
});

if (matchJson.matches?.length > 0) {
  log("INFO", "Matches encontrados:");
  for (const m of matchJson.matches) {
    if (m.fileId) {
      console.log(`   ✓ devedor=${m.debtorId?.slice(0,8)} → ${m.fileName} (score=${m.score})`);
    }
  }
}

// ─── Verifica devedores com drive_file_id ────────────────────────────────────────
const { data: matched } = await admin
  .from("user_registros_financeiros")
  .select("id, client_name, drive_file_name, drive_match_score")
  .eq("user_id", userId)
  .not("drive_file_id", "is", null);

log("INFO", `Devedores vinculados ao Drive: ${matched?.length ?? 0}`);
for (const r of matched ?? []) {
  console.log(`   ✓ "${r.client_name}" → ${r.drive_file_name} (score=${r.drive_match_score})`);
}

const total = (await admin
  .from("user_registros_financeiros")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .neq("category", "liquidado")).count ?? 0;

if ((matched?.length ?? 0) > 0) {
  log("OK", `Drive matching com subpastas FUNCIONANDO — ${matched.length}/${total} cobráveis vinculados`);
} else {
  log("WARN", `Nenhum devedor vinculado. Verifique se os nomes das subpastas coincidem com os clientes importados.`);

  // Debug: mostra os clientes no DB
  const { data: debtorRows } = await admin
    .from("user_registros_financeiros")
    .select("client_name, category")
    .eq("user_id", userId)
    .limit(10);
  log("INFO", "Clientes no DB:");
  for (const r of debtorRows ?? []) {
    console.log(`   • "${r.client_name}" [${r.category}]`);
  }
}

process.exit(0);
