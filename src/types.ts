/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Debtor {
  id: string;
  userId?: string;
  client: string;
  supplier: string;
  document: string;
  dueDate: string; // Format DD/MM/YYYY
  value: number; // Base imported value
  phone: string;
  category: "vencidos" | "a_vencer" | "liquidado";
  interestApplied?: number; // % rate
  fineApplied?: number; // % rate
  updatedValue?: number; // calculated full value
  notes?: string;
  bank?: string; // bank / card product extracted from document
  representativeId?: string; // assigned representative ID
  status: "pending" | "sent" | "failed";
  lastSentMessage?: string;
  lastSentDate?: string;
  // Google Drive match fields (populated by match-drive-files Edge Function)
  driveFileId?: string | null;
  driveFileName?: string | null;
  driveFileUrl?: string | null;
  driveMatchScore?: number | null;
  driveLastMatchAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Representative {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  role: string;
  color: string; // Tailwind color tag
  createdAt?: string;
  updatedAt?: string;
}

export interface ZApiConfig {
  autoBillingEnabled: boolean;
  scheduledTime: string; // "HH:MM" format
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpPayload extends AuthCredentials {
  name: string;
  cpf: string;
  phone: string;
  cep: string;
  address: string;
  city: string;
  state: string;
}

export interface BillingLog {
  id: string;
  userId?: string;
  client: string;
  document: string;
  phone: string;
  value: number;
  dateSent: string;
  tone: MessageTone;
  message: string;
  /**
   * Status do envio.
   * Legados (seed): "sent" | "failed"
   * Reais via Z-API: "sucesso" | "erro" | "bloqueado_limite" |
   *   "bloqueado_assinatura" | "duplicado" | "telefone_invalido"
   */
  status: "sent" | "failed" | "sucesso" | "erro" | "bloqueado_limite" | "bloqueado_assinatura" | "duplicado" | "telefone_invalido";
  type: "auto" | "manual" | "lote";
  providerMessageId?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AccountProfile {
  userId: string;
  email: string;
  displayName: string;
}

export interface UserConfig {
  userId: string;
  globalFinePct: number;
  globalInterestDayPct: number;
  selectedTone: MessageTone;
  sheetUrlInput: string;
  driveLinkedFolder: string;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  plan: string;
  usageCounters: Record<string, number>;
  whatsappStatus: string;
  integrationProvider: string | null;
  lastConnectionCheck: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageTemplateRecord {
  id: string;
  userId: string;
  templateKey: MessageTone;
  name: string;
  description: string;
  template: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ── Pilot mode ────────────────────────────────────────────────────────────────

export interface PilotConfig {
  id:                   string;
  userId:               string;
  pilotEnabled:         boolean;
  dailySendLimit:       number;
  allowedSendStart:     string;   // "HH:MM" UTC
  allowedSendEnd:       string;   // "HH:MM" UTC
  allowedWeekdays:      number[]; // 1=Mon … 7=Sun
  whatsappNumberLabel:  string | null;
  responsibleName:      string | null;
  supportChannel:       string | null;
  notes:                string | null;
  createdAt?:           string;
  updatedAt?:           string;
}

export interface PilotDailySends {
  userId:     string;
  sendDate:   string;
  sentCount:  number;
}

export interface PilotFallbackNote {
  id:             string;
  userId:         string;
  logId:          string | null;
  clientName:     string;
  documentNumber: string | null;
  phoneMasked:    string | null;
  resolution:     "resolvido_manualmente" | "reenviado" | "ignorado" | "contato_direto";
  observation:    string | null;
  resolvedAt:     string;
  createdAt:      string;
}

export interface PilotMetrics {
  totalSentToday:       number;
  dailyLimit:           number;
  remainingToday:       number;
  totalDeliveredToday:  number;
  totalFailedToday:     number;
  totalDuplicateBlocked: number;
  totalInvalidPhone:    number;
  avgDeliveryMinutes:   number | null;
  lastErrors:           PilotLastError[];
  loadedAt:             string;
}

export interface PilotLastError {
  id:         string;
  clientName: string;
  status:     string;
  createdAt:  string;
}

export type MessageTone = "amigavel" | "neutro" | "firme" | "juridico";
export type PlanId = "basic" | "pro" | "premium";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "not_started";

export interface UserSubscription {
  id: string;
  userId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  plan: PlanId;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserUsageCounter {
  id: string;
  userId: string;
  period: string;
  chargesSent: number;
  sheetsImports: number;
  driveLookups: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PatternMessage {
  id: MessageTone;
  name: string;
  description: string;
  template: string;
}
