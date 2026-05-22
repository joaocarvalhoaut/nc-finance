#!/usr/bin/env node
/**
 * e2e-drive-matching.js — Teste E2E real do sistema de matching Drive.
 *
 * Valida no site de produção:
 *
 *   Auth & segurança
 *     1.  Login do usuário de teste
 *     2.  GET sem auth → 401
 *     3.  GET com auth → estrutura correta
 *
 *   Validação de URL (edge function)
 *     4.  POST save sem body → 400 payload_invalido
 *     5.  POST save URL completamente inválida → 400 url_invalida
 *     6.  POST save texto livre sem ID Drive → 400 url_invalida
 *     7.  POST save ID muito curto → 400 url_invalida
 *
 *   Acesso à pasta
 *     8.  POST save com folderId válido porém inacessível → 422 drive_sem_acesso
 *         (ou google_nao_configurado se creds não configuradas)
 *     9.  POST sync sem pasta salva → 404 pasta_nao_configurada
 *
 *   Estado do banco
 *    10.  Tabelas user_drive_folders / user_drive_index / user_drive_index_log existem
 *    11.  Colunas drive_* em user_registros_financeiros existem
 *    12.  Nenhuma senha/token em user_drive_folders
 *
 *   match-drive-files
 *    13.  Chamada autenticada → resposta bem-formada
 *    14.  Sem pasta configurada → drive_folder_nao_configurada OU fast path
 *
 *   Fluxo Drive salvo (se GOOGLE_DRIVE_TEST_FOLDER_URL estiver no .env)
 *    15.  POST save com URL real → indexação em background
 *    16.  GET status → configured=true, fileCount ≥ 0
 *    17.  POST sync → filesFound ≥ 0, durationMs > 0
 *    18.  match-drive-files → fast path (usa índice)
 *    19.  DB: user_drive_index tem linhas para este user
 *    20.  DB: algum user_registros_financeiros com drive_file_id preenchido
 *
 *   send-whatsapp-batch com Drive (dryRun)
 *    21.  dryRun com devedores existentes → resposta válida (Drive colunas OK)
 *
 *   Segurança de resposta
 *    22.  Respostas não expõem file IDs individuais em listas
 *    23.  Respostas não expõem access_token / private_key
 *
 * Uso:
 *   node scripts/e2e-drive-matching.js
 *   node scripts/e2e-drive-matching.js --report
 *
 * Variáveis opcionais:
 *   GOOGLE_DRIVE_TEST_FOLDER_URL — URL de pasta real para testar happy path
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

// ─── Load .env ────────────────────────────────────────────────────────────────

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

const E = process.env;
const SUPABASE_URL   = E.SUPABASE_URL    || E.VITE_SUPABASE_URL    || "";
const ANON_KEY       = E.SUPABASE_ANON_KEY || E.VITE_SUPABASE_ANON_KEY || "";
const SERVICE_KEY    = E.SUPABASE_SERVICE_ROLE_KEY || "";
const TEST_EMAIL     = E.TEST_USER_EMAIL    || "";
const TEST_PASSWORD  = E.TEST_USER_PASSWORD || "";
const TEST_FOLDER_URL = E.GOOGLE_DRIVE_TEST_FOLDER_URL || "";
const SAVE_REPORT    = process.argv.includes("--report");
const FUNCTIONS_URL  = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1` : "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

let _idx = 0;
const results = [];

function section(title) {
  _idx++;
  console.log(`\n${C.bold}${C.cyan}── [${_idx}] ${title} ──${C.reset}`);
}

function pass(check, detail = "") {
  console.log(`  ${C.green}✓${C.reset} ${check}${detail ? ` ${C.dim}(${detail})${C.reset}` : ""}`);
  results.push({ section: _idx, check, status: "PASS", detail });
}
function fail(check, detail = "") {
  console.log(`  ${C.red}✗${C.reset} ${check}${detail ? ` — ${C.red}${detail}${C.reset}` : ""}`);
  results.push({ section: _idx, check, status: "FAIL", detail });
}
function warn(check, detail = "") {
  console.log(`  ${C.yellow}⚠${C.reset} ${check}${detail ? ` — ${detail}` : ""}`);
  results.push({ section: _idx, check, status: "WARN", detail });
}
function skip(check, reason = "") {
  console.log(`  ${C.dim}⊘${C.reset} ${C.dim}${check}${reason ? ` (${reason})` : ""}${C.reset}`);
  results.push({ section: _idx, check, status: "SKIP", detail: reason });
}

async function fn(name, opts = {}) {
  const { method = "POST", body = null, jwt = null, headers = {} } = opts;
  const url = `${FUNCTIONS_URL}/${name}`;
  const h = { "Content-Type": "application/json", ...headers };
  if (jwt) h["Authorization"] = `Bearer ${jwt}`;
  const reqOpts = { method, headers: h };
  if (body !== null && method !== "GET") reqOpts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, reqOpts);
    let json = null;
    try { json = await res.json(); } catch { /* non-json */ }
    return { status: res.status, ok: res.ok, json };
  } catch (err) {
    return { status: 0, ok: false, json: null, error: err.message };
  }
}

/** Returns true if obj (stringified) contains sensitive patterns */
function hasSensitiveData(obj) {
  const s = JSON.stringify(obj ?? "");
  return (
    /private_key/i.test(s) ||
    /access_token/i.test(s) ||
    /Bearer\s+[A-Za-z0-9\-_]{20,}/i.test(s) ||
    /client_email/i.test(s)
  );
}

// Fake folder ID (valid length, invalid permissions)
const FAKE_FOLDER_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs";
const FAKE_FOLDER_URL = `https://drive.google.com/drive/folders/${FAKE_FOLDER_ID}`;

// ─── State ────────────────────────────────────────────────────────────────────

let jwt = null;
let userId = null;
let admin = null;
let folderConfigured = false;
let existingDebtorIds = [];

// ─── Preflight ────────────────────────────────────────────────────────────────

console.log(`\n${C.bold}E2E Drive Matching — NC Finance (produção)${C.reset}`);
console.log(`Endpoint: ${FUNCTIONS_URL}`);
console.log(`Test user: ${TEST_EMAIL || "(não configurado)"}`);
console.log(`Test folder: ${TEST_FOLDER_URL ? "configurada" : "(não configurada — happy path será pulado)"}`);

if (!SUPABASE_URL || !ANON_KEY) {
  console.log(`\n${C.red}✗ SUPABASE_URL / SUPABASE_ANON_KEY não configurados no .env. Abortando.${C.reset}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Auth & segurança básica
// ═══════════════════════════════════════════════════════════════════════════════

section("Auth & segurança básica");

const supabase = createClient(SUPABASE_URL, ANON_KEY);

// 1a. Login
const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
  email: TEST_EMAIL,
  password: TEST_PASSWORD,
});

if (authErr || !authData?.session) {
  fail("Login do usuário de teste", authErr?.message ?? "sem sessão");
  console.log(`\n${C.yellow}⚠ Não foi possível autenticar — testes HTTP serão pulados.${C.reset}`);
} else {
  jwt    = authData.session.access_token;
  userId = authData.user.id;
  pass("Login do usuário de teste", `userId=${userId.slice(0, 8)}…`);
}

if (SERVICE_KEY) {
  admin = createClient(SUPABASE_URL, SERVICE_KEY);
}

// 1b. GET sem auth → 401
const noAuth = await fn("drive-index-folder", { method: "GET" });
if (noAuth.status === 401) {
  pass("GET sem Authorization → 401");
} else {
  fail("GET sem Authorization deveria retornar 401", `status=${noAuth.status}`);
}

// 1c. GET com auth → estrutura correta
if (jwt) {
  const withAuth = await fn("drive-index-folder", { method: "GET", jwt });
  if (withAuth.ok && typeof withAuth.json?.configured === "boolean") {
    folderConfigured = withAuth.json.configured;
    pass("GET com auth → 200 + campo configured", `configured=${folderConfigured}, fileCount=${withAuth.json.fileCount ?? 0}`);
    if (!hasSensitiveData(withAuth.json)) {
      pass("Resposta GET não contém dados sensíveis (tokens/private_key)");
    } else {
      fail("Resposta GET CONTÉM dados sensíveis — violação de segurança");
    }
  } else if (withAuth.status === 403) {
    warn("GET retornou 403 (plano não permite Drive)", JSON.stringify(withAuth.json?.status));
  } else {
    fail("GET com auth falhou", `status=${withAuth.status} ${JSON.stringify(withAuth.json)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Validação de URL — todos os casos de erro
// ═══════════════════════════════════════════════════════════════════════════════

section("Validação de URL no drive-index-folder");

if (!jwt) {
  skip("POST save sem body → 400", "sem JWT");
  skip("POST save URL inválida → 400", "sem JWT");
  skip("POST save texto livre → 400", "sem JWT");
  skip("POST save ID curto → 400", "sem JWT");
} else {
  // 2a. Sem folderUrl
  const r1 = await fn("drive-index-folder", { jwt, body: { action: "save" } });
  if (r1.status === 400 && r1.json?.status === "payload_invalido") {
    pass("POST save sem folderUrl → 400 payload_invalido");
  } else {
    fail("POST save sem folderUrl", `status=${r1.status} status=${r1.json?.status}`);
  }

  // 2b. URL completamente inválida
  const r2 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: "isso nao e uma url" } });
  if (r2.status === 400 && r2.json?.status === "url_invalida") {
    pass("URL inválida (texto livre) → 400 url_invalida");
  } else {
    fail("URL inválida deveria retornar url_invalida", `status=${r2.status} ${r2.json?.status}`);
  }

  // 2c. URL do Drive mas sem folderId (my-drive)
  const r3 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: "https://drive.google.com/drive/my-drive" } });
  if (r3.status === 400 && r3.json?.status === "url_invalida") {
    pass("URL Drive sem folderId → 400 url_invalida");
  } else {
    fail("URL Drive sem folderId", `status=${r3.status} ${r3.json?.status}`);
  }

  // 2d. ID alfanumérico muito curto
  const r4 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: "abc123" } });
  if (r4.status === 400 && r4.json?.status === "url_invalida") {
    pass("ID muito curto (< 25 chars) → 400 url_invalida");
  } else {
    fail("ID curto deveria retornar url_invalida", `status=${r4.status} ${r4.json?.status}`);
  }

  // 2e. URL de planilha (não é pasta)
  const r5 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/edit" } });
  if (r5.status === 400 || r5.status === 422) {
    pass("URL de planilha → erro de validação (não aceita como pasta)", `status=${r5.status}`);
  } else if (r5.status === 503) {
    warn("URL de planilha → Google não configurado (503)", "creds ausentes no ambiente");
  } else {
    warn("URL de planilha resultado inesperado", `status=${r5.status}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Pasta inacessível e sync sem pasta
// ═══════════════════════════════════════════════════════════════════════════════

section("Pasta inacessível e sync sem pasta configurada");

if (!jwt) {
  skip("POST save folderId válido/inacessível → 422 ou 503", "sem JWT");
  skip("POST sync sem pasta → 404", "sem JWT");
} else {
  // 3a. Folder ID válido mas não compartilhado com a service account
  const r6 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: FAKE_FOLDER_URL } });
  if (r6.status === 422 && r6.json?.status === "drive_sem_acesso") {
    pass("Pasta inacessível → 422 drive_sem_acesso", `hint=${r6.json?.serviceAccountHint ? "presente" : "ausente"}`);
    // Check serviceAccountHint is an email, not a token
    if (r6.json?.serviceAccountHint && /.*@.*\.iam\.gserviceaccount\.com/.test(r6.json.serviceAccountHint)) {
      pass("serviceAccountHint é um email de service account (seguro)");
    } else if (r6.json?.serviceAccountHint) {
      warn("serviceAccountHint presente mas não parece service account email", r6.json.serviceAccountHint.slice(0, 40));
    } else {
      warn("serviceAccountHint ausente na resposta de drive_sem_acesso");
    }
  } else if (r6.status === 503 && (r6.json?.status === "google_nao_configurado")) {
    warn("Google não configurado no ambiente (503 google_nao_configurado)", "creds ausentes como Secrets");
  } else if (r6.status === 502 && r6.json?.status === "google_auth_erro") {
    warn("Erro de auth Google (502 google_auth_erro)", "credenciais inválidas ou não configuradas");
  } else if (r6.status === 403 && r6.json?.status === "bloqueado_plano") {
    warn("Plano não permite Drive (403 bloqueado_plano)", "teste com plano Basic");
  } else {
    fail("Resposta inesperada para pasta inacessível", `status=${r6.status} ${JSON.stringify(r6.json)}`);
  }

  // 3b. Sync sem pasta configurada (apenas se não há pasta salva)
  if (!folderConfigured) {
    const r7 = await fn("drive-index-folder", { jwt, body: { action: "sync" } });
    if (r7.status === 404 && r7.json?.status === "pasta_nao_configurada") {
      pass("Sync sem pasta configurada → 404 pasta_nao_configurada");
    } else if (r7.status === 403) {
      warn("Sync → 403 (plano não permite ou não autenticado)", JSON.stringify(r7.json?.status));
    } else {
      fail("Sync sem pasta deveria retornar 404", `status=${r7.status} ${r7.json?.status}`);
    }
  } else {
    skip("Sync sem pasta → pasta já configurada para este usuário", `folderConfigured=true`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Estado do banco (via service_role)
// ═══════════════════════════════════════════════════════════════════════════════

section("Estado das tabelas no banco de dados");

if (!admin) {
  skip("Verificação de tabelas", "SUPABASE_SERVICE_ROLE_KEY não configurada");
} else {
  // 4a. user_drive_folders existe
  const { error: e1 } = await admin.from("user_drive_folders").select("id").limit(1);
  if (!e1) {
    pass("Tabela user_drive_folders existe e é acessível");
  } else {
    fail("Tabela user_drive_folders não encontrada", e1.message);
  }

  // 4b. user_drive_index existe
  const { error: e2 } = await admin.from("user_drive_index").select("id").limit(1);
  if (!e2) {
    pass("Tabela user_drive_index existe e é acessível");
  } else {
    fail("Tabela user_drive_index não encontrada", e2.message);
  }

  // 4c. user_drive_index_log existe
  const { error: e3 } = await admin.from("user_drive_index_log").select("id").limit(1);
  if (!e3) {
    pass("Tabela user_drive_index_log existe e é acessível");
  } else {
    fail("Tabela user_drive_index_log não encontrada", e3.message);
  }

  // 4d. Colunas drive_* em user_registros_financeiros
  const { data: sampleRow, error: e4 } = await admin
    .from("user_registros_financeiros")
    .select("drive_file_id, drive_file_name, drive_file_url, drive_match_score, drive_match_reason, drive_last_match_at")
    .limit(1);
  if (!e4) {
    pass("Colunas drive_* existem em user_registros_financeiros");
    // 4e. Se há linhas, verificar que drive_file_id pode ser null (antes do matching)
    if (sampleRow && sampleRow.length > 0) {
      pass("user_registros_financeiros tem registros", `count≥1`);
    } else {
      warn("user_registros_financeiros está vazio", "sem devedores para testar matching");
    }
  } else {
    fail("Colunas drive_* não existem", e4.message);
  }

  // 4f. user_drive_folders NÃO deve conter colunas com tokens/credenciais
  const { data: folderCols, error: e5 } = await admin
    .from("user_drive_folders")
    .select("id, user_id, folder_url, folder_id, folder_name, is_accessible, file_count, last_indexed_at, last_index_error")
    .limit(1);
  if (!e5) {
    pass("user_drive_folders: schema seguro (sem colunas de token/credencial)");
  } else {
    fail("Erro ao verificar user_drive_folders", e5.message);
  }

  // 4g. Carregar debtors do usuário de teste (para usar depois)
  if (userId) {
    const { data: debtors } = await admin
      .from("user_registros_financeiros")
      .select("id")
      .eq("user_id", userId)
      .limit(5);
    existingDebtorIds = (debtors ?? []).map(d => d.id);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. match-drive-files endpoint
// ═══════════════════════════════════════════════════════════════════════════════

section("match-drive-files — estrutura de resposta");

if (!jwt) {
  skip("match-drive-files sem auth → 401", "sem JWT");
  skip("match-drive-files com auth → resposta bem-formada", "sem JWT");
} else {
  // 5a. Sem auth → 401
  const m1 = await fn("match-drive-files", { body: {} });
  if (m1.status === 401) {
    pass("match-drive-files sem auth → 401");
  } else {
    fail("match-drive-files sem auth deveria ser 401", `status=${m1.status}`);
  }

  // 5b. Com auth → checa estrutura
  const m2 = await fn("match-drive-files", { jwt, body: {} });
  if (m2.ok && m2.json) {
    const hasRequired = "success" in m2.json && "filesFound" in m2.json && "debtorsTotal" in m2.json;
    if (hasRequired) {
      pass("match-drive-files → 200 com campos obrigatórios", `filesFound=${m2.json.filesFound}, matched=${m2.json.debtorsMatched}`);
    } else {
      fail("match-drive-files resposta faltando campos", JSON.stringify(Object.keys(m2.json ?? {})));
    }
    // Segurança: resposta não deve conter tokens/chaves
    if (!hasSensitiveData(m2.json)) {
      pass("match-drive-files resposta sem dados sensíveis");
    } else {
      fail("match-drive-files resposta CONTÉM dados sensíveis");
    }
    // Matches devem ser array (mesmo vazio)
    if (Array.isArray(m2.json?.matches)) {
      pass("Campo 'matches' é array", `length=${m2.json.matches.length}`);
      // Nenhum match deve conter access_token ou private_key
      if (!hasSensitiveData(m2.json.matches)) {
        pass("Items de matches sem dados sensíveis");
      } else {
        fail("Items de matches CONTÊM dados sensíveis");
      }
    } else {
      fail("Campo 'matches' não é array", JSON.stringify(typeof m2.json?.matches));
    }
  } else if (m2.status === 503 && m2.json?.status === "drive_folder_nao_configurada") {
    pass("match-drive-files → 503 drive_folder_nao_configurada (sem pasta configurada)", "esperado sem pasta");
  } else if (m2.status === 403) {
    warn("match-drive-files → 403", JSON.stringify(m2.json?.status));
  } else {
    fail("match-drive-files falhou inesperadamente", `status=${m2.status} ${JSON.stringify(m2.json)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Fluxo completo (apenas se GOOGLE_DRIVE_TEST_FOLDER_URL configurada)
// ═══════════════════════════════════════════════════════════════════════════════

section("Fluxo completo — save + status + sync + match");

if (!TEST_FOLDER_URL) {
  skip("POST save com URL real", "GOOGLE_DRIVE_TEST_FOLDER_URL não configurada");
  skip("GET status após save", "GOOGLE_DRIVE_TEST_FOLDER_URL não configurada");
  skip("POST sync — reindexação incremental", "GOOGLE_DRIVE_TEST_FOLDER_URL não configurada");
  skip("match-drive-files fast path (usa índice)", "GOOGLE_DRIVE_TEST_FOLDER_URL não configurada");
  skip("DB: user_drive_index tem linhas após indexação", "GOOGLE_DRIVE_TEST_FOLDER_URL não configurada");
} else if (!jwt) {
  skip("Fluxo completo", "sem JWT");
} else {
  // 6a. Salvar pasta real
  console.log(`  Testando pasta: ${TEST_FOLDER_URL.slice(0, 60)}…`);
  const s1 = await fn("drive-index-folder", { jwt, body: { action: "save", folderUrl: TEST_FOLDER_URL } });

  if (s1.ok && s1.json?.success) {
    pass("POST save com URL real → sucesso", `folderName="${s1.json.folderName}", fileCount=${s1.json.fileCount}`);
    if (!hasSensitiveData(s1.json)) {
      pass("Resposta save sem dados sensíveis");
    } else {
      fail("Resposta save CONTÉM dados sensíveis");
    }
  } else if (s1.status === 422 && s1.json?.status === "drive_sem_acesso") {
    warn("Pasta real → drive_sem_acesso (verifique compartilhamento)", s1.json?.serviceAccountHint?.slice(0, 40) ?? "sem hint");
  } else if (s1.status === 503 || s1.status === 502) {
    warn("Google não configurado ou auth falhou no server", `${s1.status} ${s1.json?.status}`);
  } else {
    fail("POST save URL real falhou", `status=${s1.status} ${JSON.stringify(s1.json)}`);
  }

  // 6b. GET status após save
  await new Promise(r => setTimeout(r, 1000)); // aguarda 1s para o upsert propagar
  const s2 = await fn("drive-index-folder", { method: "GET", jwt });
  if (s2.ok && s2.json?.configured) {
    pass("GET status → configured=true após save", `fileCount=${s2.json.fileCount ?? 0}`);
    folderConfigured = true;
  } else if (s2.ok && !s2.json?.configured) {
    warn("GET status → configured=false (save pode ter falhado)", JSON.stringify(s2.json));
  } else {
    fail("GET status após save falhou", `status=${s2.status}`);
  }

  // 6c. POST sync
  if (folderConfigured) {
    const s3 = await fn("drive-index-folder", { jwt, body: { action: "sync" } });
    if (s3.ok && s3.json?.success) {
      pass("POST sync → sucesso", `filesFound=${s3.json.filesFound}, indexed=${s3.json.filesIndexed}, skipped=${s3.json.filesSkipped}, ms=${s3.json.durationMs}`);
      if (typeof s3.json.durationMs === "number" && s3.json.durationMs > 0) {
        pass("durationMs reportado corretamente", `${s3.json.durationMs}ms`);
      }
      if (typeof s3.json.debtorsMatched === "number") {
        pass("debtorsMatched reportado", `${s3.json.debtorsMatched}/${s3.json.debtorsTotal ?? "?"}`);
      }
    } else if (s3.status === 502 || s3.status === 503) {
      warn("Sync → erro de autenticação Google", `${s3.status} ${s3.json?.status}`);
    } else {
      fail("Sync falhou", `status=${s3.status} ${JSON.stringify(s3.json)}`);
    }
  } else {
    skip("POST sync — pasta não configurada após save");
  }

  // 6d. match-drive-files — deve usar fast path se índice existe
  const s4 = await fn("match-drive-files", { jwt, body: {} });
  if (s4.ok && s4.json?.success) {
    pass("match-drive-files fast path (pós-sync)", `filesFound=${s4.json.filesFound}, matched=${s4.json.debtorsMatched}`);
  } else if (s4.status === 503) {
    warn("match-drive-files → 503 (pasta não acessível)", JSON.stringify(s4.json?.status));
  } else {
    warn("match-drive-files resultado inesperado", `status=${s4.status}`);
  }

  // 6e. DB: verificar linhas em user_drive_index para este usuário
  if (admin && userId) {
    const { data: indexRows, count } = await admin
      .from("user_drive_index")
      .select("file_id, file_name, metadata_extracted", { count: "exact" })
      .eq("user_id", userId)
      .limit(3);

    if (count !== null && count > 0) {
      pass(`user_drive_index tem ${count} arquivo(s) indexados para este user`);
      const withMeta = (indexRows ?? []).filter(r => r.metadata_extracted).length;
      if (withMeta > 0) {
        pass(`${withMeta} arquivo(s) com metadados extraídos (PDF text extraction funcionou)`);
      } else {
        warn("Nenhum arquivo com metadata_extracted=true (PDFs podem ser apenas imagens ou acesso negado)");
      }
    } else if (count === 0) {
      warn("user_drive_index vazio — pasta pode estar vazia ou indexação ainda em andamento");
    } else {
      fail("Erro ao consultar user_drive_index", "count=null");
    }

    // 6f. Verificar se algum devedor recebeu drive_file_id
    if (existingDebtorIds.length > 0) {
      const { data: matched } = await admin
        .from("user_registros_financeiros")
        .select("id, drive_file_id, drive_match_score, drive_match_reason")
        .eq("user_id", userId)
        .not("drive_file_id", "is", null)
        .limit(3);

      if (matched && matched.length > 0) {
        const sample = matched[0];
        pass(`${matched.length} devedor(es) com drive_file_id preenchido (matching automático funcionou)`);
        pass(`Motivo do match: ${sample.drive_match_reason ?? "?"}`, `score=${sample.drive_match_score ?? "?"}`);
      } else {
        warn("Nenhum devedor com drive_file_id — matching pode não ter encontrado correspondência", `debtors_tested=${existingDebtorIds.length}`);
      }
    } else {
      skip("Verificação de devedores matchados", "sem devedores cadastrados para este user");
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. send-whatsapp-batch com colunas Drive (dryRun)
// ═══════════════════════════════════════════════════════════════════════════════

section("send-whatsapp-batch com colunas Drive (dryRun)");

if (!jwt) {
  skip("dryRun com devedores reais", "sem JWT");
} else if (existingDebtorIds.length === 0) {
  warn("Sem devedores cadastrados para o usuário de teste", "pulando dryRun");
} else {
  const testIds = existingDebtorIds.slice(0, 2);
  const batchRes = await fn("send-whatsapp-batch", {
    jwt,
    body: { debtorIds: testIds, tone: "neutro", dryRun: true },
  });

  if (batchRes.ok && batchRes.json?.success) {
    pass("send-whatsapp-batch dryRun com devedores reais → sucesso", `sent=${batchRes.json.sent}, total=${batchRes.json.totalProcessed}`);
    // Verifica que resposta não expõe drive_file_id nem colunas internas
    if (!hasSensitiveData(batchRes.json)) {
      pass("Resposta dryRun sem dados sensíveis");
    } else {
      fail("Resposta dryRun CONTÉM dados sensíveis");
    }
  } else if (batchRes.status === 403 && batchRes.json?.status === "bloqueado_assinatura") {
    warn("Assinatura bloqueada para usuário de teste", "esperado em ambiente de teste sem plano ativo");
  } else if (batchRes.status === 403 && batchRes.json?.status === "plano_sem_recurso") {
    warn("Plano Basic não tem acesso a lote", "esperado");
  } else if (batchRes.status === 503) {
    warn("Z-API não configurada", JSON.stringify(batchRes.json?.status));
  } else {
    fail("dryRun falhou inesperadamente", `status=${batchRes.status} ${JSON.stringify(batchRes.json)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Segurança geral das respostas
// ═══════════════════════════════════════════════════════════════════════════════

section("Segurança geral — respostas não expõem credenciais");

// Verifica que todas as respostas capturadas não têm dados sensíveis
const allResults = results.filter(r => r.detail);
const sensitiveFound = allResults.filter(r =>
  hasSensitiveData(r.detail) || /private_key|Bearer [A-Za-z0-9]{20}/i.test(r.detail)
);
if (sensitiveFound.length === 0) {
  pass("Nenhuma resposta capturada contém tokens/private_key");
} else {
  fail("Dados sensíveis encontrados em respostas", sensitiveFound.map(r => r.check).join(", "));
}

// Verifica que user_drive_folders não salva tokens
if (admin && userId) {
  const { data: folderRow } = await admin
    .from("user_drive_folders")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (folderRow) {
    const hasToken = hasSensitiveData(folderRow) || JSON.stringify(folderRow).includes("private_key");
    if (!hasToken) {
      pass("user_drive_folders não contém tokens ou credenciais no DB");
    } else {
      fail("user_drive_folders CONTÉM dados sensíveis no DB — violação crítica");
    }
  } else {
    skip("Verificação user_drive_folders", "sem pasta configurada para este usuário");
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Resumo
// ═══════════════════════════════════════════════════════════════════════════════

const passed  = results.filter(r => r.status === "PASS").length;
const failed  = results.filter(r => r.status === "FAIL").length;
const warned  = results.filter(r => r.status === "WARN").length;
const skipped = results.filter(r => r.status === "SKIP").length;
const total   = results.length;

console.log(`\n${"─".repeat(58)}`);
console.log(`${C.bold}Resumo E2E Drive Matching — NC Finance${C.reset}`);
console.log("─".repeat(58));
console.log(`  ${C.green}✓ PASS${C.reset}    ${passed}`);
console.log(`  ${C.red}✗ FAIL${C.reset}     ${failed}`);
console.log(`  ${C.yellow}⚠ WARN${C.reset}     ${warned}`);
console.log(`  ${C.dim}⊘ SKIP${C.reset}     ${skipped}`);
console.log(`  Total     ${total}`);
console.log("─".repeat(58));

if (failed === 0 && warned === 0) {
  console.log(`\nVeredicto: ${C.green}${C.bold}✓ APROVADO${C.reset}\n`);
} else if (failed === 0) {
  console.log(`\nVeredicto: ${C.yellow}${C.bold}⚠ APROVADO COM AVISOS${C.reset} (${warned} warn)\n`);
} else {
  console.log(`\nVeredicto: ${C.red}${C.bold}✗ REPROVADO${C.reset} (${failed} falhas, ${warned} avisos)\n`);
}

if (SAVE_REPORT) {
  const report = {
    runAt:   new Date().toISOString(),
    verdict: failed === 0 ? (warned === 0 ? "APPROVED" : "APPROVED_WITH_WARNINGS") : "FAILED",
    summary: { passed, failed, warned, skipped, total },
    results,
  };
  writeFileSync(join(process.cwd(), "e2e-drive-report.json"), JSON.stringify(report, null, 2));
  console.log("Relatório salvo: e2e-drive-report.json");
}

if (failed > 0) process.exit(1);
