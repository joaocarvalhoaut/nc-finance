/**
 * googleSheets.ts — cliente mínimo para Google Sheets API v4 via Service Account.
 *
 * Segurança:
 * - Autenticação por JWT RS256 (GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY).
 * - Credenciais lidas APENAS de Supabase Secrets (Deno.env).
 * - Nunca expostos ao frontend.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface SheetRow {
  clientName: string;
  documentNumber: string;
  phone: string;
  amount: number;
  dueDate: string;        // ISO: YYYY-MM-DD
  category: "vencidos" | "a_vencer" | "liquidado";
  notes: string;
  supplier: string;
  rawStatus: string | null;
}

export interface ReadSheetsResult {
  rows: SheetRow[];
  totalRaw: number;       // linhas lidas (excluindo cabeçalho)
  skipped: number;        // linhas ignoradas por dados inválidos
}

// ─── JWT / OAuth helpers ────────────────────────────────────────────────────────

const base64url = (input: Uint8Array | string): string => {
  const b64 =
    typeof input === "string"
      ? btoa(input)
      : btoa(String.fromCharCode(...input));
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const b64 = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
};

export const getGoogleAccessToken = async (
  clientEmail: string,
  privateKeyPem: string,
  scope = "https://www.googleapis.com/auth/spreadsheets.readonly",
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);

  const headerB64  = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payloadB64 = base64url(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3_600,
    iat: now,
  }));

  const sigInput = `${headerB64}.${payloadB64}`;

  // Handle \n escaping that occurs when setting secrets via CLI
  const pemClean = privateKeyPem.replace(/\\n/g, "\n");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pemClean),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(sigInput),
  );

  const jwt = `${sigInput}.${base64url(new Uint8Array(sig))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google OAuth erro ${res.status}: ${txt}`);
  }

  const json = await res.json() as { access_token: string };
  return json.access_token;
};

// ─── Spreadsheet ID extraction ─────────────────────────────────────────────────

export const extractSpreadsheetId = (urlOrId: string): string => {
  const trimmed = urlOrId.trim();
  // URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/...
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  // Direct ID (alphanumeric + hyphens/underscores, ≥20 chars)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  throw new Error(
    "URL ou ID de planilha inválido. Use o link completo do Google Sheets ou o Spreadsheet ID.",
  );
};

// ─── Column aliases ─────────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  clientName:     ["nome", "cliente", "devedor", "customer", "name", "razão social", "razao social", "tomador"],
  documentNumber: ["documento", "cpf", "cnpj", "cpf_cnpj", "cpf/cnpj", "doc", "numero", "número"],
  phone:          ["telefone", "celular", "whatsapp", "phone", "fone", "contato", "tel"],
  amount:         ["valor", "valor_original", "valor_atualizado", "amount", "vlr", "vl", "total"],
  dueDate:        ["vencimento", "data_vencimento", "due_date", "dt_vencimento", "venc", "data venc", "dt venc"],
  status:         ["status", "situacao", "situação", "categoria", "situação do título"],
  notes:          ["observacao", "observação", "obs", "notes", "nota", "comentario", "comentário"],
  supplier:       ["fornecedor", "empresa", "supplier", "emissor", "credor"],
};

const findColIndex = (header: string[], fieldKey: string): number => {
  const aliases = COL_ALIASES[fieldKey] ?? [];
  for (const alias of aliases) {
    const idx = header.findIndex(
      (h) => h.toLowerCase().trim() === alias.toLowerCase(),
    );
    if (idx !== -1) return idx;
  }
  return -1;
};

// ─── Value normalizers ──────────────────────────────────────────────────────────

const cleanDoc = (raw: string): string =>
  raw.replace(/[.\-/\s]/g, "").trim();

const parseBRL = (raw: string): number => {
  if (!raw?.trim()) return 0;
  const cleaned = raw.trim()
    .replace(/R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3})/g, "")  // remove thousand separator
    .replace(",", ".");            // decimal comma → dot
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const parseDate = (raw: string): string | null => {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  // DD/MM/YYYY
  const ptm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ptm) return `${ptm[3]}-${ptm[2].padStart(2, "0")}-${ptm[1].padStart(2, "0")}`;
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD-MM-YYYY
  const dmym = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmym) return `${dmym[3]}-${dmym[2].padStart(2, "0")}-${dmym[1].padStart(2, "0")}`;
  return null;
};

const detectCategory = (
  rawStatus: string | null,
  dueDate: string,
): "vencidos" | "a_vencer" | "liquidado" => {
  if (rawStatus) {
    const s = rawStatus.toLowerCase().trim();
    if (/pago|liquid|quitad|baixado/.test(s)) return "liquidado";
    if (/a[_\s]?vencer|vigente|em dia/.test(s)) return "a_vencer";
    if (/vencido|atraso|venc/.test(s)) return "vencidos";
  }
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today ? "vencidos" : "a_vencer";
};

const normalizePhone = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  const noZero = digits.startsWith("0") ? digits.slice(1) : digits;
  if (noZero.length === 10 || noZero.length === 11) return `55${noZero}`;
  return noZero; // já tem DDI ou será validado depois
};

// ─── Main read function ─────────────────────────────────────────────────────────

export const readSpreadsheet = async (params: {
  spreadsheetId: string;
  sheetName?: string;
  accessToken: string;
}): Promise<ReadSheetsResult> => {
  const { spreadsheetId, sheetName, accessToken } = params;
  const range = sheetName ? `${encodeURIComponent(sheetName)}!A:Z` : "A:Z";
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 403 || res.status === 401) {
    throw new Error(
      "Sem permissão para acessar a planilha. " +
      "Compartilhe-a com o e-mail da service account da plataforma.",
    );
  }
  if (res.status === 404) {
    throw new Error(
      sheetName
        ? `Aba "${sheetName}" não encontrada. Verifique o nome exato da aba.`
        : "Planilha não encontrada. Verifique o URL ou ID.",
    );
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google Sheets API erro ${res.status}: ${txt}`);
  }

  const json = await res.json() as { values?: string[][] };
  const rawValues = json.values;

  if (!rawValues || rawValues.length < 2) {
    throw new Error("Planilha vazia ou sem dados após o cabeçalho.");
  }

  // First row = header
  const headerRaw = rawValues[0].map((h) => (h ?? "").toLowerCase().trim());
  const dataRows  = rawValues.slice(1);

  // Detect column indices
  const colIdx = {
    clientName:     findColIndex(headerRaw, "clientName"),
    documentNumber: findColIndex(headerRaw, "documentNumber"),
    phone:          findColIndex(headerRaw, "phone"),
    amount:         findColIndex(headerRaw, "amount"),
    dueDate:        findColIndex(headerRaw, "dueDate"),
    status:         findColIndex(headerRaw, "status"),
    notes:          findColIndex(headerRaw, "notes"),
    supplier:       findColIndex(headerRaw, "supplier"),
  };

  // Require at minimum: clientName, amount, dueDate
  const missing: string[] = [];
  if (colIdx.clientName  === -1) missing.push("nome/cliente");
  if (colIdx.amount      === -1) missing.push("valor");
  if (colIdx.dueDate     === -1) missing.push("vencimento");
  if (missing.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missing.join(", ")}. ` +
      `Verifique o cabeçalho da planilha.`);
  }

  const get = (row: string[], idx: number): string =>
    idx >= 0 ? (row[idx] ?? "").trim() : "";

  const rows: SheetRow[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    // Skip blank rows
    if (row.every((cell) => !cell?.trim())) { skipped++; continue; }

    const clientName = get(row, colIdx.clientName);
    if (!clientName) { skipped++; continue; }

    const rawAmount  = get(row, colIdx.amount);
    const amount     = parseBRL(rawAmount);
    if (amount <= 0) { skipped++; continue; }

    const rawDate  = get(row, colIdx.dueDate);
    const dueDate  = parseDate(rawDate);
    if (!dueDate) { skipped++; continue; }

    const rawDoc       = get(row, colIdx.documentNumber);
    const documentNumber = cleanDoc(rawDoc);

    const rawPhone = get(row, colIdx.phone);
    const phone    = rawPhone ? normalizePhone(rawPhone) : "";

    // Need at least document OR phone
    if (!documentNumber && !phone) { skipped++; continue; }

    const rawStatus = get(row, colIdx.status) || null;
    const category  = detectCategory(rawStatus, dueDate);

    rows.push({
      clientName,
      documentNumber,
      phone,
      amount,
      dueDate,
      category,
      notes:    get(row, colIdx.notes),
      supplier: get(row, colIdx.supplier) || "NC Finance",
      rawStatus,
    });
  }

  return { rows, totalRaw: dataRows.length, skipped };
};
