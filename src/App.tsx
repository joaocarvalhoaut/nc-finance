import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import LandingPage from "./components/LandingPage";
import SubscriptionGate from "./components/SubscriptionGate";
import SubscriptionStatusCard from "./components/SubscriptionStatusCard";
import { PLAN_LIST } from "./config/plans";
import { useAccount } from "./hooks/useAccount";
import { useSubscription } from "./hooks/useSubscription";
import { billingLogsService } from "./services/billingLogsService";
import { financeService } from "./services/financeService";
import { representativesService } from "./services/representativesService";
import { subscriptionService } from "./services/subscriptionService";
import { userConfigService } from "./services/userConfigService";
import { whatsappService, SEND_STATUS_LABELS, type SendChargeStatus } from "./services/whatsappService";
import { googleSheetsService, type ImportResult as SheetsImportResult } from "./services/googleSheetsService";
import { googleDriveService, DRIVE_STATUS_LABELS, type DriveMatchResult, type DriveMatchStatus } from "./services/googleDriveService";
import { whatsappBatchService, BATCH_TOP_STATUS_LABELS, type BatchChargeResult, type BatchTopStatus } from "./services/whatsappBatchService";
import { automationService, RULE_TYPE_LABELS, JOB_STATUS_COLORS, type AutomationRule, type AutomationRun, type AutomationRuleCreate } from "./services/automationService";
import { metricsService, type OperationalMetrics } from "./services/metricsService";
import { parseImportFile } from "./utils/importFileParser";
import { 
  Debtor, 
  Representative, 
  BillingLog,
  PlanId,
  UserConfig,
  ZApiConfig, 
  MessageTone, 
  PatternMessage
} from "./types";
import { 
  Users, 
  UserPlus, 
  FileCheck2, 
  Trash2, 
  FileSpreadsheet, 
  Download, 
  Percent, 
  CheckCircle, 
  Clock, 
  Send, 
  Settings, 
  Search, 
  SlidersHorizontal,
  PlusCircle,
  HelpCircle,
  ExternalLink,
  Info,
  DollarSign,
  AlertTriangle,
  History,
  TrendingUp,
  CloudLightning,
  Smartphone,
  Check,
  Zap,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  CheckSquare,
  Square,
  SendHorizonal,
  Bot,
  ToggleLeft,
  ToggleRight,
  CalendarClock
} from "lucide-react";

// Default Pattern message templates following user specification
const DEFAULT_PATTERNS: PatternMessage[] = [
  {
    id: "amigavel",
    name: "Amigável (Preventivo)",
    description: "Abordagem leve para alertar antes do vencimento.",
    template: `Olá {nome_cliente}, tudo bem? 😊
Passando para lembrar de forma tranquila sobre o boleto abaixo, que segue em nosso acompanhamento.

Documento: {documento}
Boleto: {documento_boleto}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Quis me adiantar para facilitar sua organização e evitar qualquer correria perto do vencimento.
Se precisar, posso reenviar os dados do boleto ou te ajudar a localizar as informações mais rapidamente.

Fico à disposição. Equipe NC Finance.`
  },
  {
    id: "neutro",
    name: "Neutro (Institucional)",
    description: "Mensagem direta focada na validação do pagamento.",
    template: `Olá {nome_cliente},
Segue o acompanhamento do título abaixo para sua verificação.

Documento: {documento}
Boleto: {documento_boleto}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

O título está no prazo informado e permanece em acompanhamento preventivo.
Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.

Atenciosamente, equipe financeira NC Finance.`
  },
  {
    id: "firme",
    name: "Firme (Cobrança Ativa)",
    description: "Foco em urgência com aviso de escalonamento.",
    template: `Olá {nome_cliente},
Precisamos tratar com prioridade a pendência financeira abaixo.

Documento: {documento}
Boleto: {documento_boleto}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

O título acumula {dias_atraso} dia(s) de atraso e exige uma definição imediata.
Pedimos regularização ainda hoje ou retorno objetivo com a previsão de pagamento.

Sem um posicionamento, o caso segue em escalonamento interno para acompanhamento diário.
Equipe de cobrança NC Finance.`
  },
  {
    id: "juridico",
    name: "Jurídico (Formal administrativo)",
    description: "Notificação mais formal e extrajudicial preventiva.",
    template: `Prezado(a) {nome_cliente},
Comunicamos, para fins de registro administrativo, a permanência da pendência descrita abaixo.

Documento: {documento}
Boleto: {documento_boleto}
Vencimento: {vencimento}
Valor: R$ {valor_atualizado}

Consta em sistema atraso de {dias_atraso} dia(s), sem regularização identificada até o momento.
Solicitamos manifestação formal e a respectiva regularização financeira com a maior brevidade possível.

Na ausência de retorno, o caso permanece sujeito ao fluxo interno de cobrança administrativa da empresa.

Atenciosamente, departamento administrativo NC Finance.`
  }
];

const INITIAL_REPRESENTATIVE_IDS = {
  amanda: "11111111-1111-4111-8111-111111111111",
  bruno: "22222222-2222-4222-8222-222222222222",
  clara: "33333333-3333-4333-8333-333333333333"
} as const;

// Seed initial devedores matching the Portuguese financial context
const INITIAL_DEBTORS: Debtor[] = [
  {
    id: "d1",
    client: "Carlos Eduardo Neves",
    supplier: "NC Empreendimentos",
    document: "4241-2",
    dueDate: "11/03/2026",
    value: 2248.60,
    phone: "5577999887720",
    category: "vencidos",
    interestApplied: 2,
    fineApplied: 1,
    notes: "Aguardando retorno do e-mail do financeiro",
    representativeId: INITIAL_REPRESENTATIVE_IDS.amanda,
    status: "pending"
  },
  {
    id: "d2",
    client: "Mariana Silva Bastos",
    supplier: "NC Telecom S/A",
    document: "8891-B",
    dueDate: "25/08/2026",
    value: 540.00,
    phone: "5577999112233",
    category: "a_vencer",
    interestApplied: 0,
    fineApplied: 0,
    notes: "Cliente solicitou envio preventivo amigável",
    representativeId: INITIAL_REPRESENTATIVE_IDS.bruno,
    status: "pending"
  },
  {
    id: "d3",
    client: "Julio César de Mello",
    supplier: "NC Empreendimentos",
    document: "2104-E",
    dueDate: "10/05/2026",
    value: 12500.00,
    phone: "5511999445566",
    category: "vencidos",
    interestApplied: 2,
    fineApplied: 1,
    notes: "Acordo de parcelamento em andamento",
    representativeId: INITIAL_REPRESENTATIVE_IDS.amanda,
    status: "pending"
  },
  {
    id: "d4",
    client: "Tech Solutions Ltda",
    supplier: "NC Distribuidora",
    document: "99120-X",
    dueDate: "18/05/2026",
    value: 3670.40,
    phone: "5577988884422",
    category: "liquidado",
    interestApplied: 0,
    fineApplied: 0,
    notes: "Pago via PIX com comprovante anexado",
    representativeId: INITIAL_REPRESENTATIVE_IDS.clara,
    status: "sent"
  }
];

// Seed initial representatives for devedores matching the scenario
const INITIAL_REPRESENTATIVES: Representative[] = [
  { id: INITIAL_REPRESENTATIVE_IDS.amanda, name: "Amanda Azevedo", phone: "5577999881111", role: "Coordenador de Cobrança", color: "text-emerald-400 bg-emerald-500/10" },
  { id: INITIAL_REPRESENTATIVE_IDS.bruno, name: "Bruno Pinheiro", phone: "5511988772233", role: "Gestor Contas Sul", color: "text-sky-400 bg-sky-500/10" },
  { id: INITIAL_REPRESENTATIVE_IDS.clara, name: "Clara Vasconcelos", phone: "5521977663344", role: "Jurídico NC Finance", color: "text-amber-400 bg-amber-500/10" }
];

const INITIAL_BILLING_LOGS: BillingLog[] = [
  {
    id: "log-1",
    client: "Construções Alvorada LTDA",
    document: "12.345.678/0001-90",
    phone: "5577999881122",
    value: 14200.0,
    dateSent: "20/05/2026, 09:00",
    tone: "neutro",
    message:
      "Prezado gestor da Construções Alvorada LTDA, identificamos em nosso sistema um faturamento em aberto no valor de R$ 14.200,00 com vencimento em 08/05/2026. Solicitamos a regularização conforme boleto em anexo.\n\nCódigo de barras: 00190.00009 02748.294017 38491.104928 1 972600001420000",
    status: "sent",
    type: "auto"
  },
  {
    id: "log-2",
    client: "Supermercado Santos Eireli",
    document: "98.765.432/0001-10",
    phone: "5577988776655",
    value: 6800.0,
    dateSent: "19/05/2026, 09:02",
    tone: "amigavel",
    message:
      "Olá equipe do Supermercado Santos, tudo bem? 😊 Passando para lembrar que a sua fatura de R$ 6.800,00 vence amanhã, 20/05/2026. O boleto correspondente foi localizado via integração de pastas NC no Google Drive e está disponível no link para download. Obrigado!",
    status: "sent",
    type: "auto"
  },
  {
    id: "log-3",
    client: "Consultório Dr. Marcos Toledo",
    document: "94.814.731/0001-08",
    phone: "5577991122334",
    value: 2350.0,
    dateSent: "18/05/2026, 14:35",
    tone: "amigavel",
    message:
      "Olá Dr. Marcos, segue em anexo o arquivo referente à mensalidade de suporte financeiro NC no valor de R$ 2.350,00 com vencimento para o dia 25/05/2026. Tenha um excelente dia!",
    status: "sent",
    type: "manual"
  }
];

const DEFAULT_USER_CONFIG = {
  globalFinePct: 2.0,
  globalInterestDayPct: 0.33,
  selectedTone: "amigavel" as MessageTone,
  sheetUrlInput:
    "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKv196_0TBQI8Z-x7y8jGs8dRA5nFM/edit",
};

interface ExtractedDebtorCandidate {
  client?: string;
  supplier?: string;
  cliente?: string;
  fornecedor?: string;
  document?: string;
  numero_titulo?: string;
  dueDate?: string;
  vencimento?: string;
  value?: number | string;
  valor?: number | string;
  phone?: string;
  telefone?: string;
}

type GeminiExtractApiResponse =
  | {
      ok: true;
      debtors?: ExtractedDebtorCandidate[];
      warnings?: string[];
    }
  | {
      ok: false;
      error?: string;
    };

const parseGeminiExtractResponse = async (
  response: Response,
): Promise<GeminiExtractApiResponse> => {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (isJson) {
    return (await response.json()) as GeminiExtractApiResponse;
  }

  const rawText = await response.text();
  const safeText = rawText.trim();

  console.warn("[gemini.extract.non_json_response]", {
    status: response.status,
    contentType,
    preview: safeText.slice(0, 300),
  });

  return {
    ok: false,
    error:
      safeText ||
      "A API de extração retornou uma resposta inválida. Tente novamente em alguns instantes.",
  };
};

export default function App() {
  const {
    account,
    user,
    userId,
    session,
    loading: isSessionLoading,
    signIn,
    signUp,
    signOut,
    configError: authConfigError
  } = useAccount();
  const {
    subscription,
    usage,
    loading: isSubscriptionLoading,
    error: subscriptionError,
    canUseApp,
    canSendCharge,
    plan,
    remainingCharges,
    refreshSubscription,
    isSyncing: isSubscriptionSyncing,
    startCheckoutPolling,
  } = useSubscription(userId);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSubscriptionActionLoading, setIsSubscriptionActionLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState<string>("inicio"); // Defaults to apresentacao so user can read landing page
  const isLoggedIn = Boolean(session);
  const [subscriptionGateError, setSubscriptionGateError] = useState("");

  // Temporary seed data is now persisted by user_id on first authenticated access.
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  const [zapiConfig, setZapiConfig] = useState<ZApiConfig>({
    autoBillingEnabled: true,
    scheduledTime: "09:00"
  });
  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [patternTemplates, setPatternTemplates] = useState<PatternMessage[]>(DEFAULT_PATTERNS);

  // Extraction screen properties
  const [importText, setImportText] = useState<string>("");
  const [importCategory, setImportCategory] = useState<"vencidos" | "a_vencer" | "liquidado">("vencidos");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedDebtors, setExtractedDebtors] = useState<Debtor[]>([]);
  const [extractionAlert, setExtractionAlert] = useState<string>("");
  const [isParsingImportFile, setIsParsingImportFile] = useState<boolean>(false);
  // Gemini rate-limit countdown: > 0 means "waiting N seconds before auto-retry"
  const [geminiCountdown, setGeminiCountdown] = useState<number>(0);
  const [importFileName, setImportFileName] = useState<string>("");

  // Representative management form values
  const [newRepName, setNewRepName] = useState("");
  const [newRepPhone, setNewRepPhone] = useState("");
  const [newRepRole, setNewRepRole] = useState("Representante");

  // Global fine/interest controllers in Overview Panel
  const [globalFinePct, setGlobalFinePct] = useState<number>(DEFAULT_USER_CONFIG.globalFinePct);
  const [globalInterestDayPct, setGlobalInterestDayPct] = useState<number>(DEFAULT_USER_CONFIG.globalInterestDayPct);

  // Sheets and Drive properties
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(DEFAULT_USER_CONFIG.sheetUrlInput);
  const [sheetNameInput, setSheetNameInput] = useState<string>("");
  const [isSheetsSynching, setIsSheetsSynching] = useState<boolean>(false);
  const [sheetsImportResult, setSheetsImportResult] = useState<SheetsImportResult | null>(null);
  const [isDriveMatching, setIsDriveMatching] = useState<boolean>(false);
  const [driveMatchResult, setDriveMatchResult] = useState<DriveMatchResult | null>(null);

  // Batch WhatsApp send state
  const [selectedDebtorIds, setSelectedDebtorIds] = useState<Set<string>>(new Set());
  const [isBatchSending, setIsBatchSending] = useState<boolean>(false);
  const [batchSendResult, setBatchSendResult] = useState<BatchChargeResult | null>(null);

  // Automation state
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [automationRuns, setAutomationRuns] = useState<AutomationRun[]>([]);
  const [isLoadingAutomation, setIsLoadingAutomation] = useState<boolean>(false);
  const [automationError, setAutomationError] = useState<string>("");
  const [showCreateRuleForm, setShowCreateRuleForm] = useState<boolean>(false);
  const [newRuleForm, setNewRuleForm] = useState<Partial<AutomationRuleCreate>>({
    name: "",
    ruleType: "overdue",
    daysBefore: 3,
    messageTone: "neutro",
    customMessage: null,
    sendWindowStart: null,
    sendWindowEnd: null,
    maxDailySends: null,
  });

  // Operational metrics state (dashboard)
  const [operationalMetrics, setOperationalMetrics] = useState<OperationalMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(false);

  // Filters state in Overview Tab
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");

  // Billing Tab specific interactive properties
  const [selectedDebtorForMessage, setSelectedDebtorForMessage] = useState<Debtor | null>(null);
  const [selectedTone, setSelectedTone] = useState<MessageTone>(DEFAULT_USER_CONFIG.selectedTone);
  const [customMessageDraft, setCustomMessageDraft] = useState<string>("");
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [messageFeedback, setMessageFeedback] = useState<{success: boolean; text: string} | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<PlanId | null>(PLAN_LIST[1]?.id || "pro");

  // Billing history logs state
  const [billingLogs, setBillingLogs] = useState<BillingLog[]>([]);
  const [selectedLogDetail, setSelectedLogDetail] = useState<BillingLog | null>(null);

  useEffect(() => {
    if (isLoggedIn && currentTab === "inicio") {
      setCurrentTab("dashboard");
    }
  }, [currentTab, isLoggedIn]);

  const handleSignIn = async ({ email, password }: { email: string; password: string }) => {
    setIsAuthenticating(true);
    try {
      await signIn({ email, password });
      setCurrentTab("dashboard");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignUp = async ({ name, email, password }: { name: string; email: string; password: string }) => {
    setIsAuthenticating(true);
    try {
      const authResult = await signUp({ name, email, password });
      const needsEmailConfirmation = !authResult.session;

      if (!needsEmailConfirmation) {
        setCurrentTab("dashboard");
      }

      return {
        needsEmailConfirmation,
        message: needsEmailConfirmation
          ? "Conta criada com sucesso. Confira seu email para confirmar o acesso antes de entrar."
          : "Conta criada com sucesso. Redirecionando para o painel..."
      };
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentTab("inicio");
  };

  // Detec??o de retorno do Stripe Checkout
  // Stripe redireciona para ?checkout=success após pagamento confirmado.
  // O webhook pode chegar com 1-10 s de atraso ? iniciamos polling para aguardar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get("checkout");
    if (!checkoutResult) return;

    // Limpa o parâmetro da URL imediatamente (evita re-trigger em F5)
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("checkout");
    window.history.replaceState({}, "", cleanUrl.toString());

    if (checkoutResult === "success" && userId) {
      // Inicia polling aguardando o webhook do Stripe atualizar o status
      startCheckoutPolling();
    }
    // canceled: apenas limpa URL, não faz nada (usuário volta para SubscriptionGate)
  }, [userId]);

  // Gemini rate-limit countdown — ticks every second, auto-retries when it reaches 0
  useEffect(() => {
    if (geminiCountdown <= 0) return;
    const timer = setTimeout(() => {
      setGeminiCountdown((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // Auto-retry: clear alert and trigger extraction again
          setExtractionAlert("");
          // defer so state flush completes before handleAIExtract runs
          setTimeout(() => void handleAIExtract(), 0);
        }
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geminiCountdown]);

  // Carregamento inicial de dados da conta autenticada

  const handleStartCheckout = async (planId: PlanId) => {
    setIsSubscriptionActionLoading(true);
    setSubscriptionGateError("");

    try {
      const { checkout_url } = await subscriptionService.createCheckoutSession(planId);
      window.location.assign(checkout_url);
    } catch (error) {
      setSubscriptionGateError(error instanceof Error ? error.message : "Falha ao iniciar checkout Stripe.");
      setIsSubscriptionActionLoading(false);
    }
  };

  const handleOpenBillingPortal = async () => {
    setIsSubscriptionActionLoading(true);
    setSubscriptionGateError("");

    try {
      const { portal_url } = await subscriptionService.createBillingPortalSession();
      window.location.assign(portal_url);
    } catch (error) {
      setSubscriptionGateError(error instanceof Error ? error.message : "Falha ao abrir portal de assinatura.");
      setIsSubscriptionActionLoading(false);
    }
  };

  // Future service calls should derive ownership from the authenticated account, never from client-supplied ownership fields.
  const currentOwnerUserId = userId;
  const buildUserConfigPayload = (): UserConfig | null => {
    if (!currentOwnerUserId) return null;

    return {
      userId: currentOwnerUserId,
      globalFinePct,
      globalInterestDayPct,
      selectedTone,
      sheetUrlInput,
      driveLinkedFolder: "",
      subscriptionStatus: "trialing",
      stripeCustomerId: null,
      plan: "starter",
      usageCounters: {
        imports: debtors.length,
        charges: billingLogs.length
      },
      whatsappStatus: "mock_pending",
      integrationProvider: null,
      lastConnectionCheck: null
    };
  };

  useEffect(() => {
    if (!currentOwnerUserId || !isLoggedIn) return;

    let isMounted = true;

    const bootstrapWorkspace = async () => {
      setIsWorkspaceLoading(true);
      setWorkspaceError("");

      try {
        const [records, reps, logs, config, templates] = await Promise.all([
          financeService.listByUser(currentOwnerUserId),
          representativesService.listByUser(currentOwnerUserId),
          billingLogsService.listByUser(currentOwnerUserId),
          userConfigService.getConfig(currentOwnerUserId),
          userConfigService.listMessageTemplates(currentOwnerUserId)
        ]);

        const hydratedRecords = records.length
          ? records
          : await financeService.createMany(currentOwnerUserId, INITIAL_DEBTORS);
        const hydratedRepresentatives = reps.length
          ? reps
          : await representativesService.createMany(currentOwnerUserId, INITIAL_REPRESENTATIVES);
        const hydratedLogs = logs.length
          ? logs
          : await billingLogsService.createMany(currentOwnerUserId, INITIAL_BILLING_LOGS);
        const hydratedConfig =
          config ||
          (await userConfigService.upsertConfig({
            userId: currentOwnerUserId,
            globalFinePct: DEFAULT_USER_CONFIG.globalFinePct,
            globalInterestDayPct: DEFAULT_USER_CONFIG.globalInterestDayPct,
            selectedTone: DEFAULT_USER_CONFIG.selectedTone,
            sheetUrlInput: DEFAULT_USER_CONFIG.sheetUrlInput,
            driveLinkedFolder: "",
            subscriptionStatus: "trialing",
            stripeCustomerId: null,
            plan: "starter",
            usageCounters: { imports: hydratedRecords.length, charges: hydratedLogs.length },
            whatsappStatus: "mock_pending",
            integrationProvider: null,
            lastConnectionCheck: null
          }));
        const hydratedTemplates = templates.length
          ? templates
          : await userConfigService.replaceMessageTemplates(currentOwnerUserId, DEFAULT_PATTERNS);

        if (!isMounted) return;

        setDebtors(hydratedRecords);
        setRepresentatives(hydratedRepresentatives);
        setBillingLogs(hydratedLogs);
        setGlobalFinePct(hydratedConfig.globalFinePct);
        setGlobalInterestDayPct(hydratedConfig.globalInterestDayPct);
        setSelectedTone(hydratedConfig.selectedTone);
        setSheetUrlInput(hydratedConfig.sheetUrlInput || DEFAULT_USER_CONFIG.sheetUrlInput);
        setPatternTemplates(
          hydratedTemplates.map((template) => ({
            id: template.templateKey,
            name: template.name,
            description: template.description,
            template: template.template
          })),
        );
      } catch (error) {
        if (!isMounted) return;
        const message = error instanceof Error ? error.message : "Falha ao carregar seus dados.";
        setWorkspaceError(message);
      } finally {
        if (isMounted) {
          setIsWorkspaceLoading(false);
        }
      }
    };

    bootstrapWorkspace().catch((error) => {
      if (!isMounted) return;
      setWorkspaceError(error instanceof Error ? error.message : "Falha inesperada ao carregar workspace.");
      setIsWorkspaceLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [currentOwnerUserId, isLoggedIn]);


  useEffect(() => {
    const payload = buildUserConfigPayload();
    if (!payload || isWorkspaceLoading) return;

    const timeoutId = window.setTimeout(() => {
      setIsSavingConfig(true);
      userConfigService
        .upsertConfig(payload)
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Falha ao salvar configuracoes.";
          setWorkspaceError(message);
        })
        .finally(() => {
          setIsSavingConfig(false);
        });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    billingLogs.length,
    currentOwnerUserId,
    debtors.length,
    globalFinePct,
    globalInterestDayPct,
    isWorkspaceLoading,
    selectedTone,
    sheetUrlInput
  ]);

  // Update calculated values when debtors or global parameters change
  useEffect(() => {
    const updated = debtors.map(d => {
      // If vencido, compute simple delays & interest
      let delayDays = 0;
      if (d.category === "vencidos") {
        // Let's assume some delay days from 11/03/2026 or standard 5 days
        delayDays = 12;
      }
      const multaValue = d.value * (globalFinePct / 100);
      const jurosValue = d.value * ((globalInterestDayPct * delayDays) / 100);
      const finalValue = Math.round((d.value + multaValue + jurosValue) * 100) / 100;

      return {
        ...d,
        interestApplied: globalInterestDayPct,
        fineApplied: globalFinePct,
        updatedValue: d.category === "liquidado" ? d.value : finalValue
      };
    });
    // Prevent infinite loop by verifying differences before state set
    const hasChanged = JSON.stringify(updated.map(u => u.updatedValue)) !== JSON.stringify(debtors.map(u => u.updatedValue));
    if (hasChanged) {
      setDebtors(updated);
    }
  }, [globalFinePct, globalInterestDayPct]);

  // Sync drafted text message when selected debitor or tone updates
  useEffect(() => {
    if (selectedDebtorForMessage) {
      setCustomMessageDraft(buildMessageText(selectedDebtorForMessage, selectedTone));
    }
  }, [selectedDebtorForMessage, selectedTone]);

  useEffect(() => {
    if (!debtors.length) {
      setSelectedDebtorForMessage(null);
      return;
    }

    if (!selectedDebtorForMessage) {
      setSelectedDebtorForMessage(debtors[0]);
      return;
    }

    const stillExists = debtors.some((debtor) => debtor.id === selectedDebtorForMessage.id);
    if (!stillExists) {
      setSelectedDebtorForMessage(debtors[0]);
    }
  }, [debtors, selectedDebtorForMessage]);

  // Localizar PDFs no Google Drive e associar aos devedores
  const handleMatchDriveFiles = async () => {
    setIsDriveMatching(true);
    setDriveMatchResult(null);
    try {
      const result = await googleDriveService.matchDriveFiles();
      setDriveMatchResult(result);
      if (result.success && result.matches.length > 0) {
        // Aplica os matches retornados no state local de devedores
        setDebtors((prev) =>
          prev.map((d) => {
            const m = result.matches.find((r) => r.debtorId === d.id);
            if (!m) return d;
            return {
              ...d,
              driveFileId:      m.fileId,
              driveFileName:    m.fileName,
              driveFileUrl:     m.fileUrl,
              driveMatchScore:  m.score,
              driveLastMatchAt: result.matchedAt,
            };
          }),
        );
        void refreshSubscription();
      }
    } finally {
      setIsDriveMatching(false);
    }
  };

  // Envio em lote de cobran?as
  const handleBatchSend = async () => {
    if (selectedDebtorIds.size === 0 || isBatchSending) return;
    setIsBatchSending(true);
    setBatchSendResult(null);
    try {
      const result = await whatsappBatchService.sendBatchCharges({
        debtorIds: Array.from(selectedDebtorIds),
        tone: selectedTone,
        customMessage: undefined,
      });
      setBatchSendResult(result);
      if (result.sent > 0) {
        void refreshSubscription();
        // Marca devedores enviados com sucesso como "sent" no state local
        const successIds = new Set(
          result.results
            .filter((r) => r.status === "sucesso")
            .map((r) => r.debtorId),
        );
        if (successIds.size > 0) {
          setDebtors((prev) =>
            prev.map((d) =>
              successIds.has(d.id) ? { ...d, status: "sent" as const } : d,
            ),
          );
        }
      }
      setSelectedDebtorIds(new Set()); // limpa seleção após envio
    } finally {
      setIsBatchSending(false);
    }
  };

  // Automa??es
  const loadAutomationData = async () => {
    setIsLoadingAutomation(true);
    setAutomationError("");
    try {
      const [rules, runs] = await Promise.all([
        automationService.listRules(),
        automationService.listRuns(20),
      ]);
      setAutomationRules(rules);
      setAutomationRuns(runs);
    } catch (e) {
      setAutomationError(e instanceof Error ? e.message : "Falha ao carregar automações.");
    } finally {
      setIsLoadingAutomation(false);
    }
  };

  useEffect(() => {
    if (currentTab === "automacoes" && isLoggedIn && automationRules.length === 0 && !isLoadingAutomation) {
      void loadAutomationData();
    }
  }, [currentTab, isLoggedIn]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.name?.trim()) return;
    try {
      const created = await automationService.createRule({
        name: newRuleForm.name,
        ruleType: newRuleForm.ruleType ?? "overdue",
        daysBefore: newRuleForm.ruleType === "due_in_days" ? (newRuleForm.daysBefore ?? 3) : null,
        messageTone: newRuleForm.messageTone ?? "neutro",
        customMessage: newRuleForm.customMessage ?? null,
        sendWindowStart: newRuleForm.sendWindowStart ?? null,
        sendWindowEnd: newRuleForm.sendWindowEnd ?? null,
        maxDailySends: newRuleForm.maxDailySends ?? null,
      });
      setAutomationRules((prev) => [...prev, created]);
      setShowCreateRuleForm(false);
      setNewRuleForm({ name: "", ruleType: "overdue", daysBefore: 3, messageTone: "neutro" });
    } catch (e) {
      setAutomationError(e instanceof Error ? e.message : "Falha ao criar regra.");
    }
  };

  const handleToggleRule = async (id: string, enabled: boolean) => {
    setAutomationRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled } : r)),
    );
    try {
      await automationService.toggleRule(id, enabled);
    } catch (e) {
      // rollback
      setAutomationRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)),
      );
      setAutomationError(e instanceof Error ? e.message : "Falha ao atualizar regra.");
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!window.confirm("Excluir esta regra de automação? Ela não poderá ser recuperada.")) return;
    setAutomationRules((prev) => prev.filter((r) => r.id !== id));
    try {
      await automationService.deleteRule(id);
    } catch (e) {
      void loadAutomationData();
      setAutomationError(e instanceof Error ? e.message : "Falha ao excluir regra.");
    }
  };

  // M?tricas operacionais
  const loadOperationalMetrics = async () => {
    if (!isLoggedIn) return;
    setIsLoadingMetrics(true);
    try {
      const limit = usage?.planLimit ?? 300;
      const metrics = await metricsService.load(limit);
      setOperationalMetrics(metrics);
    } catch {
      // silently ignore ? metrics are non-critical
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  useEffect(() => {
    if (currentTab === "dashboard" && isLoggedIn && !operationalMetrics && !isLoadingMetrics) {
      void loadOperationalMetrics();
    }
  }, [currentTab, isLoggedIn]);

  // Helper routine to format raw currency values in Brazil standards
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Build simulated message template replacements dynamically
  const buildMessageText = (debtor: Debtor, tone: MessageTone): string => {
    const pat = patternTemplates.find(p => p.id === tone);
    if (!pat) return "";

    const daysAtraso = debtor.category === "vencidos" ? "12" : "0";
    const valStr = debtor.updatedValue ? debtor.updatedValue.toFixed(2) : debtor.value.toFixed(2);
    
    return pat.template
      .replace(/{nome_cliente}/g, debtor.client)
      .replace(/{documento}/g, debtor.document)
      .replace(/{documento_boleto}/g, debtor.document)
      .replace(/{vencimento}/g, debtor.dueDate)
      .replace(/{valor_atualizado}/g, parseFloat(valStr).toLocaleString("pt-BR", { minimumFractionDigits: 2 }))
      .replace(/{dias_atraso}/g, daysAtraso);
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsParsingImportFile(true);
    setExtractionAlert("");
    setExtractedDebtors([]);
    setImportFileName(file.name);

    try {
      const parsedText = await parseImportFile(file);

      if (!parsedText.trim()) {
        throw new Error("O arquivo foi lido, mas não contém texto extraível para a IA.");
      }

      setImportText(parsedText);
    } catch (error) {
      setImportFileName("");
      setImportText("");
      setExtractionAlert(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o arquivo enviado. Use PDF, TXT, CSV ou Excel com texto acessível.",
      );
    } finally {
      setIsParsingImportFile(false);
    }
  };

  // Call Gemini extraction backend pipeline
  const handleAIExtract = async () => {
    if (!importText.trim()) {
      setExtractionAlert("Escreva, cole ou carregue um arquivo com informacoes reais de cobranca antes de prosseguir.");
      return;
    }

    setIsExtracting(true);
    setExtractionAlert("");
    setGeminiCountdown(0);
    try {
      const response = await fetch("/api/gemini/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textContent: importText,
          category: importCategory === "vencidos" ? "Vencidos" : importCategory === "a_vencer" ? "A vencer" : "Liquidacao"
        })
      });

      const data = await parseGeminiExtractResponse(response);

      // Rate-limit: show countdown and auto-retry
      if (response.status === 429) {
        const raw = data as unknown as Record<string, unknown>;
        const retryAfter = typeof raw.retryAfterSeconds === "number" ? raw.retryAfterSeconds : 65;
        const msg =
          typeof raw.error === "string"
            ? raw.error
            : `Limite de requisições atingido. Aguardando ${retryAfter}s para tentar novamente…`;
        setExtractionAlert(msg);
        setGeminiCountdown(retryAfter);
        return;
      }

      if (!response.ok) {
        const message =
          "error" in data && typeof data.error === "string"
            ? data.error
            : "Falha ao processar extracao IA.";
        throw new Error(message);
      }
      if (data.ok && data.debtors && Array.isArray(data.debtors)) {
        const parsedList = data.debtors
          .map((item: ExtractedDebtorCandidate, index: number) => ({
            id: `ext-${Date.now()}-${index}`,
            client: item.client || item.cliente || "",
            supplier: item.supplier || item.fornecedor || "",
            document: item.document || item.numero_titulo || "",
            dueDate: item.dueDate || item.vencimento || "",
            value: Number(item.value ?? item.valor ?? 0),
            phone: item.phone || item.telefone || "",
            category: importCategory,
            status: "pending" as const
          }))
          .filter((item: Debtor) => item.client && item.document && item.dueDate && Number.isFinite(item.value) && item.value > 0);

        setExtractedDebtors(parsedList);
        if (Array.isArray(data.warnings) && data.warnings.length > 0) {
          console.warn("[gemini.extract.warnings]", data.warnings);
          setExtractionAlert(data.warnings.join(" "));
        } else if (parsedList.length === 0) {
          setExtractionAlert("Nenhum registro financeiro valido foi retornado pela IA para o conteudo enviado.");
        }
      } else {
        setExtractedDebtors([]);
        setExtractionAlert("Nenhum dado financeiro pode ser extraido de forma estruturada. Verifique o conteudo do arquivo ou texto informado.");
      }
    } catch (err) {
      setExtractedDebtors([]);
      setExtractionAlert(err instanceof Error ? err.message : "Falha ao processar a extracao com Gemini.");
    } finally {
      setIsExtracting(false);
    }
  };
  // Appends parsed extraction items back to the general central view state
  const sendExtractedToOverview = async () => {
    if (extractedDebtors.length === 0 || !currentOwnerUserId) return;

    try {
      const savedDebtors = await financeService.createMany(currentOwnerUserId, extractedDebtors);
      setDebtors((prev) => [...prev, ...savedDebtors]);
      setExtractedDebtors([]);
      setImportText("");
      setImportFileName("");
      setCurrentTab("visao_geral");
    } catch (error) {
      setExtractionAlert(error instanceof Error ? error.message : "Nao foi possivel salvar os registros importados.");
    }
  };

  // Individual editable text change handler on the parsed list
  const updateExtractedField = (id: string, field: keyof Debtor, val: Debtor[keyof Debtor]) => {
    setExtractedDebtors(prev => prev.map(d => {
      if (d.id === id) {
        return { ...d, [field]: val };
      }
      return d;
    }));
  };

  // Modify individual rows on the main general table
  const updateGeneralDebtorField = async (id: string, field: keyof Debtor, val: string | number) => {
    const currentDebtor = debtors.find((debtor) => debtor.id === id);
    if (!currentDebtor || !currentOwnerUserId) return;

    const updatedDebtor = { ...currentDebtor, [field]: val };
    setDebtors((prev) => prev.map((debtor) => (debtor.id === id ? updatedDebtor : debtor)));

    try {
      const savedDebtor = await financeService.update(currentOwnerUserId, updatedDebtor);
      setDebtors((prev) => prev.map((debtor) => (debtor.id === id ? savedDebtor : debtor)));
      if (selectedDebtorForMessage?.id === id) {
        setSelectedDebtorForMessage(savedDebtor);
      }
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Falha ao salvar alteracao do devedor.");
    }
  };

  // Delete option inside extracted stage
  const removeExtractedRow = (id: string) => {
    setExtractedDebtors(prev => prev.filter(d => d.id !== id));
  };

  // Delete option inside general table
  const deleteGeneralDebtor = async (id: string) => {
    if (!currentOwnerUserId) return;

    setDebtors((prev) => prev.filter((debtor) => debtor.id !== id));
    if (selectedDebtorForMessage?.id === id) {
      setSelectedDebtorForMessage(null);
    }

    try {
      await financeService.remove(currentOwnerUserId, id);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Falha ao excluir devedor.");
    }
  };

  // Registers a new representative for assignment
  const handleAddRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepName.trim() || !currentOwnerUserId) return;

    const colors = [
      "text-emerald-400 bg-emerald-500/10",
      "text-cyan-400 bg-cyan-500/10",
      "text-amber-400 bg-amber-500/10",
      "text-fuchsia-400 bg-fuchsia-500/10",
      "text-emerald-300 bg-emerald-500/15"
    ];
    const newRep: Representative = {
      id: `rep-${Date.now()}`,
      name: newRepName,
      phone: newRepPhone || "5577999880000",
      role: newRepRole,
      color: colors[representatives.length % colors.length]
    };

    try {
      const savedRepresentative = await representativesService.create(currentOwnerUserId, newRep);
      setRepresentatives((prev) => [...prev, savedRepresentative]);
      setNewRepName("");
      setNewRepPhone("");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Falha ao salvar representante.");
    }
  };

  // Importação real do Google Sheets via Edge Function
  const handleImportSheets = async () => {
    if (!sheetUrlInput.trim()) return;
    setIsSheetsSynching(true);
    setSheetsImportResult(null);

    try {
      const result = await googleSheetsService.importSheets({
        spreadsheetUrl: sheetUrlInput.trim(),
        sheetName: sheetNameInput.trim() || undefined,
      });

      setSheetsImportResult(result);

      if (result.success && currentOwnerUserId) {
        // Recarrega devedores do DB para refletir os dados importados
        const updated = await financeService.listByUser(currentOwnerUserId);
        setDebtors(updated);
        // Atualiza contadores de uso (sheets_imports foi incrementado no backend)
        void refreshSubscription();
      }
    } catch (e) {
      setSheetsImportResult({
        success: false,
        status: "error",
        rowsTotal: 0,
        rowsImported: 0,
        rowsSkipped: 0,
        error: "Erro inesperado ao importar. Tente novamente.",
        logId: null,
        spreadsheetId: null,
        lastSyncAt: null,
      });
    } finally {
      setIsSheetsSynching(false);
    }
  };

  // Simulated Excel/CSV formatted text downloader
  const downloadExcelFormat = () => {
    // Generate valid CSV payload representing excel data structure
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID Cliente;Fornecedor;Documento;Vencimento;Valor Base;Juros Aplicados(%);Multa Aplicada(%);Valor Atualizado;Telefone;Categoria;Responsavel;Observacoes\n";
    
    debtors.forEach(d => {
      const rep = representatives.find(r => r.id === d.representativeId);
      const repName = rep ? rep.name : "Nenhum";
      const notesClean = d.notes ? d.notes.replace(/;/g, ",") : "";
      csvContent += `${d.client};${d.supplier};${d.document};${d.dueDate};${d.value.toFixed(2)};${d.interestApplied || 0};${d.fineApplied || 0};${(d.updatedValue || d.value).toFixed(2)};${d.phone};${d.category};${repName};${notesClean}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `nc_finance_devedores_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear visual matrix debtors
  const clearOverviewVision = async () => {
    if (window.confirm("Você tem certeza de que deseja apagar absolutamente todos os devedores da visão geral?")) {
      if (!currentOwnerUserId) return;
      const currentIds = debtors.map((debtor) => debtor.id);
      setDebtors([]);
      setSelectedDebtorForMessage(null);

      try {
        await Promise.all(currentIds.map((debtorId) => financeService.remove(currentOwnerUserId, debtorId)));
      } catch (error) {
        setWorkspaceError(error instanceof Error ? error.message : "Falha ao limpar registros financeiros.");
      }
    }
  };

  // Envio real via Edge Function send-whatsapp-charge (Z-API global da plataforma)
  const handleSendMessage = async () => {
    if (!selectedDebtorForMessage) return;

    // Pr?-checagem visual (backend re-valida tudo ? isso s? evita round-trip desnecess?rio)
    if (!canSendCharge) {
      setMessageFeedback({
        success: false,
        text: "Envio bloqueado: verifique o status da assinatura ou o limite mensal do seu plano."
      });
      return;
    }

    setIsSendingMessage(true);
    setMessageFeedback(null);

    try {
      const result = await whatsappService.sendCharge({
        debtorId: selectedDebtorForMessage.id,
        phone: selectedDebtorForMessage.phone,
        message: customMessageDraft,
        tone: selectedTone,
        clientName: selectedDebtorForMessage.client,
        documentNumber: selectedDebtorForMessage.document,
        amount: selectedDebtorForMessage.updatedValue ?? selectedDebtorForMessage.value,
      });

      if (result.success) {
        // Atualiza registro local do devedor
        void updateGeneralDebtorField(selectedDebtorForMessage.id, "status", "sent");
        void updateGeneralDebtorField(selectedDebtorForMessage.id, "lastSentDate", new Date().toLocaleString());
        void updateGeneralDebtorField(selectedDebtorForMessage.id, "lastSentMessage", customMessageDraft);

        // Adiciona log na UI (o log real já foi criado no backend pelo Edge Function)
        const localLogEntry: BillingLog = {
          id: result.logId ?? `local-log-${Date.now()}`,
          userId: currentOwnerUserId || undefined,
          client: selectedDebtorForMessage.client,
          document: selectedDebtorForMessage.document,
          phone: selectedDebtorForMessage.phone,
          value: selectedDebtorForMessage.updatedValue ?? selectedDebtorForMessage.value,
          dateSent: new Date().toLocaleString("pt-BR"),
          tone: selectedTone,
          message: customMessageDraft,
          status: "sucesso",
          type: "manual",
          providerMessageId: result.messageId ?? null,
          payload: null,
        };
        setBillingLogs((prev) => [localLogEntry, ...prev]);

        // Atualiza contadores de uso na UI (backend já incrementou no DB)
        void refreshSubscription();

        setMessageFeedback({
          success: true,
          text: `Mensagem enviada com sucesso! ID: ${result.messageId ?? "?"}. ${
            result.chargesUsed != null && result.chargesLimit != null
              ? `Uso do mês: ${result.chargesUsed}/${result.chargesLimit}`
              : ""
          }`,
        });
      } else {
        // Mapeia status para mensagem legível ao usuário
        const friendlyText =
          SEND_STATUS_LABELS[result.status as SendChargeStatus] ??
          result.error ??
          "Falha ao enviar cobrança.";

        setMessageFeedback({ success: false, text: friendlyText });

        // Se limite atingido, também atualiza contadores para refletir UI corretamente
        if (result.status === "bloqueado_limite") {
          void refreshSubscription();
        }
      }
    } catch (e) {
      setMessageFeedback({
        success: false,
        text: "Erro inesperado ao contatar o servidor. Tente novamente.",
      });
    } finally {
      setIsSendingMessage(false);
    }
  };


  // Metrics calculators for beautiful custom interactive Dashboard
  const totalOriginalVolumeStatus = debtors.reduce((acc, d) => acc + d.value, 0);
  const totalUpdatedVolumeStatus = debtors.reduce((acc, d) => acc + (d.updatedValue || d.value), 0);
  
  const vencidosCount = debtors.filter(d => d.category === "vencidos").length;
  const aVencerCount = debtors.filter(d => d.category === "a_vencer").length;
  const liquidadoCount = debtors.filter(d => d.category === "liquidado").length;

  const vencidosValue = debtors.filter(d => d.category === "vencidos").reduce((acc, d) => acc + (d.updatedValue || d.value), 0);
  const aVencerValue = debtors.filter(d => d.category === "a_vencer").reduce((acc, d) => acc + (d.updatedValue || d.value), 0);
  const liquidadoValue = debtors.filter(d => d.category === "liquidado").reduce((acc, d) => acc + d.value, 0);

  // Apply filters to display debtors lists
  const filteredDebtors = debtors.filter(d => {
    const matchesSearch = d.client.toLowerCase().includes(searchFilter.toLowerCase()) || 
                          d.document.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          d.supplier.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCategory = categoryFilter === "all" ? true : d.category === categoryFilter;
    const matchesRep = repFilter === "all" ? true : d.representativeId === repFilter;

    return matchesSearch && matchesCategory && matchesRep;
  });

  // Hot template text quick inserts
  const insertTemplatePresetText = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copiado com sucesso! Agora você pode colar diretamente nos campos de texto.");
  };

  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          <p className="text-sm font-semibold text-white">Validando sessao Supabase...</p>
          <p className="text-xs text-zinc-500">Preparando o acesso seguro ao painel NC Finance.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen">
      {!isLoggedIn ? (
        <LandingPage 
          onLogin={handleSignIn}
          onSignUp={handleSignUp}
          isAuthLoading={isAuthenticating}
          authConfigError={authConfigError}
        />
      ) : (isSubscriptionLoading && !isSubscriptionSyncing) ? (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm font-semibold text-white">Verificando assinaturaâ¬¦</p>
            <p className="text-xs text-zinc-500">Preparando acesso seguro ao painel NC Finance.</p>
          </div>
        </div>
      ) : !canUseApp ? (
        <SubscriptionGate
          email={account?.email || user?.email || ""}
          loading={isSubscriptionActionLoading || isSubscriptionLoading}
          error={subscriptionGateError || subscriptionError}
          selectedPlanId={selectedPlanId}
          onSelectPlan={(planId) => {
            setSelectedPlanId(planId);
            void handleStartCheckout(planId);
          }}
          onManageSubscription={() => void handleOpenBillingPortal()}
          onRefresh={() => void refreshSubscription()}
          onBack={() => {
            setSubscriptionGateError("");
            setCurrentTab("inicio");
          }}
          onLogout={() => void handleSignOut()}
          subscription={subscription}
          usage={usage}
          isSyncing={isSubscriptionSyncing}
        />
      ) : (
        <>
          <Sidebar
            currentTab={currentTab === "inicio" ? "dashboard" : currentTab}
            onTabChange={(tab) => setCurrentTab(tab)}
            isLoggedIn={isLoggedIn}
            onLogout={handleSignOut}
            onLoginClick={() => {
              setCurrentTab("dashboard");
            }}
            userLabel={account?.displayName || "Conta autenticada"}
            userEmail={account?.email || user?.email || ""}
          />

          <main className="transition-all duration-300 pl-14 md:pl-16 min-h-screen flex flex-col justify-between">
            
            <div className="border-b border-zinc-800/60 bg-zinc-950 p-4 sticky top-0 z-20 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white capitalize">
                  {currentTab === "dashboard" && "Dashboard & Métricas"}
                  {currentTab === "importar" && "Importação Inteligente com IA"}
                  {currentTab === "visao_geral" && "Painel Geral de Devedores"}
                  {currentTab === "cobranca" && "Automação e Comunicação"}
                  {currentTab === "historico" && "Histórico de Cobrança"}
                  {currentTab === "automacoes" && "Automações de Cobrança"}
                </h2>
              </div>

              <div className="flex items-center gap-4">

                <div className="flex gap-1.5 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <button 
                    onClick={() => setCurrentTab("dashboard")} 
                    className={`px-3 py-1 rounded-lg text-xs font-semibold select-none transition-all ${currentTab === "dashboard" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}
                  >
                    Dashboard
                  </button>
                  <button 
                    onClick={() => setCurrentTab("visao_geral")} 
                    className={`px-3 py-1 rounded-lg text-xs font-semibold select-none transition-all ${currentTab === "visao_geral" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}
                  >
                    Visão Geral
                  </button>
                  <button 
                    onClick={() => setCurrentTab("cobranca")} 
                    className={`px-3 py-1 rounded-lg text-xs font-semibold select-none transition-all ${currentTab === "cobranca" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}
                  >
                    Cobrança
                  </button>
                  <button
                    onClick={() => setCurrentTab("historico")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold select-none transition-all ${currentTab === "historico" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}
                  >
                    Histórico
                  </button>
                  <button
                    onClick={() => setCurrentTab("automacoes")}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold select-none transition-all ${currentTab === "automacoes" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"}`}
                  >
                    Automações
                  </button>
                </div>
              </div>
            </div>

            {(isWorkspaceLoading || workspaceError || isSavingConfig) && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
                <div className="space-y-2">
                  {isWorkspaceLoading && (
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                      Carregando seus dados persistidos no Supabase...
                    </div>
                  )}
                  {workspaceError && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                      {workspaceError}
                    </div>
                  )}
                  {isSavingConfig && !isWorkspaceLoading && !workspaceError && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Salvando suas preferencias...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
              
              <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-emerald-500/10 p-4 sm:p-5 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-[200px] h-full bg-[radial-gradient(circle_at_right_top,rgba(16,185,129,0.06),transparent)]" />
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-emerald-400 animate-pulse" /> Sistema Moderno NC Finance
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 font-light mt-1">
                      Gerencie faturamentos, extraia devedores via inteligência artificial com Gemini 3.5 Flash e envie notificações automáticas com Z-API acopladas ao Google Drive.
                    </p>
                  </div>
                </div>
              </div>

              {currentTab === "dashboard" && (
                <div className="space-y-8">
                  <SubscriptionStatusCard
                    subscription={subscription}
                    usage={usage}
                    remainingCharges={remainingCharges}
                    canSendCharge={canSendCharge}
                    onManageSubscription={() => void handleOpenBillingPortal()}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    
                    <div className="bg-zinc-900/60 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[120px] shadow">
                      <div className="flex items-center justify-between text-zinc-500 text-xs uppercase tracking-wider font-mono">
                        <span>Faturamento Base Inicial</span>
                        <DollarSign className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">{formatBRL(totalOriginalVolumeStatus)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2">
                        Total acumulado original importado das faturas.
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-emerald-500/10 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[120px] shadow">
                      <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500/15 rounded-bl-xl text-[9px] font-bold text-emerald-400 flex items-center justify-center font-mono">+12%</div>
                      <div className="flex items-center justify-between text-emerald-400 text-xs uppercase tracking-wider font-mono">
                        <span>Faturamento Corrigido</span>
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono">{formatBRL(totalUpdatedVolumeStatus)}</span>
                      </div>
                      <div className="text-[10px] text-emerald-400/60 mt-2">
                        Somado {globalFinePct}% de multa + {globalInterestDayPct}% de juros diários.
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[120px] shadow">
                      <div className="flex items-center justify-between text-rose-400 text-xs uppercase tracking-wider font-mono">
                        <span>Pendência Crítica</span>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono">{formatBRL(vencidosValue)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2">
                        Boletos vencidos há cerca de 12 dias.
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-900 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[120px] shadow">
                      <div className="flex items-center justify-between text-emerald-400 text-xs uppercase tracking-wider font-mono">
                        <span>Total Liquidado</span>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-2xl sm:text-3xl font-extrabold text-white font-mono">{formatBRL(liquidadoValue)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-2">
                        Faturas baixadas e confirmadas em sistema.
                      </div>
                    </div>

                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    <div className="lg:col-span-8 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-white">Fluxo Projetado de Recuperação</h4>
                          <p className="text-xs text-zinc-500">Representação visual do volume devedor por categoria contábil</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block"/> Vencidos</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500 inline-block"/> A Vencer</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"/> Liquidados</span>
                        </div>
                      </div>

                      <div className="relative w-full h-[240px] border-b border-l border-zinc-800 pt-4 px-2">
                        <svg className="w-full h-full" viewBox="0 0 600 200" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          <line x1="0" y1="50" x2="600" y2="50" stroke="#27272a" strokeDasharray="4 4" strokeWidth="1" />
                          <line x1="0" y1="100" x2="600" y2="100" stroke="#27272a" strokeDasharray="4 4" strokeWidth="1" />
                          <line x1="0" y1="150" x2="600" y2="150" stroke="#27272a" strokeDasharray="4 4" strokeWidth="1" />

                          <rect x="50" y={200 - Math.min(180, (vencidosValue / (totalUpdatedVolumeStatus || 1)) * 180)} width="65" height={Math.min(180, (vencidosValue / (totalUpdatedVolumeStatus || 1)) * 180)} rx="8" fill="#f43f5e" opacity="0.85" />
                          <rect x="250" y={200 - Math.min(180, (aVencerValue / (totalUpdatedVolumeStatus || 1)) * 180)} width="65" height={Math.min(180, (aVencerValue / (totalUpdatedVolumeStatus || 1)) * 180)} rx="8" fill="#f59e0b" opacity="0.85" />
                          <rect x="450" y={200 - Math.min(180, (liquidadoValue / (totalUpdatedVolumeStatus || 1)) * 180)} width="65" height={Math.min(180, (liquidadoValue / (totalUpdatedVolumeStatus || 1)) * 180)} rx="8" fill="#10b981" opacity="0.95" />
                        </svg>

                        <div className="absolute left-0 right-0 -bottom-6 flex justify-around text-[10px] text-zinc-500 font-mono">
                          <span className="text-rose-400 font-bold">Vencidos ({formatBRL(vencidosValue)})</span>
                          <span className="text-amber-400 font-bold">A Vencer ({formatBRL(aVencerValue)})</span>
                          <span className="text-emerald-400 font-bold">Liquidado ({formatBRL(liquidadoValue)})</span>
                        </div>
                      </div>

                      <div className="pt-4 flex flex-col sm:flex-row justify-between text-xs text-zinc-400 gap-2">
                        <span>Total Geral em Monitoria: <span className="text-white font-mono font-bold">{debtors.length} clientes</span></span>
                        <span>Média por Boleto: <span className="text-emerald-400 font-mono font-bold">{formatBRL(debtors.length > 0 ? totalUpdatedVolumeStatus / debtors.length : 0)}</span></span>
                      </div>
                    </div>

                    <div className="lg:col-span-4 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 flex flex-col justify-between shadow-xl">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Responsáveis Ativos</h4>
                        <p className="text-xs text-zinc-500">Membros de cobrança cadastrados</p>
                      </div>

                      <div className="space-y-3 max-h-[170px] overflow-y-auto pr-1">
                        {representatives.map(r => {
                          const assignedCount = debtors.filter(db => db.representativeId === r.id).length;
                          return (
                            <div key={r.id} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                              <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
                                <div>
                                  <div className="text-xs font-bold text-zinc-300">{r.name}</div>
                                  <div className="text-[10px] text-zinc-500">{r.role}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] uppercase font-mono bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-300 font-bold">
                                  {assignedCount} devedores
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setCurrentTab("visao_geral")}
                        className="w-full mt-2 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Gerenciar Responsáveis e Devedores
                      </button>
                    </div>

                  </div>

                  <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-900">
                    <h4 className="text-sm font-bold text-white mb-4">Fluxo Operacional de Cobranças da NC Finance</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-850 flex flex-col gap-2">
                        <span className="font-mono text-emerald-400 font-bold">Passo 1</span>
                        <h5 className="font-bold text-white">Importação e Extração</h5>
                        <p className="text-zinc-500 font-light">Cole o relatório bruto ou insira as parcelas para que a IA do Gemini estruture os vencimentos.</p>
                      </div>
                      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-850 flex flex-col gap-2">
                        <span className="font-mono text-emerald-400 font-bold">Passo 2</span>
                        <h5 className="font-bold text-white">Correção de Valores</h5>
                        <p className="text-zinc-500 font-light">Defina os juros diários e a multa de atraso. O sistema atualiza os valores finais imediatamente.</p>
                      </div>
                      <div className="p-4 rounded-xl bg-zinc-300/5 border border-zinc-850 flex flex-col gap-2">
                        <span className="font-mono text-emerald-400 font-bold">Passo 3</span>
                        <h5 className="font-mono text-zinc-400">Seleção do Tom</h5>
                        <p className="text-zinc-500 font-light">Escolha entre Amigável, Neutro, Firme ou de Notificação Jurídica de acordo com o atraso.</p>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col gap-2">
                        <span className="font-mono text-emerald-400 font-bold">Passo 4</span>
                        <h5 className="font-bold text-emerald-400">Disparo Automatizado</h5>
                        <p className="text-emerald-400/70 font-light">Configure o disparador via Z-API integrado aos boletos do Google Drive para envio imediato.</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Painel Operacional
                      </h4>
                      <button
                        onClick={() => void loadOperationalMetrics()}
                        disabled={isLoadingMetrics}
                        className="text-xs text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingMetrics ? "animate-spin" : ""}`} />
                        {operationalMetrics ? new Date(operationalMetrics.loadedAt).toLocaleTimeString("pt-BR") : "Carregar"}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Envios este mês</p>
                        <p className="text-xl font-extrabold text-white font-mono">
                          {operationalMetrics?.usageThisMonth?.chargesUsed ?? (usage?.chargesUsed ?? 0)}
                          <span className="text-xs font-normal text-zinc-500">/{operationalMetrics?.usageThisMonth?.planLimit ?? (usage?.planLimit ?? "?")}</span>
                        </p>
                      </div>
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Limite restante</p>
                        <p className={`text-xl font-extrabold font-mono ${(operationalMetrics?.usageThisMonth?.remaining ?? remainingCharges ?? 0) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {operationalMetrics?.usageThisMonth?.remaining ?? remainingCharges ?? "?"}
                        </p>
                      </div>
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Taxa de sucesso</p>
                        <p className={`text-xl font-extrabold font-mono ${(operationalMetrics?.successRateThisMonth ?? 100) >= 80 ? "text-emerald-400" : "text-amber-400"}`}>
                          {isLoadingMetrics ? "?" : `${operationalMetrics?.successRateThisMonth ?? 100}%`}
                        </p>
                      </div>
                      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Jobs na fila</p>
                        <p className={`text-xl font-extrabold font-mono ${(operationalMetrics?.activeJobsInQueue ?? 0) > 0 ? "text-amber-400" : "text-zinc-400"}`}>
                          {isLoadingMetrics ? "?" : (operationalMetrics?.activeJobsInQueue ?? 0)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { label: "Vencidos", count: debtors.filter(d => d.category === "vencidos").length, color: "text-rose-400 border-rose-500/20 bg-rose-500/5" },
                        { label: "A Vencer", count: debtors.filter(d => d.category === "a_vencer").length, color: "text-amber-400 border-amber-500/20 bg-amber-500/5" },
                        { label: "Liquidados", count: debtors.filter(d => d.category === "liquidado").length, color: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className={`border rounded-2xl p-4 flex items-center justify-between ${color}`}>
                          <span className="text-xs font-semibold">{label}</span>
                          <span className="text-2xl font-extrabold font-mono">{count}</span>
                        </div>
                      ))}
                    </div>

                    {operationalMetrics && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-3">
                          <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <CloudLightning className="w-3.5 h-3.5 text-sky-400" /> Importações Sheets
                          </h5>
                          {operationalMetrics.recentImports.length === 0 ? (
                            <p className="text-[11px] text-zinc-600">Nenhuma importação ainda.</p>
                          ) : operationalMetrics.recentImports.slice(0, 4).map((imp) => (
                            <div key={imp.id} className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] text-zinc-300 font-mono">
                                  {imp.rowsImported}/{imp.rowsTotal} linhas
                                </p>
                                <p className="text-[10px] text-zinc-600">
                                  {new Date(imp.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${imp.status === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                                {imp.status === "success" ? "OK" : "ERR"}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-3">
                          <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <FolderOpen className="w-3.5 h-3.5 text-amber-400" /> Matches Drive
                          </h5>
                          {operationalMetrics.recentDriveMatches.length === 0 ? (
                            <p className="text-[11px] text-zinc-600">Nenhum match ainda.</p>
                          ) : operationalMetrics.recentDriveMatches.slice(0, 4).map((dm) => (
                            <div key={dm.id} className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] text-zinc-300 font-mono">
                                  {dm.debtorsMatched}/{dm.debtorsTotal} devedores · {dm.filesFound} PDFs
                                </p>
                                <p className="text-[10px] text-zinc-600">
                                  {new Date(dm.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${dm.status === "success" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                                {dm.status === "success" ? "OK" : "ERR"}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 space-y-3">
                          <h5 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                            <Bot className="w-3.5 h-3.5 text-emerald-400" /> Automações / Erros
                          </h5>
                          {operationalMetrics.recentAutomationRuns.length === 0 && operationalMetrics.recentErrors.length === 0 ? (
                            <p className="text-[11px] text-zinc-600">Sem atividade recente.</p>
                          ) : (
                            <>
                              {operationalMetrics.recentAutomationRuns.slice(0, 3).map((run) => (
                                <div key={run.id} className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[11px] text-zinc-300 font-mono">
                                      {run.jobsCreated} jobs criados · {run.sent} enviados
                                    </p>
                                    <p className="text-[10px] text-zinc-600">
                                      {new Date(run.startedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                    </p>
                                  </div>
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${run.status === "success" ? "bg-emerald-500/10 text-emerald-400" : run.status === "running" ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"}`}>
                                    {run.status === "success" ? "OK" : run.status.toUpperCase().slice(0, 3)}
                                  </span>
                                </div>
                              ))}
                              {operationalMetrics.recentErrors.length > 0 && (
                                <div className="pt-1 border-t border-zinc-800/60">
                                  <p className="text-[10px] text-rose-400 font-semibold mb-1">?ltimos erros:</p>
                                  {operationalMetrics.recentErrors.slice(0, 2).map((err) => (
                                    <p key={err.id} className="text-[10px] text-zinc-500 truncate">
                                      {err.clientName} ? <span className="text-rose-500">{err.status}</span>
                                    </p>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                      </div>
                    )}

                    {isLoadingMetrics && !operationalMetrics && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 h-24 animate-pulse" />
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {currentTab === "importar" && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Download className="w-4 h-4 text-emerald-400" /> Upload ou Texto de Cobrança
                        </h4>
                        <p className="text-xs text-zinc-500 font-light">
                          Cole faturas, relatórios de ERP, e-mails brutos ou selecione presets abaixo para que a inteligência artificial do Gemini extraia tudo estruturadamente.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-emerald-500/30 transition-all text-center space-y-2 relative group">
                        <div className="w-10 h-10 rounded-full bg-zinc-900/50 flex items-center justify-center text-zinc-400 mx-auto group-hover:bg-emerald-500/10 group-hover:text-emerald-400 transition-colors">
                          <FileCheck2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-zinc-300">Arraste seus relatorios PDF, TXT ou EXCEL aqui</p>
                          <p className="text-[10px] text-zinc-600">
                            {isParsingImportFile
                              ? "Lendo conteudo real do arquivo para enviar ao Gemini..."
                              : importFileName
                                ? `Arquivo carregado: ${importFileName}`
                                : "O conteudo real do arquivo tera prioridade sobre presets e textos de exemplo."}
                          </p>
                        </div>
                        <input 
                          type="file" 
                          accept=".pdf,.txt,.xlsx,.xls,.csv"
                          onChange={handleImportFileChange}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Fluxo Contábil de Entrada:</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(["vencidos", "a_vencer", "liquidado"] as const).map((cat) => (
                            <button
                              key={cat}
                              onClick={() => setImportCategory(cat)}
                              className={`py-2 rounded-xl text-xs font-bold uppercase transition-all border ${importCategory === cat ? "bg-emerald-500 text-black border-emerald-500" : "bg-zinc-950 border-zinc-850 text-zinc-400"}`}
                            >
                              {cat === "vencidos" && "Vencidos"}
                              {cat === "a_vencer" && "A vencer"}
                              {cat === "liquidado" && "Liquidação"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Inserir Presets de Simulação Rápida:</label>
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => setImportText(`Extrato de Débitos NC Ltda
1. IDERLANDIO JESUS DE OLIVEIRA - Titulo 4254-2 - Vencimento 10/05/2026 - Valor R$ 715,66 - tel 33988245204
2. MENEZES E BATISTA LTDA ME - Titulo 4240-2 - Vencimento 09/05/2026 - Valor R$ 760,20 - tel `)}
                            className="w-full text-left p-2.5 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-[11px] text-zinc-400 block truncate"
                          >
                            Preset 1: Recebiveis reais (2 linhas)
                          </button>
                          <button
                            type="button"
                            onClick={() => setImportText(`LISTA DE RECEBIVEIS REAIS
COLCHOES E CIA DE BRASILANDIA LTDA - Titulo 1243/002 - Vencimento 11/05/2026 - Valor R$ 833,20
RAMOS MOVEIS E ELETRO LTDA - Titulo 1244/002 - Vencimento 11/05/2026 - Valor R$ 6.459,60
SUPER MOVEIS DA VOVO LTDA - Titulo 4241-2 - Vencimento 09/05/2026 - Valor R$ 2.248,00
GIL MOVEIS E ELETRODOMESTICOS LTDA - Titulo F01-3 - Vencimento 14/05/2026 - Valor R$ 2.941,16`)}
                            className="w-full text-left p-2.5 rounded-lg bg-zinc-950 hover:bg-zinc-900 border border-zinc-900 text-[11px] text-zinc-400 block truncate"
                          >
                            Preset 2: Recebiveis reais (4 linhas)

                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block">Dados textuais para OCR / Extração:</label>
                        <textarea
                          rows={6}
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder="Cole as linhas financeiras cruas ou digite manualmente ex: Nome, Fatura, Telefone..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 transition-all font-mono"
                        />
                      </div>

                      {extractionAlert && (
                        <div className={`p-3 border text-xs rounded-xl flex items-start gap-2 ${
                          geminiCountdown > 0
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                        }`}>
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 space-y-1">
                            <span>{extractionAlert}</span>
                            {geminiCountdown > 0 && (
                              <div className="flex items-center gap-2 mt-1">
                                <div className="h-1 flex-1 rounded-full bg-amber-900/40 overflow-hidden">
                                  <div
                                    className="h-full bg-amber-400 transition-all duration-1000"
                                    style={{ width: `${Math.max(0, (geminiCountdown / 65) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-amber-200 font-mono font-bold tabular-nums">
                                  {geminiCountdown}s
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleAIExtract}
                        disabled={isExtracting || geminiCountdown > 0}
                        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all text-sm cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isExtracting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Extraindo Informações via IA Gemini...
                          </>
                        ) : geminiCountdown > 0 ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Aguardando cota Gemini… {geminiCountdown}s
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" /> Extrair com Inteligência Artificial
                          </>
                        )}
                      </button>

                    </div>

                    <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Dados Financeiros Extraídos Revisáveis</h4>
                        <p className="text-xs text-zinc-500 font-light">
                          Os dados abaixo foram interpretados e estruturados pela IA do Gemini. Você pode editar os campos e optar por enviá-los de forma consolidada para a Visão Geral.
                        </p>
                      </div>

                      <div className="flex-1 min-h-[300px] overflow-y-auto max-h-[420px] pr-1 space-y-4">
                        {extractedDebtors.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-zinc-850 border-dashed rounded-2xl text-zinc-500">
                            <SlidersHorizontal className="w-10 h-10 text-zinc-700 animate-pulse mb-2" />
                            <p className="text-xs font-semibold">Nenhuma informação estruturada pendente</p>
                            <p className="text-[10px] text-zinc-600 max-w-sm mt-1">Cole as faturas e clique no botão verde para ver os campos extraídos estruturados em tabela editável.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <span className="text-xs font-mono font-bold text-emerald-400 block">? {extractedDebtors.length} Registros Prontos para Revis?o:</span>
                            
                            {extractedDebtors.map((item, index) => (
                              <div key={item.id} className="p-3 bg-zinc-950 border border-zinc-850 rounded-xl space-y-2 relative group">
                                <button
                                  onClick={() => removeExtractedRow(item.id)}
                                  className="absolute top-2.5 right-2.5 text-zinc-600 hover:text-rose-400 p-1 rounded transition-colors"
                                  title="Ignorar este registro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>

                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Cliente</label>
                                    <input
                                      type="text"
                                      value={item.client}
                                      onChange={(e) => updateExtractedField(item.id, "client", e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Fornecedor / S.A</label>
                                    <input
                                      type="text"
                                      value={item.supplier}
                                      onChange={(e) => updateExtractedField(item.id, "supplier", e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-4 gap-2 text-[11px]">
                                  <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Documento</label>
                                    <input
                                      type="text"
                                      value={item.document}
                                      onChange={(e) => updateExtractedField(item.id, "document", e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white text-center focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Vencimento</label>
                                    <input
                                      type="text"
                                      value={item.dueDate}
                                      onChange={(e) => updateExtractedField(item.id, "dueDate", e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white text-center focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Valor (R$)</label>
                                    <input
                                      type="number"
                                      value={item.value}
                                      onChange={(e) => updateExtractedField(item.id, "value", Number(e.target.value))}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Celular (WhatsApp)</label>
                                    <input
                                      type="text"
                                      value={item.phone}
                                      onChange={(e) => updateExtractedField(item.id, "phone", e.target.value)}
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-zinc-900 flex items-center justify-between gap-4 flex-wrap">
                        <span className="text-zinc-500 text-xs">Aguardando consolidação do operador.</span>
                        <button
                          onClick={sendExtractedToOverview}
                          disabled={extractedDebtors.length === 0}
                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center gap-2 shadow disabled:opacity-50 transition-all text-xs cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" /> Enviar para a Visão Geral
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {currentTab === "visao_geral" && (
                <div className="space-y-8">
                  
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    <div className="lg:col-span-4 bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-md">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Percent className="w-4 h-4 text-emerald-400" /> Parâmetros de Encargos Globais
                      </h4>
                      <p className="text-xs text-zinc-500 font-light leading-relaxed">
                        Defina a multa padrão imediata e a taxa de juros aplicada por dia de atraso para todos os devedores classificados como Vencidos na visão geral.
                      </p>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Multa Geral (%)</label>
                          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-905 p-2 rounded-xl">
                            <input
                              type="number"
                              step="0.5"
                              value={globalFinePct}
                              onChange={(e) => setGlobalFinePct(Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full bg-transparent focus:outline-none focus:border-none text-sm text-center font-mono font-bold text-emerald-400"
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Juros / Dia (%)</label>
                          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-905 p-2 rounded-xl">
                            <input
                              type="number"
                              step="0.01"
                              value={globalInterestDayPct}
                              onChange={(e) => setGlobalInterestDayPct(Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full bg-transparent focus:outline-none focus:border-none text-sm text-center font-mono font-bold text-emerald-400"
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-[10px] text-zinc-500 font-light">
                        * O cálculo é feito com base em 12 dias de atraso presumidos sobre a data histórica base dos boletos em atraso.
                      </div>
                    </div>

                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-md">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-emerald-400" /> Cadastro de Representantes
                      </h4>
                      <p className="text-xs text-zinc-500 font-light leading-none">
                        Adicione assessores ou assessoria jurídica externa para cobrança dedicada.
                      </p>

                      <form onSubmit={handleAddRep} className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] text-zinc-400">Nome</label>
                            <input
                              type="text"
                              required
                              value={newRepName}
                              onChange={(e) => setNewRepName(e.target.value)}
                              placeholder="Felipe Amorim"
                              className="w-full bg-zinc-950 border border-zinc-805 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] text-zinc-400">Telefone</label>
                            <input
                              type="text"
                              value={newRepPhone}
                              onChange={(e) => setNewRepPhone(e.target.value)}
                              placeholder="5577999881111"
                              className="w-full bg-zinc-950 border border-zinc-805 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none font-mono"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[11px] text-zinc-400">Papel / Cargo</label>
                            <input
                              type="text"
                              value={newRepRole}
                              onChange={(e) => setNewRepRole(e.target.value)}
                              placeholder="Responsável Financeiro"
                              className="w-full bg-zinc-950 border border-zinc-805 rounded-xl px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                          <button
                            type="submit"
                            className="bg-emerald-500 hover:bg-emerald-400 text-black py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow flex items-center justify-center gap-1.5"
                          >
                            <PlusCircle className="w-4 h-4" /> Cadastrar Responsável
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="lg:col-span-3 bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-md flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Google Sheets
                        </h4>
                        <p className="text-[11px] text-zinc-400 font-light leading-relaxed">
                          Compartilhe a planilha com o e-mail da service account da plataforma e cole o link abaixo.
                          A planilha deve ter colunas: <span className="text-zinc-300 font-mono">nome, valor, vencimento</span> (mínimo).
                        </p>
                      </div>

                      <div className="space-y-2">
                        <input
                          type="text"
                          value={sheetUrlInput}
                          onChange={(e) => { setSheetUrlInput(e.target.value); setSheetsImportResult(null); }}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <input
                          type="text"
                          value={sheetNameInput}
                          onChange={(e) => setSheetNameInput(e.target.value)}
                          placeholder="Nome da aba (opcional ? padr?o: primeira aba)"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs text-zinc-400 focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleImportSheets}
                        disabled={isSheetsSynching || !sheetUrlInput.trim()}
                        className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSheetsSynching ? (
                          <>
                            <div className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                            Importando planilha...
                          </>
                        ) : (
                          <>
                            <CloudLightning className="w-3.5 h-3.5" /> Importar do Google Sheets
                          </>
                        )}
                      </button>

                      {sheetsImportResult && (
                        <div className={`rounded-2xl border px-4 py-3 text-xs space-y-1 ${
                          sheetsImportResult.success
                            ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200"
                            : "border-rose-500/20 bg-rose-500/8 text-rose-200"
                        }`}>
                          {sheetsImportResult.success ? (
                            <>
                              <div className="font-bold text-emerald-300">? Importa??o conclu?da</div>
                              <div>Linhas lidas: <span className="font-semibold text-white">{sheetsImportResult.rowsTotal}</span></div>
                              <div>Importadas: <span className="font-semibold text-emerald-300">{sheetsImportResult.rowsImported}</span></div>
                              {sheetsImportResult.rowsSkipped > 0 && (
                                <div>Ignoradas: <span className="font-semibold text-amber-300">{sheetsImportResult.rowsSkipped}</span></div>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="font-bold text-rose-300">? Falha na importa??o</div>
                              <div className="text-rose-200/80">{sheetsImportResult.error ?? "Erro desconhecido."}</div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-900 flex flex-wrap gap-4 items-center justify-between">
                    <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-805 flex-1 min-w-[200px] max-w-sm">
                      <Search className="w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filtrar por nome do cliente ou documento..."
                        className="w-full text-xs text-zinc-300 bg-transparent focus:outline-none font-light"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500">Fluxo:</span>
                        <select
                          value={categoryFilter}
                          onChange={(e) => setCategoryFilter(e.target.value)}
                          className="bg-zinc-950 border border-zinc-805 rounded-xl text-xs text-zinc-300 px-2.5 py-1.5"
                        >
                          <option value="all">Sinalizar Todos os Fluxos</option>
                          <option value="vencidos">Vencidos</option>
                          <option value="a_vencer">A vencer</option>
                          <option value="liquidado">Liquidado</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500">Responsável:</span>
                        <select
                          value={repFilter}
                          onChange={(e) => setRepFilter(e.target.value)}
                          className="bg-zinc-950 border border-zinc-805 rounded-xl text-xs text-zinc-300 px-2.5 py-1.5"
                        >
                          <option value="all">Ver Todos os Representantes</option>
                          {representatives.map(r => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={downloadExcelFormat}
                          className="px-4.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-100 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs text-center border border-zinc-700"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar Planilha (XLS/CSV)
                        </button>
                        
                        <button
                          onClick={clearOverviewVision}
                          className="px-4.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs text-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Limpar Visão Geral
                        </button>
                      </div>

                    </div>
                  </div>

                  {selectedDebtorIds.size > 0 && (
                    <div className="p-4 rounded-2xl bg-emerald-500/8 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-300 text-xs font-bold">
                          {selectedDebtorIds.size} devedor{selectedDebtorIds.size > 1 ? "es" : ""} selecionado{selectedDebtorIds.size > 1 ? "s" : ""}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedDebtorIds(new Set())}
                          className="text-[10px] text-zinc-500 hover:text-zinc-300 underline"
                        >
                          Limpar seleção
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {plan === "basic" && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded font-mono">
                            Plano Basic ? upgrade para Pro/Premium
                          </span>
                        )}
                        {remainingCharges === 0 && plan !== "basic" && (
                          <span className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded font-mono">
                            Limite mensal esgotado
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={handleBatchSend}
                          disabled={
                            isBatchSending ||
                            plan === "basic" ||
                            remainingCharges === 0 ||
                            !canUseApp
                          }
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          {isBatchSending ? (
                            <>
                              <div className="w-3 h-3 rounded-full border border-black border-t-transparent animate-spin" />
                              Enviando lote...
                            </>
                          ) : (
                            <>
                              <SendHorizonal className="w-3.5 h-3.5" />
                              Enviar cobranças ({selectedDebtorIds.size})
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {batchSendResult && (
                    <div className={`p-4 rounded-2xl border space-y-3 ${
                      batchSendResult.success && batchSendResult.sent > 0
                        ? "border-emerald-500/20 bg-emerald-500/8"
                        : batchSendResult.status === "plano_sem_recurso" || batchSendResult.status === "bloqueado_assinatura"
                          ? "border-amber-500/20 bg-amber-500/8"
                          : "border-rose-500/20 bg-rose-500/8"
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className={`text-xs font-bold ${
                            batchSendResult.success && batchSendResult.sent > 0
                              ? "text-emerald-300"
                              : batchSendResult.status === "plano_sem_recurso" || batchSendResult.status === "bloqueado_assinatura"
                                ? "text-amber-300"
                                : "text-rose-300"
                          }`}>
                            {batchSendResult.success
                              ? `? ${batchSendResult.dryRun ? "[Simula??o] " : ""}Lote processado ? ${batchSendResult.sent} enviados`
                              : `? ${BATCH_TOP_STATUS_LABELS[batchSendResult.status as BatchTopStatus] ?? batchSendResult.error}`
                            }
                          </div>
                          {batchSendResult.success && (
                            <div className="flex flex-wrap gap-3 text-[10px] font-mono">
                              {batchSendResult.sent > 0 && (
                                <span className="text-emerald-400">? {batchSendResult.sent} enviados</span>
                              )}
                              {batchSendResult.failed > 0 && (
                                <span className="text-rose-400">? {batchSendResult.failed} falhas</span>
                              )}
                              {batchSendResult.duplicated > 0 && (
                                <span className="text-zinc-400">? {batchSendResult.duplicated} duplicados</span>
                              )}
                              {batchSendResult.invalidPhone > 0 && (
                                <span className="text-amber-400">? {batchSendResult.invalidPhone} tel. inv?lidos</span>
                              )}
                              {batchSendResult.blockedLimit > 0 && (
                                <span className="text-zinc-500">? {batchSendResult.blockedLimit} bloqueados (limite)</span>
                              )}
                              <span className="text-zinc-600">
                                Uso: {batchSendResult.usageAfter}/{batchSendResult.usageLimit}
                              </span>
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setBatchSendResult(null)}
                          className="text-zinc-500 hover:text-zinc-300 text-xs"
                        >?</button>
                      </div>

                      {batchSendResult.results.length > 0 && (
                        <div className="max-h-[160px] overflow-y-auto space-y-1 border-t border-zinc-800 pt-2">
                          {batchSendResult.results.map((r) => (
                            <div key={r.debtorId} className="flex items-center justify-between text-[10px] font-mono gap-2">
                              <span className="truncate text-zinc-400">{r.clientName || r.debtorId.slice(0, 8)}</span>
                              <span className={`flex-shrink-0 font-bold ${
                                r.status === "sucesso"             ? "text-emerald-400" :
                                r.status === "duplicado"           ? "text-zinc-400"    :
                                r.status === "telefone_invalido"   ? "text-amber-400"   :
                                r.status === "bloqueado_limite"    ? "text-zinc-600"    :
                                "text-rose-400"
                              }`}>
                                {r.status === "sucesso"             ? "? enviado"         :
                                 r.status === "duplicado"           ? "? duplicado"       :
                                 r.status === "telefone_invalido"   ? "? tel. inv?lido"  :
                                 r.status === "bloqueado_limite"    ? "? limite"          :
                                 r.status === "devedor_nao_encontrado" ? "? n?o encontrado" :
                                 "? erro"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                      <table id="tbl-devedores" className="w-full text-xs text-left text-zinc-300">
                        <thead className="text-[10px] uppercase font-mono tracking-wider bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
                          <tr>
                            <th className="px-3 py-4 w-8">
                              <button
                                type="button"
                                title={filteredDebtors.length > 0 && filteredDebtors.every(d => selectedDebtorIds.has(d.id)) ? "Desmarcar todos" : "Selecionar todos"}
                                onClick={() => {
                                  const allSelected = filteredDebtors.every(d => selectedDebtorIds.has(d.id));
                                  setSelectedDebtorIds(
                                    allSelected
                                      ? new Set()
                                      : new Set(filteredDebtors.map(d => d.id)),
                                  );
                                  setBatchSendResult(null);
                                }}
                                className="text-zinc-500 hover:text-emerald-400 transition-colors"
                              >
                                {filteredDebtors.length > 0 && filteredDebtors.every(d => selectedDebtorIds.has(d.id))
                                  ? <CheckSquare className="w-4 h-4" />
                                  : <Square className="w-4 h-4" />
                                }
                              </button>
                            </th>
                            <th className="px-5 py-4">Cliente / Sacado</th>
                            <th className="px-4 py-4">Fornecedor</th>
                            <th className="px-4 py-4 text-center">Documento Id</th>
                            <th className="px-4 py-4 text-center">Vencimento</th>
                            <th className="px-4 py-4 text-center">Telefone (WhatsApp)</th>
                            <th className="px-4 py-4 text-right">Valor Base (R$)</th>
                            <th className="px-4 py-4 text-right bg-emerald-500/5 text-emerald-400">Total + Multa + Juros (R$)</th>
                            <th className="px-4 py-4 text-center">Tipo / Status</th>
                            <th className="px-4 py-4">Responsável Atribuído</th>
                            <th className="px-4 py-4">Observações</th>
                            <th className="px-4 py-4 text-center text-emerald-400/60">PDF</th>
                            <th className="px-5 py-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {filteredDebtors.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="px-6 py-12 text-center text-zinc-500">
                                Nenhum devedor encontrado nos parâmetros de filtros ativos.
                                Vá para o assistente de extração para importar novas faturas ou clique em "Exportar planilha" para ver amostras.
                              </td>
                            </tr>
                          ) : (
                            filteredDebtors.map((d) => {
                              const assignedRep = representatives.find(r => r.id === d.representativeId);
                              
                              return (
                                <tr key={d.id} className={`hover:bg-zinc-900/30 transition-colors ${selectedDebtorIds.has(d.id) ? "bg-emerald-500/5" : ""}`}>
                                  <td className="px-3 py-4">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setBatchSendResult(null);
                                        setSelectedDebtorIds((prev) => {
                                          const next = new Set(prev);
                                          next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                                          return next;
                                        });
                                      }}
                                      className="text-zinc-500 hover:text-emerald-400 transition-colors"
                                    >
                                      {selectedDebtorIds.has(d.id)
                                        ? <CheckSquare className="w-4 h-4 text-emerald-400" />
                                        : <Square className="w-4 h-4" />
                                      }
                                    </button>
                                  </td>
                                  <td className="px-5 py-4 font-bold text-white min-w-[150px]">
                                    <input
                                      type="text"
                                      value={d.client}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "client", e.target.value)}
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-bold text-white"
                                    />
                                  </td>
                                  <td className="px-4 py-4 font-light text-zinc-400">
                                    <input
                                      type="text"
                                      value={d.supplier}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "supplier", e.target.value)}
                                      className="w-full bg-transparent focus:bg-zinc-950 rounded p-1"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono text-zinc-400">
                                    <input
                                      type="text"
                                      value={d.document}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "document", e.target.value)}
                                      className="w-20 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono">
                                    <input
                                      type="text"
                                      value={d.dueDate}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "dueDate", e.target.value)}
                                      className="w-22 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono">
                                    <input
                                      type="text"
                                      value={d.phone || ""}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "phone", e.target.value)}
                                      placeholder="Ex: 5577999998888"
                                      className="w-32 text-center bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-mono text-xs text-zinc-300 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono">
                                    <input
                                      type="number"
                                      value={d.value}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "value", Number(e.target.value))}
                                      className="w-24 text-right bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono text-emerald-300 font-bold bg-emerald-500/5">
                                    {formatBRL(d.updatedValue || d.value)}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    <span 
                                      onClick={() => {
                                        const cats: ("vencidos"| "a_vencer" | "liquidado")[] = ["vencidos", "a_vencer", "liquidado"];
                                        const currentIdx = cats.indexOf(d.category);
                                        const nextCat = cats[(currentIdx + 1) % cats.length];
                                        updateGeneralDebtorField(d.id, "category", nextCat);
                                      }}
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase cursor-pointer select-none transition-all
                                        ${d.category === "vencidos" && "bg-rose-500/10 text-rose-400 border border-rose-500/20"}
                                        ${d.category === "a_vencer" && "bg-amber-500/10 text-amber-400 border border-amber-500/20"}
                                        ${d.category === "liquidado" && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}
                                      `}
                                    >
                                      {d.category === "vencidos" && "Vencido"}
                                      {d.category === "a_vencer" && "A vencer"}
                                      {d.category === "liquidado" && "Liquidado"}
                                    </span>
                                  </td>
                                  <td className="px-4 py-4">
                                    <select
                                      value={d.representativeId || ""}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "representativeId", e.target.value || undefined)}
                                      className="bg-zinc-950 border border-zinc-805 text-[11px] text-zinc-300 rounded px-2 py-1 max-w-[140px] truncate focus:outline-none"
                                    >
                                      <option value="">Não Atribuído</option>
                                      {representatives.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-4 py-4 min-w-[120px]">
                                    <input
                                      type="text"
                                      value={d.notes || ""}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "notes", e.target.value)}
                                      placeholder="Anotar follow-up..."
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded px-1.5 py-1"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                    {d.driveFileId ? (
                                      <a
                                        href={d.driveFileUrl ?? "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={d.driveFileName ?? "Abrir PDF"}
                                        className="inline-flex items-center justify-center w-6 h-6 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    ) : (
                                      <span className="text-zinc-700 text-[10px]">?</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-4 text-right">
                                    <div className="flex items-center justify-end gap-2 text-zinc-400">
                                      <button
                                        onClick={() => {
                                          setSelectedDebtorForMessage(d);
                                          setCurrentTab("cobranca");
                                        }}
                                        className="p-1 px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500 hover:text-black hover:font-bold text-emerald-400 transition-all font-mono text-[9px] uppercase font-bold"
                                        title="Chamar cliente no WhatsApp"
                                      >
                                        Disparar WP
                                      </button>
                                      <button
                                        onClick={() => deleteGeneralDebtor(d.id)}
                                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title="Eliminar devedor"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {currentTab === "cobranca" && (
                <div className="space-y-8">
                  
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    <div className="lg:col-span-6 bg-zinc-900/40 border border-zinc-950 p-5 rounded-3xl space-y-4 shadow-xl flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase tracking-wide">
                          Agendamento Global (Z-API)
                        </div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Clock className="w-4 h-4 text-emerald-400" /> Cobrança Automatizada
                        </h4>
                        <p className="text-xs text-zinc-500 font-light leading-relaxed">
                          Ative o robô para realizar varreduras automáticas de faturamento de acordo com a hora programada de sua preferência.
                        </p>
                      </div>

                      <div className="space-y-3.5 pt-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs text-zinc-300 font-medium">Auto-disparos Habilitado:</label>
                          <button
                            onClick={() => setZapiConfig(prev => ({...prev, autoBillingEnabled: !prev.autoBillingEnabled}))}
                            className={`w-12 h-6.5 rounded-full p-1 transition-all ${zapiConfig.autoBillingEnabled ? "bg-emerald-500 text-black" : "bg-zinc-800"}`}
                          >
                            <div className={`w-4.5 h-4.5 rounded-full bg-white transition-all transform ${zapiConfig.autoBillingEnabled ? "translate-x-5.5" : "translate-x-0"}`} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="text-xs text-zinc-300 font-medium">Horário Padrão de Envio:</label>
                          <input 
                            type="time"
                            value={zapiConfig.scheduledTime}
                            onChange={(e) => setZapiConfig(prev => ({...prev, scheduledTime: e.target.value}))}
                            className="bg-zinc-950 border border-zinc-800 p-1.5 text-xs text-center rounded text-zinc-100 font-mono focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>

                      <div className="p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 text-[10px] text-zinc-500 font-light">
                        O sistema disparará faturas para os telefones no formato amigável ou de atraso na hora estipulada via integração Z-API centralizada.
                      </div>
                    </div>

                    <div className="lg:col-span-6 bg-zinc-900/40 border border-zinc-950 p-5 rounded-3xl space-y-4 shadow-xl flex flex-col justify-between">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-emerald-400" /> Google Drive ? Localizar PDFs
                          </h4>
                          <p className="text-[11px] text-zinc-500 font-light leading-normal">
                            Localiza boletos PDF na pasta central da plataforma e associa automaticamente a cada devedor por CPF/CNPJ ou nome.
                            Disponível nos planos <span className="text-emerald-400 font-medium">Pro</span> e <span className="text-emerald-400 font-medium">Premium</span>.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={handleMatchDriveFiles}
                          disabled={isDriveMatching}
                          className="w-full py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-900 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 text-xs font-bold font-mono transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDriveMatching ? (
                            <>
                              <div className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                              Localizando PDFs...
                            </>
                          ) : (
                            <>
                              <FolderOpen className="w-3.5 h-3.5" /> Localizar PDFs no Drive
                            </>
                          )}
                        </button>

                        {driveMatchResult && (
                          <div className={`rounded-2xl border px-4 py-3 text-xs space-y-1 ${
                            driveMatchResult.success
                              ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-200"
                              : "border-rose-500/20 bg-rose-500/8 text-rose-200"
                          }`}>
                            {driveMatchResult.success ? (
                              <>
                                <div className="font-bold text-emerald-300">? PDFs localizados</div>
                                <div>Arquivos encontrados: <span className="font-semibold text-white">{driveMatchResult.filesFound}</span></div>
                                <div>Devedores associados: <span className="font-semibold text-emerald-300">{driveMatchResult.debtorsMatched}</span> / {driveMatchResult.debtorsTotal}</div>
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-rose-300">? Falha ao localizar PDFs</div>
                                <div className="text-rose-200/80">
                                  {DRIVE_STATUS_LABELS[driveMatchResult.status as DriveMatchStatus] ?? driveMatchResult.error ?? "Erro desconhecido."}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {driveMatchResult?.success && driveMatchResult.debtorsMatched > 0 && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">PDFs associados:</label>
                            <div className="h-[90px] overflow-y-auto bg-zinc-950 p-2 rounded-xl text-[10px] space-y-1 border border-zinc-900 font-mono text-zinc-400">
                              {debtors.filter((d) => d.driveFileId).map((d) => (
                                <div key={d.id} className="flex items-center justify-between hover:text-zinc-200 py-0.5 gap-2">
                                  <span className="truncate flex items-center gap-1">
                                    PDF: {d.driveFileName ?? "?"}
                                  </span>
                                  <span className={`flex-shrink-0 font-bold ${
                                    (d.driveMatchScore ?? 0) >= 0.9 ? "text-emerald-400" :
                                    (d.driveMatchScore ?? 0) >= 0.7 ? "text-amber-400" : "text-zinc-500"
                                  }`}>
                                    {Math.round((d.driveMatchScore ?? 0) * 100)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="p-2.5 rounded-lg bg-emerald-500/10 text-[10px] text-emerald-400 text-center font-bold mt-2">
                        Canal de envio WhatsApp Z-API centralizado: Conectado
                      </div>
                    </div>

                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Selecione o Devedor Alvo</h4>
                        <p className="text-xs text-zinc-500 font-light">
                          Escolha quem receberá a notificação para carregar dados e modelos nos tons adequados.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                          {debtors.map((d) => {
                            const isSelected = selectedDebtorForMessage?.id === d.id;
                            
                            return (
                              <button
                                key={d.id}
                                onClick={() => setSelectedDebtorForMessage(d)}
                                className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer block
                                  ${isSelected 
                                    ? "bg-emerald-500/10 border-emerald-500/80 shadow-[0_4px_15px_rgba(16,185,129,0.15)]" 
                                    : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                                  }
                                `}
                              >
                                <div className="space-y-1 select-none">
                                  <div className="text-xs font-pro font-black text-white">{d.client}</div>
                                  <div className="text-[10px] text-zinc-400 font-light font-mono flex items-center gap-1">
                                    <span>Doc: {d.document}</span> ? <span>{d.dueDate}</span>
                                  </div>
                                  <div className="text-[11px] font-mono text-emerald-400 font-extrabold">{formatBRL(d.updatedValue || d.value)}</div>
                                </div>

                                <div className="text-right flex flex-col items-end gap-1.5">
                                  <span className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wide font-bold font-mono
                                    ${d.category === "vencidos" && "bg-rose-500/10 text-rose-400"}
                                    ${d.category === "a_vencer" && "bg-amber-500/10 text-amber-400"}
                                    ${d.category === "liquidado" && "bg-emerald-500/10 text-emerald-400"}
                                  `}>
                                    {d.category === "vencidos" && "Vencido"}
                                    {d.category === "a_vencer" && "A vencer"}
                                    {d.category === "liquidado" && "Liquidado"}
                                  </span>
                                  
                                  {d.status === "sent" ? (
                                    <span className="text-[9px] text-emerald-400 flex items-center gap-1">
                                      ? Enviado
                                    </span>
                                  ) : (
                                    <span className="text-[9px] text-zinc-500 font-light">Pendente</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-5 shadow-xl flex flex-col justify-between">
                      {selectedDebtorForMessage ? (
                        <>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <h4 className="text-sm font-bold text-white">Editar Abordagem para: <span className="text-emerald-400">{selectedDebtorForMessage.client}</span></h4>
                                <p className="text-xs text-zinc-500">Documento: {selectedDebtorForMessage.document} | Destino WhatsApp: {selectedDebtorForMessage.phone || "(Não informado)"}</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Escolher Padrão de Abordagem para o Cliente:</label>
                            <div className="grid grid-cols-4 gap-2">
                              {(["amigavel", "neutro", "firme", "juridico"] as const).map((tone) => {
                                const isToneSelected = selectedTone === tone;
                                return (
                                  <button
                                    key={tone}
                                    onClick={() => setSelectedTone(tone)}
                                    className={`py-2 px-1 rounded-xl text-[11px] font-bold text-center capitalize transition-all border cursor-pointer
                                      ${isToneSelected 
                                        ? "bg-emerald-500 text-black border-emerald-500 hover:bg-emerald-400" 
                                        : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-white"
                                      }
                                    `}
                                  >
                                    {tone === "amigavel" && "Amigável"}
                                    {tone === "neutro" && "Neutro"}
                                    {tone === "firme" && "Firme"}
                                    {tone === "juridico" && "Jurídico"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-850 space-y-1.5 text-xs text-zinc-400">
                            <span className="text-[10px] text-zinc-500 font-mono block">Boleto PDF ? Google Drive:</span>
                            {selectedDebtorForMessage?.driveFileId ? (
                              <a
                                href={selectedDebtorForMessage.driveFileUrl ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400 font-mono text-xs flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded max-w-fit hover:text-emerald-300 transition-colors"
                              >
                                <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate max-w-[220px]">{selectedDebtorForMessage.driveFileName}</span>
                                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
                              </a>
                            ) : (
                              <span className="text-zinc-500 text-xs italic">
                                Nenhum PDF pareado ? clique em "Localizar PDFs no Drive" na aba de Cobran?a.
                              </span>
                            )}
                            <span className="text-[8px] text-zinc-600 block leading-none">A NC Finance cruza CPF/CNPJ e nome do cliente para localizar o boleto correto na pasta da plataforma.</span>
                          </div>

                          <div className="space-y-1.5 flex-1 flex flex-col">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-400 block">Esboço Final da Mensagem (Editável):</label>
                            <textarea
                              rows={10}
                              value={customMessageDraft}
                              onChange={(e) => setCustomMessageDraft(e.target.value)}
                              className="w-full bg-zinc-950 border border-zinc-850 rounded-2xl p-4 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-all font-mono leading-relaxed"
                            />
                          </div>

                          {messageFeedback && (
                            <div className={`p-3 border rounded-xl text-xs text-center font-normal ${messageFeedback.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-400"}`}>
                              {messageFeedback.text}
                            </div>
                          )}

                          <div className="pt-4 border-t border-zinc-900 flex justify-end gap-3">
                            <button
                              onClick={handleSendMessage}
                              disabled={isSendingMessage || !selectedDebtorForMessage.phone}
                              className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center gap-2 shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer text-xs uppercase"
                            >
                              {isSendingMessage ? (
                                "Disparando via Z-API..."
                              ) : (
                                <>
                                  <Send className="w-4 h-4" /> Enviar Cobrança WhatsApp
                                </>
                              )}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-zinc-500">
                          <SlidersHorizontal className="w-12 h-12 text-zinc-700 animate-pulse mb-3" />
                          <p className="font-semibold text-white">Nenhum devedor ativado do painel</p>
                          <p className="text-xs text-zinc-600 mt-1 max-w-sm">Selecione uma fatura ativa ou inadimplente na lista ao lado para desenhar e projetar a régua de cobrança perfeita.</p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {currentTab === "historico" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="bg-zinc-900/40 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex items-center gap-4">
                      <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Total de Disparos</span>
                        <span className="text-xl font-bold text-white font-mono">{billingLogs.length} ocorridos</span>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-900/40 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Clientes Contatados</span>
                        <span className="text-xl font-bold text-white font-mono">
                          {Array.from(new Set(billingLogs.map(log => log.document))).length} únicos
                        </span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/40 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex items-center gap-4">
                      <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">Faturamento Notificado</span>
                        <span className="text-xl font-bold text-emerald-400 font-mono">
                          {formatBRL(billingLogs.reduce((acc, l) => acc + l.value, 0))}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-6 shadow-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <History className="w-5 h-5 text-emerald-400" /> Histórico de Disparos WhatsApp
                        </h3>
                        <p className="text-xs text-zinc-500 font-light mt-0.5">
                          Lista completa com o status das notificações geradas manualmente ou pelo robô programado.
                        </p>
                      </div>

                      <button
                        onClick={async () => {
                          if (window.confirm("Você tem certeza de que deseja esvaziar o histórico de cobrança?")) {
                            if (!currentOwnerUserId) return;
                            const currentLogIds = billingLogs.map((log) => log.id);
                            setBillingLogs([]);
                            await Promise.all(currentLogIds.map((logId) => billingLogsService.remove(currentOwnerUserId, logId))).catch((error) => {
                              setWorkspaceError(error instanceof Error ? error.message : "Falha ao limpar historico.");
                            });
                          }
                        }}
                        className="px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-black border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium transition-all cursor-pointer flex items-center gap-1.5 self-start sm:self-center"
                      >
                        Limpar Histórico
                      </button>
                    </div>

                    <div className="border border-zinc-900 rounded-2xl bg-zinc-950 overflow-hidden">
                      {billingLogs.length === 0 ? (
                        <div className="p-12 text-center text-zinc-500 space-y-2">
                          <History className="w-10 h-10 text-zinc-800 mx-auto animate-spin" />
                          <p className="font-semibold text-white text-sm">O histórico está vazio</p>
                          <p className="text-xs text-zinc-600 max-w-xs mx-auto">Nenhum faturamento foi notificado recentemente. Quando disparar cobranças na aba de Cobrança, elas serão listadas em tempo real aqui.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-900 bg-zinc-900/30 text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
                                <th className="px-5 py-4">Data/Hora</th>
                                <th className="px-5 py-4">Cliente</th>
                                <th className="px-5 py-4 font-center">Canal / Tipo</th>
                                <th className="px-5 py-4 text-right">Valor Notificado</th>
                                <th className="px-5 py-4 text-center">Status</th>
                                <th className="px-5 py-4 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-900 text-xs text-zinc-300">
                              {billingLogs.map((log) => (
                                <React.Fragment key={log.id}>
                                  <tr className="hover:bg-zinc-900/25 transition-colors">
                                    <td className="px-5 py-4 font-mono text-zinc-500 text-[11px]">{log.dateSent}</td>
                                    <td className="px-5 py-4">
                                      <div className="font-bold text-white text-xs">{log.client}</div>
                                      <div className="text-[10px] text-zinc-500 font-mono">D: {log.document} ? T?l: {log.phone}</div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-medium font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded">
                                          WhatsApp Z-API
                                        </span>
                                        <span className={`text-[9px] uppercase font-bold font-mono px-1.5 py-0.5 rounded
                                          ${log.type === "auto" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"}
                                        `}>
                                          {log.type === "auto" ? "Robô" : "Manual"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-5 py-4 text-right font-mono text-emerald-300 font-semibold">{formatBRL(log.value)}</td>
                                    <td className="px-5 py-4 text-center">
                                      {(log.status === "sucesso" || log.status === "sent") ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          ? Sucesso
                                        </span>
                                      ) : log.status === "bloqueado_limite" ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          Limite atingido
                                        </span>
                                      ) : log.status === "bloqueado_assinatura" ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          Sem assinatura
                                        </span>
                                      ) : log.status === "duplicado" ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400 bg-zinc-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          Duplicado
                                        </span>
                                      ) : log.status === "telefone_invalido" ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          Tel. inválido
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          ? Erro
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setSelectedLogDetail(selectedLogDetail?.id === log.id ? null : log);
                                          }}
                                          className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all text-[11px] font-semibold border border-zinc-805"
                                        >
                                          {selectedLogDetail?.id === log.id ? "Ocultar" : "Ver Mensagem"}
                                        </button>
                                        <button
                                          onClick={() => {
                                            const originalDebtor = debtors.find(d => d.document === log.document) || debtors[0];
                                            if (originalDebtor) {
                                              setSelectedDebtorForMessage(originalDebtor);
                                              setCurrentTab("cobranca");
                                            }
                                          }}
                                          className="px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold transition-all text-[11px]"
                                          title="Reenviar disparo ou ajustar mensagens"
                                        >
                                          Reenviar
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  {selectedLogDetail?.id === log.id && (
                                    <tr className="bg-zinc-950/50">
                                      <td colSpan={6} className="px-6 py-4 border-t border-zinc-900">
                                        <div className="space-y-2 text-left">
                                          <div className="flex items-center justify-between text-[11px]">
                                            <span className="font-bold text-zinc-400">Conteúdo do Disparo (Tom: <span className="text-emerald-400 capitalize font-mono font-bold">{log.tone}</span>)</span>
                                            <button 
                                              onClick={() => {
                                                navigator.clipboard.writeText(log.message);
                                                alert("Mensagem copiada para a área de transferência!");
                                              }}
                                              className="text-emerald-400 hover:underline cursor-pointer text-[10px]"
                                            >
                                              Copiar Mensagem Como Texto
                                            </button>
                                          </div>
                                          <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                                            {log.message}
                                          </pre>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {currentTab === "automacoes" && (
                <div className="space-y-6">

                  {plan === "basic" && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex items-start gap-4">
                      <Bot className="w-8 h-8 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-amber-300 text-sm">Automação indisponível no plano Basic</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Faça upgrade para o plano <span className="text-emerald-400 font-semibold">Pro</span> ou{" "}
                          <span className="text-purple-400 font-semibold">Premium</span> para criar regras de disparo
                          automático. Pro permite regras simples; Premium desbloqueia janela de envio, limite diário e
                          prioridade na fila.
                        </p>
                        <button
                          onClick={() => void handleOpenBillingPortal()}
                          className="mt-3 px-4 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all cursor-pointer"
                        >
                          Fazer upgrade agora
                        </button>
                      </div>
                    </div>
                  )}

                  {automationError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-200 flex items-center justify-between gap-3">
                      <span>{automationError}</span>
                      <button onClick={() => setAutomationError("")} className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer">?</button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Bot className="w-5 h-5 text-emerald-400" /> Regras de Automação
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        O scheduler roda diariamente às 08h UTC e cria jobs na fila. O worker processa a cada 5 min.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void loadAutomationData()}
                        disabled={isLoadingAutomation}
                        className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAutomation ? "animate-spin" : ""}`} />
                        Atualizar
                      </button>
                      {plan !== "basic" && (
                        <button
                          onClick={() => setShowCreateRuleForm((v) => !v)}
                          className="px-3.5 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Nova Regra
                        </button>
                      )}
                    </div>
                  </div>

                  {showCreateRuleForm && plan !== "basic" && (
                    <form
                      onSubmit={(e) => void handleCreateRule(e)}
                      className="bg-zinc-900/60 border border-emerald-500/20 rounded-2xl p-5 space-y-4 shadow-xl"
                    >
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <CalendarClock className="w-4 h-4 text-emerald-400" /> Nova Regra de Automação
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">Nome da Regra *</label>
                          <input
                            type="text"
                            required
                            value={newRuleForm.name ?? ""}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Ex: Cobrar vencidos todo dia"
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">Tipo de Regra *</label>
                          <select
                            value={newRuleForm.ruleType ?? "overdue"}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, ruleType: e.target.value as AutomationRuleCreate["ruleType"] }))}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="overdue">Vencidos</option>
                            <option value="due_today">Vencem hoje</option>
                            <option value="due_in_days">Vencem em X dias</option>
                          </select>
                        </div>

                        {newRuleForm.ruleType === "due_in_days" && (
                          <div>
                            <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">Dias antes do vencimento</label>
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={newRuleForm.daysBefore ?? 3}
                              onChange={(e) => setNewRuleForm((p) => ({ ...p, daysBefore: Number(e.target.value) }))}
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        )}

                        <div>
                          <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">Tom da Mensagem</label>
                          <select
                            value={newRuleForm.messageTone ?? "neutro"}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, messageTone: e.target.value as AutomationRuleCreate["messageTone"] }))}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="amigavel">Amigável</option>
                            <option value="neutro">Neutro</option>
                            <option value="firme">Firme</option>
                            <option value="juridico">Jurídico</option>
                          </select>
                        </div>

                        {plan === "premium" && (
                          <>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">
                                Janela de Envio ? In?cio <span className="text-purple-400">(Premium)</span>
                              </label>
                              <input
                                type="time"
                                value={newRuleForm.sendWindowStart ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, sendWindowStart: e.target.value || null }))}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">
                                Janela de Envio ? Fim <span className="text-purple-400">(Premium)</span>
                              </label>
                              <input
                                type="time"
                                value={newRuleForm.sendWindowEnd ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, sendWindowEnd: e.target.value || null }))}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">
                                Máx. envios/dia <span className="text-purple-400">(Premium)</span>
                              </label>
                              <input
                                type="number"
                                min={1}
                                max={500}
                                placeholder="Sem limite"
                                value={newRuleForm.maxDailySends ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, maxDailySends: e.target.value ? Number(e.target.value) : null }))}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 placeholder-zinc-600"
                              />
                            </div>
                          </>
                        )}

                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-1 uppercase tracking-wider">
                            Mensagem Personalizada <span className="text-zinc-600">(opcional ? usa template do tom se vazio)</span>
                          </label>
                          <textarea
                            rows={3}
                            value={newRuleForm.customMessage ?? ""}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, customMessage: e.target.value || null }))}
                            placeholder="Olá {nome_cliente}, ..."
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 resize-none"
                          />
                        </div>
                      </div>

                      <div className="flex gap-3 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setShowCreateRuleForm(false)}
                          className="px-4 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all cursor-pointer"
                        >
                          Criar Regra
                        </button>
                      </div>
                    </form>
                  )}

                  {isLoadingAutomation ? (
                    <div className="py-10 text-center text-zinc-500 flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando regras...
                    </div>
                  ) : automationRules.length === 0 ? (
                    <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-10 text-center space-y-2">
                      <Bot className="w-10 h-10 text-zinc-700 mx-auto" />
                      <p className="text-sm font-semibold text-white">Nenhuma regra configurada</p>
                      <p className="text-xs text-zinc-600 max-w-sm mx-auto">
                        Crie uma regra para que o sistema dispare cobranças automaticamente todos os dias.
                        Requer plano Pro ou Premium.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {automationRules.map((rule) => (
                        <div
                          key={rule.id}
                          className={`bg-zinc-900/50 border rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all ${
                            rule.enabled ? "border-emerald-500/20" : "border-zinc-800"
                          }`}
                        >
                          <button
                            onClick={() => void handleToggleRule(rule.id, !rule.enabled)}
                            title={rule.enabled ? "Desativar regra" : "Ativar regra"}
                            className="flex-shrink-0 cursor-pointer"
                          >
                            {rule.enabled
                              ? <ToggleRight className="w-7 h-7 text-emerald-400" />
                              : <ToggleLeft className="w-7 h-7 text-zinc-600" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white text-sm truncate">{rule.name}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                                rule.enabled
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-500"
                              }`}>
                                {rule.enabled ? "ATIVA" : "PAUSADA"}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                                {RULE_TYPE_LABELS[rule.ruleType]}
                                {rule.ruleType === "due_in_days" && rule.daysBefore != null && ` (${rule.daysBefore}d)`}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 capitalize">
                                {rule.messageTone}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 mt-1.5 text-[11px] text-zinc-500 font-mono">
                              {rule.sendWindowStart && rule.sendWindowEnd && (
                                <span>Janela: {rule.sendWindowStart}?{rule.sendWindowEnd}</span>
                              )}
                              {rule.maxDailySends != null && (
                                <span>Limite: m?x {rule.maxDailySends}/dia</span>
                              )}
                              {rule.lastRunAt && (
                                <span>?ltimo run: {new Date(rule.lastRunAt).toLocaleString("pt-BR")}</span>
                              )}
                              {rule.nextRunAt && (
                                <span>Próximo: {new Date(rule.nextRunAt).toLocaleString("pt-BR")}</span>
                              )}
                            </div>
                          </div>

                          <button
                            onClick={() => void handleDeleteRule(rule.id)}
                            title="Excluir regra"
                            className="flex-shrink-0 p-2 rounded-xl text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {automationRuns.length > 0 && (
                    <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-6 space-y-4 shadow-xl">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <History className="w-4 h-4 text-emerald-400" /> ?ltimas execu??es do Scheduler
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
                              <th className="px-4 py-3">Iniciado em</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Candidatos</th>
                              <th className="px-4 py-3 text-right">Jobs criados</th>
                              <th className="px-4 py-3 text-right">Pulados</th>
                              <th className="px-4 py-3 text-right">Enviados</th>
                              <th className="px-4 py-3 text-right">Falhas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                            {automationRuns.map((run) => (
                              <tr key={run.id} className="hover:bg-zinc-900/25 transition-colors">
                                <td className="px-4 py-3 font-mono text-zinc-500 text-[11px]">
                                  {new Date(run.startedAt).toLocaleString("pt-BR")}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${
                                    run.status === "success"
                                      ? "bg-emerald-500/10 text-emerald-400"
                                      : run.status === "running"
                                      ? "bg-amber-500/10 text-amber-400"
                                      : "bg-rose-500/10 text-rose-400"
                                  }`}>
                                    {run.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono">{run.totalCandidates}</td>
                                <td className="px-4 py-3 text-right font-mono">{run.jobsCreated}</td>
                                <td className="px-4 py-3 text-right font-mono text-zinc-500">{run.jobsSkipped}</td>
                                <td className="px-4 py-3 text-right font-mono text-emerald-400">{run.sent}</td>
                                <td className="px-4 py-3 text-right font-mono text-rose-400">{run.failed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="bg-zinc-900/30 border border-zinc-800/60 rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4 text-zinc-500" /> Configuração do pg_cron (feita uma única vez)
                    </h4>
                    <ol className="text-xs text-zinc-500 space-y-1.5 list-decimal list-inside">
                      <li>Habilite <span className="text-zinc-300 font-mono">pg_cron</span> e <span className="text-zinc-300 font-mono">pg_net</span> no Supabase Dashboard ? Database ? Extensions.</li>
                      <li>Configure o secret: <span className="text-zinc-300 font-mono">npx supabase secrets set AUTOMATION_CRON_SECRET=&lt;segredo&gt; --project-ref &lt;ref&gt;</span></li>
                      <li>Faça deploy das Edge Functions: <span className="text-zinc-300 font-mono">npx supabase functions deploy run-automation-scheduler process-dispatch-jobs</span></li>
                      <li>Rode os comandos <span className="text-zinc-300 font-mono">SELECT cron.schedule(...)</span> documentados na migration <span className="text-zinc-300 font-mono">20260521020000_automation.sql</span>.</li>
                    </ol>
                  </div>

                </div>
              )}

            </div>

            <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-zinc-600 text-[10px] text-center">
              <span>NC Finance Admin Desk v1.1.0 • Conexão com Google Cloud Run & Gemini API ativa e criptografada • {new Date().getFullYear()} NC Finance.</span>
            </footer>

          </main>
        </>
      )}
    </div>
  );
}











