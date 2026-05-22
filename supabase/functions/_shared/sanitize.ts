/**
 * sanitize.ts — PII masking and safe-log helpers for Edge Functions.
 *
 * RULE: No log, no DB column, no API response from this platform may contain:
 *   - Full phone number
 *   - Full message text
 *   - Z-API token, client_token, instance_id in logs
 *   - Raw Bearer tokens, API keys
 *   - Full CPF / CNPJ
 *   - Raw request/response bodies from external providers
 *
 * Use these helpers before any console.log() or DB insert that handles the
 * above fields.
 */

// ── Phone ─────────────────────────────────────────────────────────────────────

/**
 * Mask a phone number for safe logging.
 * "5511987654321" → "5511*****321"
 * "11987654321"   → "119*****321"
 */
export function maskPhone(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 6) return "***";
  const keep_start = Math.min(4, digits.length - 3);
  const keep_end   = 3;
  const mask_len   = digits.length - keep_start - keep_end;
  if (mask_len <= 0) return digits.slice(0, keep_start) + "***";
  return digits.slice(0, keep_start) + "*".repeat(mask_len) + digits.slice(-keep_end);
}

// ── Message ───────────────────────────────────────────────────────────────────

/**
 * Truncate a message to a safe preview for logging/storage.
 * Full message content should never be persisted.
 */
export function messagePreview(msg: string, maxLen = 80): string {
  if (!msg) return "";
  const trimmed = msg.trim();
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "…" : trimmed;
}

// ── Tokens / secrets ──────────────────────────────────────────────────────────

/**
 * Mask a token/secret: "abcdef123456" → "abcd...3456"
 * Short values: "ab" → "***"
 */
export function maskToken(secret: string): string {
  if (!secret || secret.length < 8) return "***";
  return secret.slice(0, 4) + "..." + secret.slice(-4);
}

// ── CPF / CNPJ ────────────────────────────────────────────────────────────────

/**
 * Mask CPF: "123.456.789-01" → "123.xxx.xxx-xx"
 */
export function maskCpf(cpf: string): string {
  return cpf.replace(/\b(\d{3})\.\d{3}\.\d{3}-\d{2}\b/g, "$1.xxx.xxx-xx");
}

/**
 * Mask CNPJ: "12.345.678/0001-90" → "12.345.xxx/xxxx-xx"
 */
export function maskCnpj(cnpj: string): string {
  return cnpj.replace(/\b(\d{2}\.\d{3})\.\d{3}\/\d{4}-\d{2}\b/g, "$1.xxx/xxxx-xx");
}

// ── Error messages ────────────────────────────────────────────────────────────

/**
 * Strip credential patterns from error messages before persisting.
 * Prevents tokens/phones from leaking into error_message columns.
 */
export function sanitizeError(err: string): string {
  if (!err) return "";
  return err
    // Bearer tokens
    .replace(/Bearer\s+\S+/gi, "Bearer ***")
    // Generic token patterns
    .replace(/token[=:\s"']+\S+/gi, "token=***")
    .replace(/client[_-]token[=:\s"']+\S+/gi, "client-token=***")
    // API keys
    .replace(/api[_-]?key[=:\s"']+\S+/gi, "apikey=***")
    // CPF patterns
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "***.***.***-**")
    // CNPJ patterns
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "**.***.***/****-**")
    // 10-13 digit sequences — covers DDI+DDD+número (55+11 dígitos = 13) and bare numbers
    .replace(/(?<!\d)(\d{10,13})(?!\d)/g, (m) => maskPhone(m));
}

// ── Composite safe-log builder ────────────────────────────────────────────────

export interface SafeBillingLog {
  phone_masked:        string;
  message_preview:     string;
  provider_message_id: string | null;
  status:              string;
  error_code:          string | null;
  safe_metadata:       Record<string, unknown>;
}

/**
 * Build a safe object for insertion into user_logs_cobranca.
 * Replaces raw phone/message with masked versions.
 */
export function buildSafeBillingLog(params: {
  phone:             string;
  message:           string;
  status:            string;
  providerMessageId?: string | null;
  errorMessage?:     string | null;
  tone?:             string;
  type?:             string;
  provider?:         string;
}): SafeBillingLog & { tone: string; type: string; provider: string } {
  return {
    phone_masked:        maskPhone(params.phone),
    message_preview:     messagePreview(params.message),
    provider_message_id: params.providerMessageId ?? null,
    status:              params.status,
    error_code:          params.errorMessage ? sanitizeError(params.errorMessage).slice(0, 300) : null,
    safe_metadata:       {
      message_len:  params.message?.length ?? 0,
      phone_digits: (params.phone ?? "").replace(/\D/g, "").length,
    },
    tone:     params.tone     ?? "neutro",
    type:     params.type     ?? "manual",
    provider: params.provider ?? "zapi",
  };
}
