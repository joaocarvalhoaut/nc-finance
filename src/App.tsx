import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import Sidebar from "./components/Sidebar";
import LandingPage from "./components/LandingPage";
import SubscriptionGate from "./components/SubscriptionGate";
import SubscriptionStatusCard from "./components/SubscriptionStatusCard";
import ClientDashboard from "./components/ClientDashboard";
import { PLAN_LIST } from "./config/plans";
import { useAccount } from "./hooks/useAccount";
import { useSubscription } from "./hooks/useSubscription";
import { billingLogsService } from "./services/billingLogsService";
import { financeService } from "./services/financeService";
import { representativesService } from "./services/representativesService";
import { contactsService, contactKeyFromName, type Contact } from "./services/contactsService";
import { subscriptionService } from "./services/subscriptionService";
import { userConfigService } from "./services/userConfigService";
import { whatsappService, SEND_STATUS_LABELS, type SendChargeStatus } from "./services/whatsappService";
import { googleSheetsService, type ImportResult as SheetsImportResult, type ExportResult as SheetsExportResult } from "./services/googleSheetsService";
import { googleDriveService, DRIVE_STATUS_LABELS, type DriveMatchResult, type DriveMatchStatus } from "./services/googleDriveService";
import { driveFolderService, type DriveFolderStatus } from "./services/driveMatching/driveFolderService";
import { whatsappBatchService, BATCH_TOP_STATUS_LABELS, type BatchChargeResult, type BatchTopStatus } from "./services/whatsappBatchService";
import { automationService, RULE_TYPE_LABELS, JOB_STATUS_COLORS, type AutomationRule, type AutomationRun, type AutomationRuleCreate } from "./services/automationService";
import { isBrazilHoliday, getBrazilHolidayName, isBusinessDay } from "./utils/brazilHolidays";
import { getMessageTemplate } from "./utils/messageTemplates";
import { metricsService, type OperationalMetrics } from "./services/metricsService";
import { parseImportFile } from "./utils/importFileParser";
import { extractDocumentLocally, type LocalExtractionResult } from "./services/localDocumentExtraction";
import { exportRelatorio } from "./services/exportRelatorio";
import Suporte from "./components/Suporte";
import { 
  Debtor, 
  Representative, 
  BillingLog,
  PlanId,
  UserConfig,

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
  Upload,
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
  CalendarClock,
  X,
  Copy,
  Pencil,
  HandCoins,
  MessageSquare,
  Eye,
  ChevronDown,
  UserCheck,
  HardDrive
} from "lucide-react";

// Default Pattern message templates following user specification
const DEFAULT_PATTERNS: PatternMessage[] = [
  {
    id: "amigavel",
    name: "Amigável (Preventivo)",
    description: "Abordagem leve para alertar antes do vencimento.",
    template: `Olá {nome_cliente}, tudo bem?
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

// (dados de demonstração removidos — workspace inicia vazio em produção)

const DEFAULT_USER_CONFIG = {
  globalFinePct: 2.0,
  globalInterestDayPct: 0.33,
  selectedTone: "amigavel" as MessageTone,
  sheetUrlInput: "",
};

// (Gemini extraction API types removed — pipeline is now fully local)

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
  const [showSuporte, setShowSuporte] = useState(false);
  const [subscriptionGateError, setSubscriptionGateError] = useState("");

  // Temporary seed data is now persisted by user_id on first authenticated access.
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [representatives, setRepresentatives] = useState<Representative[]>([]);
  // Cadastro de contatos (telefone/dados já preenchidos) por cliente normalizado
  const [contactsByKey, setContactsByKey] = useState<Map<string, Contact>>(new Map());

  const [isWorkspaceLoading, setIsWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [patternTemplates, setPatternTemplates] = useState<PatternMessage[]>(DEFAULT_PATTERNS);

  // Extraction screen properties
  const [importText, setImportText] = useState<string>("");
  const [importCategory, setImportCategory] = useState<"vencidos" | "a_vencer" | "liquidado">("vencidos");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedDebtors, setExtractedDebtors] = useState<Debtor[]>([]);
  const [extractedSelectedIds, setExtractedSelectedIds] = useState<Set<string>>(new Set());
  const [lowConfidenceIds, setLowConfidenceIds] = useState<Set<string>>(new Set());
  const [flashedLowConfId, setFlashedLowConfId] = useState<string | null>(null);
  const lowConfCursorRef = React.useRef(0);
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const tableDragRef = React.useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const [extractionAlert, setExtractionAlert] = useState<string>("");
  const [dupDocModal, setDupDocModal] = useState<{ pending: typeof extractedDebtors; dupes: { doc: string; count: number }[] } | null>(null);
  const [notesPopover, setNotesPopover] = useState<{ debtorId: string; draft: string } | null>(null);
  const [isParsingImportFile, setIsParsingImportFile] = useState<boolean>(false);
  // Original File object — needed for OCR fallback on scanned PDFs
  const [importFile, setImportFile] = useState<File | null>(null);
  // Last extraction result — used for post-import summary UI
  const [lastExtractionResult, setLastExtractionResult] = useState<LocalExtractionResult | null>(null);
  const [importFileName, setImportFileName] = useState<string>("");

  // Representative management form values
  const [newRepName, setNewRepName] = useState("");
  const [newRepPhone, setNewRepPhone] = useState("");
  const [newRepRole, setNewRepRole] = useState("Representante");

  // Global fine/interest controllers in Overview Panel
  const [globalFinePct, setGlobalFinePct] = useState<number>(DEFAULT_USER_CONFIG.globalFinePct);
  const [globalFinePctStr, setGlobalFinePctStr] = useState<string>(String(DEFAULT_USER_CONFIG.globalFinePct));
  const [globalInterestDayPct, setGlobalInterestDayPct] = useState<number>(DEFAULT_USER_CONFIG.globalInterestDayPct);
  const [globalInterestDayPctStr, setGlobalInterestDayPctStr] = useState<string>(String(DEFAULT_USER_CONFIG.globalInterestDayPct));

  // Pendência Crítica controls
  const [criticalDays, setCriticalDays] = useState<number>(30);
  const [criticalDaysStr, setCriticalDaysStr] = useState<string>("30");
  const [criticalWithInterest, setCriticalWithInterest] = useState<boolean>(true);

  // Sheets and Drive properties
  const [sheetUrlInput, setSheetUrlInput] = useState<string>(DEFAULT_USER_CONFIG.sheetUrlInput);
  const [sheetNameInput, setSheetNameInput] = useState<string>("");
  const [isSheetsSynching, setIsSheetsSynching] = useState<boolean>(false);
  // Sheets export (Visão Geral → Sheets)
  const [isExportingSheets, setIsExportingSheets] = useState<boolean>(false);
  const [sheetsExportResult, setSheetsExportResult] = useState<SheetsExportResult | null>(null);
  const [showExportSheetsModal, setShowExportSheetsModal] = useState<boolean>(false);
  const [exportSheetUrl, setExportSheetUrl] = useState<string>("");
  const [exportSheetName, setExportSheetName] = useState<string>("Visão Geral");
  const [sheetsImportResult, setSheetsImportResult] = useState<SheetsImportResult | null>(null);
  const [isDriveMatching, setIsDriveMatching] = useState<boolean>(false);
  const [driveMatchResult, setDriveMatchResult] = useState<DriveMatchResult | null>(null);
  // Boleto Drive: importação por devedor (estado de loading) e mensagens
  const [importingBoletoId, setImportingBoletoId] = useState<string | null>(null);
  const [driveBoletoMsg, setDriveBoletoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Edição da pasta do Drive (trocar URL de uma pasta já configurada)
  const [editingDriveFolder, setEditingDriveFolder] = useState<boolean>(false);
  const [isDriveSyncing, setIsDriveSyncing] = useState<boolean>(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string>("");
  const [isDriveSaving, setIsDriveSaving] = useState<boolean>(false);
  const [driveSaveMsg, setDriveSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [driveFolderStatus, setDriveFolderStatus] = useState<DriveFolderStatus | null>(null);


  // Inline phone editing in Cobrança tab
  const [editingPhoneDebtorId, setEditingPhoneDebtorId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<string>("");
  // Inline value editing — tracks which row's Valor Base is being typed
  const [editingValueDebtorId, setEditingValueDebtorId] = useState<string | null>(null);

  // PDF attachment in Cobrança tab
  const [uploadingPdfDebtorId, setUploadingPdfDebtorId] = useState<string | null>(null);

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
    customMessage: getMessageTemplate("neutro"),
    sendWindowStart: null,
    sendWindowEnd: null,
    maxDailySends: null,
  });

  // Operational metrics state (dashboard)
  const [operationalMetrics, setOperationalMetrics] = useState<OperationalMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(false);

  // Filters state in Overview Tab
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [sortNameOrder, setSortNameOrder] = useState<"none" | "asc" | "desc">("asc");
  const [sortDateOrder, setSortDateOrder] = useState<"none" | "asc" | "desc">("none");
  const [sortBankOrder, setSortBankOrder] = useState<"none" | "asc" | "desc">("none");
  const [sortValueOrder, setSortValueOrder] = useState<"none" | "asc" | "desc">("none");

  // Representatives modal
  const [showRepModal, setShowRepModal] = useState(false);
  const [expandedRepId, setExpandedRepId] = useState<string | null>(null);
  const [repModalForm, setRepModalForm] = useState({ name: "", phone: "", role: "", color: "bg-emerald-500" });
  const [isSavingRep, setIsSavingRep] = useState(false);
  const [repModalError, setRepModalError] = useState("");

  // Add debtor manually modal
  const [showAddDebtorModal, setShowAddDebtorModal] = useState(false);
  const [addDebtorSaving, setAddDebtorSaving] = useState(false);
  const [addDebtorError, setAddDebtorError] = useState("");
  const [addDebtorForm, setAddDebtorForm] = useState({
    client:   "",
    supplier: "",
    document: "",
    dueDate:  "",
    value:    "",
    phone:    "",
    category: "vencidos" as "vencidos" | "a_vencer" | "liquidado",
  });

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
      setCurrentTab("cobrar");
    }
  }, [currentTab, isLoggedIn]);

  const handleSignIn = async ({ email, password }: { email: string; password: string }) => {
    setIsAuthenticating(true);
    try {
      await signIn({ email, password });
      setCurrentTab("cobrar");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignUp = async ({ name, email, password, cpf, phone, cep, address, city, state }: { name: string; email: string; password: string; cpf: string; phone: string; cep: string; address: string; city: string; state: string }) => {
    setIsAuthenticating(true);
    try {
      const authResult = await signUp({ name, email, password, cpf, phone, cep, address, city, state });
      const needsEmailConfirmation = !authResult.session;

      if (!needsEmailConfirmation) {
        setCurrentTab("cobrar");
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
        const [records, reps, logs, config, templates, contacts] = await Promise.all([
          financeService.listByUser(currentOwnerUserId),
          representativesService.listByUser(currentOwnerUserId),
          billingLogsService.listByUser(currentOwnerUserId),
          userConfigService.getConfig(currentOwnerUserId),
          userConfigService.listMessageTemplates(currentOwnerUserId),
          contactsService.listByUser(currentOwnerUserId).catch(() => [] as Contact[])
        ]);

        // Workspace inicia vazio — sem dados demo em produção
        const hydratedRecords = records;
        const hydratedRepresentatives = reps;
        const hydratedLogs = logs;
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
            plan: "basic",   // plano válido — "starter" não existe em PLAN_LIMITS
            usageCounters: { imports: 0, charges: 0 },
            whatsappStatus: "not_configured",
            integrationProvider: null,
            lastConnectionCheck: null
          }));
        const hydratedTemplates = templates.length
          ? templates
          : await userConfigService.replaceMessageTemplates(currentOwnerUserId, DEFAULT_PATTERNS);

        if (!isMounted) return;

        setDebtors(hydratedRecords);
        setRepresentatives(hydratedRepresentatives);
        setContactsByKey(new Map(contacts.map((c) => [c.contactKey, c])));
        setBillingLogs(hydratedLogs);
        setGlobalFinePct(hydratedConfig.globalFinePct);
        setGlobalFinePctStr(String(hydratedConfig.globalFinePct));
        setGlobalInterestDayPct(hydratedConfig.globalInterestDayPct);
        setGlobalInterestDayPctStr(String(hydratedConfig.globalInterestDayPct));
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
        console.error('[workspace]', message);
      } finally {
        if (isMounted) {
          setIsWorkspaceLoading(false);
        }
      }
    };

    bootstrapWorkspace().catch((error) => {
      if (!isMounted) return;
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha inesperada ao carregar workspace.');
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
          const message = error instanceof Error ? error.message : "Falha ao salvar configurações.";
          console.error('[workspace]', message);
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

  // Assinatura dos campos que afetam o cálculo de encargos (valor, vencimento,
  // categoria). Recalcular quando ela muda corrige o bug de encargos
  // desatualizados ao editar valor/vencimento inline (sem mudar a quantidade).
  const debtorCalcSignature = debtors
    .map((d) => `${d.id}|${d.value}|${d.dueDate}|${d.category}`)
    .join(";");

  // Update calculated values when debtors or global parameters change
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updated = debtors.map(d => {
      // Liquidado: mantém valor original sem encargos
      if (d.category === "liquidado") {
        return { ...d, interestApplied: 0, fineApplied: 0, updatedValue: d.value };
      }

      // A vencer: sem encargos ainda
      if (d.category === "a_vencer") {
        return { ...d, interestApplied: 0, fineApplied: 0, updatedValue: d.value };
      }

      // Vencido: calcula dias reais de atraso a partir do vencimento
      let delayDays = 0;
      if (d.dueDate) {
        // dueDate está em DD/MM/YYYY
        const parts = d.dueDate.split("/");
        if (parts.length === 3) {
          const due = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          due.setHours(0, 0, 0, 0);
          const diff = today.getTime() - due.getTime();
          delayDays = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        }
      }

      const multaValue  = d.value * (globalFinePct / 100);
      const jurosValue  = d.value * (globalInterestDayPct / 100) * delayDays;
      const finalValue  = Math.round((d.value + multaValue + jurosValue) * 100) / 100;

      return {
        ...d,
        interestApplied: globalInterestDayPct,
        fineApplied: globalFinePct,
        updatedValue: finalValue,
      };
    });

    // Evita loop infinito — só atualiza se houver diferença real
    const hasChanged = JSON.stringify(updated.map(u => u.updatedValue)) !== JSON.stringify(debtors.map(u => u.updatedValue));
    if (hasChanged) {
      setDebtors(updated);
    }
  // A assinatura re-executa o cálculo sempre que valor/vencimento/categoria de
  // qualquer título muda (e na carga inicial). O guard hasChanged impede loop.
  }, [globalFinePct, globalInterestDayPct, debtorCalcSignature]);

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

  // Anexar (importar) o boleto sugerido do Drive para o sistema
  const handleAttachDriveBoleto = async (debtorId: string) => {
    setImportingBoletoId(debtorId);
    setDriveBoletoMsg(null);
    try {
      const result = await googleDriveService.importBoleto(debtorId);
      if (result.success) {
        setDebtors(prev => prev.map(d =>
          d.id === debtorId
            ? { ...d, driveFileId: "uploaded", driveFileName: result.fileName, driveFileUrl: result.fileUrl }
            : d
        ));
        setDriveBoletoMsg({ ok: true, text: `Boleto "${result.fileName ?? "PDF"}" anexado ao cliente.` });
      } else {
        setDriveBoletoMsg({ ok: false, text: result.error ?? "Falha ao importar o boleto." });
      }
    } finally {
      setImportingBoletoId(null);
    }
  };

  // Ignorar a sugestão de boleto do Drive (limpa os campos drive_*)
  const handleIgnoreDriveBoleto = async (debtorId: string) => {
    setDebtors(prev => prev.map(d =>
      d.id === debtorId
        ? { ...d, driveFileId: null, driveFileName: null, driveFileUrl: null, driveMatchScore: null }
        : d
    ));
    if (!currentOwnerUserId) return;
    try {
      await financeService.updatePdfAttachment(currentOwnerUserId, debtorId, null);
    } catch {
      // non-critical — estado local já atualizado
    }
  };

  // Acompanha o progresso da indexação em background, fazendo polling do status
  // até o servidor terminar de ler o conteúdo de todos os PDFs.
  const pollDriveIndexingProgress = async () => {
    for (let i = 0; i < 120; i++) { // ~6 min de teto; o background segue mesmo após
      const status = await driveFolderService.getStatus();
      setDriveFolderStatus(status);
      if (!status.indexing) {
        setDriveSaveMsg({
          ok: true,
          text: `Indexação concluída: ${status.contentIndexed ?? status.fileCount} de ${status.fileCount} boleto(s) lidos. Clique em "Buscar boletos no Drive" para casar com os devedores.`,
        });
        return;
      }
      setDriveSaveMsg({
        ok: true,
        text: `Indexando em segundo plano: ${status.contentIndexed ?? 0} de ${status.fileCount} boleto(s) lidos…`,
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
  };

  // Salvar pasta do Google Drive — indexa o 1º lote e segue em background
  const handleSaveDriveFolder = async () => {
    if (!driveFolderUrl.trim()) return;
    setIsDriveSaving(true);
    setDriveSaveMsg(null);
    try {
      const result = await driveFolderService.saveFolder(driveFolderUrl.trim());
      if (!result.success) {
        setDriveSaveMsg({ ok: false, text: result.message || result.error || "Falha ao salvar pasta." });
        return;
      }
      setDriveFolderUrl("");
      setEditingDriveFolder(false);
      setDriveSaveMsg({ ok: true, text: `Pasta "${result.folderName ?? "Drive"}" conectada. Indexando boletos em segundo plano…` });
      const status = await driveFolderService.getStatus();
      setDriveFolderStatus(status);
      setIsDriveSyncing(true);
      try {
        if (status.indexing) await pollDriveIndexingProgress();
        else setDriveSaveMsg({ ok: true, text: `Pasta "${result.folderName ?? "Drive"}" conectada e indexada (${status.fileCount} boleto(s)).` });
      } finally {
        setIsDriveSyncing(false);
      }
    } finally {
      setIsDriveSaving(false);
    }
  };

  // Reindexar a pasta — dispara o ciclo de indexação e acompanha o progresso
  const handleSyncDriveFolder = async () => {
    setIsDriveSyncing(true);
    try {
      const r = await driveFolderService.syncFolder();
      const status = await driveFolderService.getStatus();
      setDriveFolderStatus(status);

      if (!r.success && !(status?.configured && status.fileCount > 0)) {
        setDriveSaveMsg({ ok: false, text: r.error || "Falha ao indexar a pasta." });
        return;
      }
      if (status.indexing) {
        await pollDriveIndexingProgress();
      } else {
        setDriveSaveMsg({
          ok: true,
          text: `Indexação concluída: ${status.contentIndexed ?? status.fileCount} de ${status.fileCount} boleto(s) lidos. Clique em "Buscar boletos no Drive" para casar com os devedores.`,
        });
      }
    } finally {
      setIsDriveSyncing(false);
    }
  };

  const loadDriveFolderStatus = async () => {
    const status = await driveFolderService.getStatus();
    setDriveFolderStatus(status);
  };


  // Envio em lote de cobranças — liquidados são bloqueados
  const handleBatchSend = async () => {
    if (selectedDebtorIds.size === 0 || isBatchSending) return;

    // Nunca envia cobranças para títulos liquidados
    const cobráveis: string[] = Array.from(selectedDebtorIds).filter((id): id is string => {
      const d = debtors.find(x => x.id === id);
      return Boolean(d && d.category !== "liquidado");
    });

    if (cobráveis.length === 0) {
      // Todos selecionados são liquidados — avisa e cancela
      console.error('[workspace]', 'Os registros selecionados estão marcados como liquidados. Cobranças não foram enviadas.');
      return;
    }

    setIsBatchSending(true);
    setBatchSendResult(null);
    try {
      const result = await whatsappBatchService.sendBatchCharges({
        debtorIds: cobráveis,
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
    if ((currentTab === "automacoes" || currentTab === "dashboard") && isLoggedIn && automationRules.length === 0 && !isLoadingAutomation) {
      void loadAutomationData();
    }
  }, [currentTab, isLoggedIn]);

  useEffect(() => {
    if (currentTab === "cobranca" && isLoggedIn && !driveFolderStatus) {
      void loadDriveFolderStatus();
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
        scheduleMode: newRuleForm.scheduleMode ?? "daily",
        skipHolidays: newRuleForm.skipHolidays ?? false,
      });
      setAutomationRules((prev) => [...prev, created]);
      setShowCreateRuleForm(false);
      setNewRuleForm({ name: "", ruleType: "overdue", daysBefore: 3, messageTone: "neutro", customMessage: getMessageTemplate("neutro") });
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
    setImportFile(file); // store for OCR fallback

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

  // ── Local extraction pipeline (free, no API key required) ────────────────
  const handleAIExtract = async () => {
    if (!importText.trim()) {
      setExtractionAlert(
        "Escreva, cole ou carregue um arquivo com informações reais de cobrança antes de prosseguir.",
      );
      return;
    }

    setIsExtracting(true);
    setExtractionAlert("");
    setLastExtractionResult(null);

    try {
      // ── Primary path: local deterministic extraction ──────────────────────
      const result = await extractDocumentLocally(
        importText,
        importCategory,
        importFile ?? undefined,
      );

      setLastExtractionResult(result);

      if (result.records.length > 0) {
        const ts = Date.now();
        const parsedList = result.records.map((item, index) => ({
          id: `ext-${ts}-${index}`,
          client: item.client,
          bank: item.bank,
          supplier: item.supplier,
          document: item.document,
          dueDate: item.dueDate,
          value: item.value,
          phone: item.phone,
          category: importCategory,
          status: "pending" as const,
        }));

        // Marcar IDs com confiança abaixo de 75%
        const lowIds = new Set(
          result.records
            .map((item, index) => item.confidenceScore < 75 ? `ext-${ts}-${index}` : null)
            .filter(Boolean) as string[]
        );
        setLowConfidenceIds(lowIds);
        setExtractedDebtors(parsedList);

        if (result.warnings.length > 0) {
          setExtractionAlert(result.warnings.join(" "));
        }

        console.log(
          JSON.stringify({
            source: "local.extract.success",
            records: parsedList.length,
            method: result.method,
            low_confidence: result.lowConfidenceCount,
          }),
        );
        return;
      }

      // ── Nothing found locally ─────────────────────────────────────────────
      const warningMsg =
        result.warnings.length > 0
          ? result.warnings.join(" ")
          : "Nenhum registro financeiro válido foi encontrado no texto. " +
            "Verifique se o arquivo contém campos de cliente, vencimento e valor. " +
            `(Método: ${result.method}, candidatos: ${result.totalCandidates})`;

      setExtractedDebtors([]);
      setExtractionAlert(warningMsg);

    } catch (err) {
      console.error(
        JSON.stringify({
          source: "local.extract.error",
          message: err instanceof Error ? err.message : "desconhecido",
        }),
      );
      setExtractedDebtors([]);
      setExtractionAlert(
        err instanceof Error
          ? err.message
          : "Falha ao processar a extração local. Verifique o formato do arquivo.",
      );
    } finally {
      setIsExtracting(false);
    }
  };
  // Appends parsed extraction items back to the general central view state
  const sendExtractedToOverview = async () => {
    if (extractedDebtors.length === 0 || !currentOwnerUserId) return;

    const toSend = extractedSelectedIds.size > 0
      ? extractedDebtors.filter(d => extractedSelectedIds.has(d.id))
      : extractedDebtors;

    if (toSend.length === 0) return;

    // Detecta duplicatas de document_number dentro do lote
    const docCount = new Map<string, number>();
    for (const d of toSend) {
      const doc = d.document?.trim();
      if (doc) docCount.set(doc, (docCount.get(doc) ?? 0) + 1);
    }
    const dupes = Array.from(docCount.entries())
      .filter(([, c]) => c > 1)
      .map(([doc, count]) => ({ doc, count }));

    if (dupes.length > 0) {
      setDupDocModal({ pending: toSend, dupes });
      return;
    }

    await doSendToOverview(toSend);
  };

  const doSendToOverview = async (toSend: typeof extractedDebtors, keepAll = true) => {
    // Se keepAll=false: mantém só o primeiro de cada doc duplicado (descarta o resto)
    const finalList = keepAll ? toSend : (() => {
      const seen = new Set<string>();
      return toSend.filter(d => {
        const doc = d.document?.trim();
        if (!doc) return true;
        if (seen.has(doc)) return false;
        seen.add(doc);
        return true;
      });
    })();

    try {
      const savedDebtors = await financeService.createMany(currentOwnerUserId!, finalList);
      setDebtors((prev) => [...prev, ...savedDebtors]);
      const sentIds = new Set(finalList.map(d => d.id));
      setExtractedDebtors(prev => prev.filter(d => !sentIds.has(d.id)));
      setExtractedSelectedIds(new Set());
      setDupDocModal(null);
      if (extractedDebtors.length === toSend.length) {
        setImportText("");
        setImportFileName("");
        setCurrentTab("visao_geral");
      }
    } catch (error) {
      setExtractionAlert(error instanceof Error ? error.message : "Não foi possível salvar os registros importados.");
      setDupDocModal(null);
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
  // ── Local-only update (instant, no API call) ─────────────────────────────────
  const updateDebtorFieldLocal = (id: string, field: keyof Debtor, val: string | number) => {
    setDebtors((prev) => prev.map((debtor) =>
      debtor.id === id ? { ...debtor, [field]: val } : debtor
    ));
  };

  // ── Persist to DB (called on onBlur) ─────────────────────────────────────────
  const saveDebtorFieldToDB = async (id: string) => {
    const currentDebtor = debtors.find((debtor) => debtor.id === id);
    if (!currentDebtor || !currentOwnerUserId) return;
    try {
      const savedDebtor = await financeService.update(currentOwnerUserId, currentDebtor);
      setDebtors((prev) => prev.map((debtor) => (debtor.id === id ? savedDebtor : debtor)));
      if (selectedDebtorForMessage?.id === id) {
        setSelectedDebtorForMessage(savedDebtor);
      }
    } catch (error) {
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao salvar alteração do devedor.');
    }
  };

  // Legacy wrapper — used for non-text updates (category click, status, etc.)
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
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao salvar alteração do devedor.');
    }
  };

  // Delete option inside extracted stage
  const removeExtractedRow = (id: string) => {
    setExtractedDebtors(prev => prev.filter(d => d.id !== id));
  };

  // Bulk delete selected debtors in Visão Geral
  const handleBulkDelete = async () => {
    if (selectedDebtorIds.size === 0 || !currentOwnerUserId) return;
    const idsToDelete: string[] = Array.from(selectedDebtorIds) as string[];
    setDebtors(prev => prev.filter(d => !selectedDebtorIds.has(d.id)));
    setSelectedDebtorIds(new Set());
    setBatchSendResult(null);
    const ownerUid = currentOwnerUserId as string;
    try {
      await Promise.all(idsToDelete.map(id => financeService.remove(ownerUid, id)));
    } catch (error) {
      console.error('[workspace]', error instanceof Error ? error.message : 'Erro ao excluir selecionados.');
    }
  };

  // Save inline phone edit in Cobrança tab
  const saveCobrancaPhone = async (debtorId: string) => {
    if (!currentOwnerUserId) return;
    const phone = editingPhoneValue.trim();
    const debtor = debtors.find(d => d.id === debtorId);
    if (!debtor) return;
    const updatedDebtor = { ...debtor, phone };
    setDebtors(prev => prev.map(d => d.id === debtorId ? updatedDebtor : d));
    if (selectedDebtorForMessage?.id === debtorId) {
      setSelectedDebtorForMessage(updatedDebtor);
    }
    setEditingPhoneDebtorId(null);
    try {
      await financeService.update(currentOwnerUserId, updatedDebtor);
    } catch {
      // silently ignore — local state already updated
    }
  };

  // Upload / remove PDF attachment for a debtor in Cobrança tab
  const handlePdfUpload = async (debtorId: string, file: File) => {
    if (!currentOwnerUserId) return;
    setUploadingPdfDebtorId(debtorId);
    try {
      const url = await financeService.uploadChargePdf(currentOwnerUserId, debtorId, file);
      await financeService.updatePdfAttachment(currentOwnerUserId, debtorId, { url, name: file.name });
      setDebtors(prev => prev.map(d =>
        d.id === debtorId ? { ...d, driveFileId: "uploaded", driveFileName: file.name, driveFileUrl: url } : d
      ));
    } catch (err) {
      console.error('[workspace]', err instanceof Error ? err.message : 'Falha ao enviar PDF.');
    } finally {
      setUploadingPdfDebtorId(null);
    }
  };

  const handlePdfRemove = async (debtorId: string) => {
    if (!currentOwnerUserId) return;
    try {
      await financeService.updatePdfAttachment(currentOwnerUserId, debtorId, null);
      setDebtors(prev => prev.map(d =>
        d.id === debtorId ? { ...d, driveFileId: null, driveFileName: null, driveFileUrl: null } : d
      ));
    } catch (err) {
      console.error('[workspace]', err instanceof Error ? err.message : 'Falha ao remover PDF.');
    }
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
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao excluir devedor.');
    }
  };

  // Aprende contatos a partir de devedores com telefone e atualiza o mapa local
  const learnContactsFromDebtors = async (list: Debtor[]) => {
    if (!currentOwnerUserId) return;
    try {
      await contactsService.syncFromDebtors(currentOwnerUserId, list);
      const refreshed = await contactsService.listByUser(currentOwnerUserId);
      setContactsByKey(new Map(refreshed.map((c) => [c.contactKey, c])));
    } catch {
      // não-crítico — cadastro de contatos é best-effort
    }
  };

  // Add debtor manually
  const handleAddDebtorManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOwnerUserId) return;
    const val = parseFloat(addDebtorForm.value.replace(",", "."));
    if (!addDebtorForm.client.trim() || !addDebtorForm.dueDate.trim() || isNaN(val) || val <= 0) {
      setAddDebtorError("Preencha ao menos: Nome, Vencimento e Valor.");
      return;
    }
    setAddDebtorSaving(true);
    setAddDebtorError("");
    try {
      const newDebtor: Debtor = {
        id:       crypto.randomUUID(),
        client:   addDebtorForm.client.trim(),
        supplier: addDebtorForm.supplier.trim(),
        document: addDebtorForm.document.trim() || `M-${Date.now()}`,
        dueDate:  addDebtorForm.dueDate.trim(),
        value:    val,
        phone:    addDebtorForm.phone.trim(),
        category: addDebtorForm.category,
        status:   "pending",
        interestApplied: addDebtorForm.category === "liquidado" ? 0 : globalInterestDayPct,
        fineApplied:     addDebtorForm.category === "liquidado" ? 0 : globalFinePct,
        updatedValue:    addDebtorForm.category === "liquidado"
          ? val
          : Math.round(val * (1 + globalFinePct / 100) * 100) / 100,
      };
      const [saved] = await financeService.createMany(currentOwnerUserId, [newDebtor]);
      setDebtors(prev => [saved, ...prev]);
      // Aprende o contato (telefone) para sugerir em cadastros/importações futuras
      void learnContactsFromDebtors([saved]);
      setAddDebtorForm({ client: "", supplier: "", document: "", dueDate: "", value: "", phone: "", category: "vencidos" });
      setShowAddDebtorModal(false);
    } catch (err) {
      setAddDebtorError(err instanceof Error ? err.message : "Erro ao salvar. Tente novamente.");
    } finally {
      setAddDebtorSaving(false);
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
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao salvar representante.');
    }
  };

  // Sincronizar Visão Geral → Google Sheets
  const handleExportToSheets = async () => {
    const targetUrl = exportSheetUrl.trim() || sheetUrlInput.trim();
    if (!targetUrl) {
      setSheetsExportResult({
        success: false,
        status: "payload_invalido",
        rowsExported: 0,
        rowsTotal: 0,
        spreadsheetId: null,
        sheetName: null,
        exportedAt: null,
        error: "Configure a URL da planilha Google Sheets abaixo ou na aba Importar.",
      });
      return;
    }
    if (debtors.length === 0) {
      setSheetsExportResult({
        success: false,
        status: "payload_invalido",
        rowsExported: 0,
        rowsTotal: 0,
        spreadsheetId: null,
        sheetName: null,
        exportedAt: null,
        error: "Não há registros na Visão Geral para exportar.",
      });
      return;
    }
    setIsExportingSheets(true);
    setSheetsExportResult(null);
    try {
      const result = await googleSheetsService.exportToSheets({
        spreadsheetUrl: targetUrl,
        sheetName: exportSheetName.trim() || "Visão Geral",
      });
      setSheetsExportResult(result);
    } catch {
      setSheetsExportResult({
        success: false,
        status: "erro_interno",
        rowsExported: 0,
        rowsTotal: 0,
        spreadsheetId: null,
        sheetName: null,
        exportedAt: null,
        error: "Erro inesperado ao exportar. Tente novamente.",
      });
    } finally {
      setIsExportingSheets(false);
    }
  };

  // Delete representative from modal
  const handleDeleteRep = async (repId: string) => {
    if (!currentOwnerUserId) return;
    try {
      await representativesService.remove(currentOwnerUserId, repId);
      setRepresentatives((prev) => prev.filter((r) => r.id !== repId));
    } catch (error) {
      setRepModalError(error instanceof Error ? error.message : "Falha ao excluir responsável.");
    }
  };

  // Add representative from modal
  const handleAddRepFromModal = async () => {
    if (!currentOwnerUserId) return;
    if (!repModalForm.name.trim()) {
      setRepModalError("Nome é obrigatório.");
      return;
    }
    setIsSavingRep(true);
    setRepModalError("");
    const colors = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500", "bg-indigo-500", "bg-pink-500"];
    const newRep: Representative = {
      id: `rep-${Date.now()}`,
      name: repModalForm.name.trim(),
      phone: repModalForm.phone.trim() || "5577999880000",
      role: repModalForm.role.trim() || "Cobrança",
      color: colors[representatives.length % colors.length],
    };
    try {
      const saved = await representativesService.create(currentOwnerUserId, newRep);
      setRepresentatives((prev) => [...prev, saved]);
      setRepModalForm({ name: "", phone: "", role: "", color: "bg-emerald-500" });
    } catch (error) {
      setRepModalError(error instanceof Error ? error.message : "Falha ao salvar responsável.");
    } finally {
      setIsSavingRep(false);
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

  // Excel (.xlsx) export with proper formatting
  const downloadExcelFormat = () => {
    const CATEGORY_PT: Record<string, string> = {
      vencidos:  "Vencido",
      a_vencer:  "A Vencer",
      liquidado: "Liquidado",
    };

    const rows = debtors.map((d) => {
      const rep = representatives.find((r) => r.id === d.representativeId);
      return {
        "Cliente":              d.client,
        "Documento":            d.document || "",
        "Banco":                d.bank || "",
        "Vencimento":           d.dueDate   || "",
        "Valor Base (R$)":      d.value,
        "Juros (%)":            d.interestApplied  ?? 0,
        "Multa (%)":            d.fineApplied      ?? 0,
        "Valor Atualizado (R$)":(d.updatedValue || d.value),
        "Telefone":             d.phone ? String(d.phone) : "",
        "Categoria":            CATEGORY_PT[d.category] ?? d.category,
        "Responsável":          rep ? rep.name : "Nenhum",
        "Observações":          d.notes || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Force Telefone column (index 8, col I) to text so Excel doesn't convert to scientific notation
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: 8 });
      if (ws[cellAddr]) {
        ws[cellAddr].t = "s"; // force string type
      }
    }

    // Set column widths
    ws["!cols"] = [
      { wch: 36 }, // Cliente
      { wch: 18 }, // Documento
      { wch: 14 }, // Banco
      { wch: 14 }, // Vencimento
      { wch: 16 }, // Valor Base
      { wch: 10 }, // Juros
      { wch: 10 }, // Multa
      { wch: 20 }, // Valor Atualizado
      { wch: 18 }, // Telefone
      { wch: 14 }, // Categoria
      { wch: 22 }, // Responsável
      { wch: 30 }, // Observações
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Devedores");

    const fileName = `nc_finance_devedores_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
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
        console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao limpar registros financeiros.');
      }
    }
  };

  // Envio real via Edge Function send-whatsapp-charge (Z-API global da plataforma)
  const handleSendMessage = async () => {
    if (!selectedDebtorForMessage) return;

    // Liquidados nunca devem receber cobrança
    if (selectedDebtorForMessage.category === "liquidado") {
      setMessageFeedback({
        success: false,
        text: "Este título está marcado como liquidado. Cobranças não são enviadas para títulos pagos.",
      });
      return;
    }

    // Pré-checagem visual (backend re-valida tudo — isso evita round-trip desnecessário)
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
        void updateGeneralDebtorField(selectedDebtorForMessage.id, "lastSentDate", new Date().toISOString());
        void updateGeneralDebtorField(selectedDebtorForMessage.id, "lastSentMessage", customMessageDraft);

        // Adiciona log na UI (o log real já foi criado no backend pelo Edge Function)
        const localLogEntry: BillingLog = {
          id: result.logId ?? `local-log-${Date.now()}`,
          userId: currentOwnerUserId || undefined,
          client: selectedDebtorForMessage.client,
          document: selectedDebtorForMessage.document,
          phone: selectedDebtorForMessage.phone,
          value: selectedDebtorForMessage.updatedValue ?? selectedDebtorForMessage.value,
          dateSent: new Date().toISOString(),
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
        const baseLabel = SEND_STATUS_LABELS[result.status as SendChargeStatus];
        const friendlyText = result.status === "erro" && result.error
          ? `${baseLabel} Detalhe: ${result.error}`
          : baseLabel ?? result.error ?? "Falha ao enviar cobrança.";

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

  // Pendência Crítica: vencidos debtors delayed at least criticalDays
  const criticalDebtors = debtors.filter(d => {
    if (d.category !== "vencidos") return false;
    if (!d.dueDate) return false;
    const [dd, mm, yyyy] = d.dueDate.split("/");
    if (!dd || !mm || !yyyy) return false;
    const due = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const delayDays = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return delayDays >= criticalDays;
  });
  const criticalValue = criticalDebtors.reduce((acc, d) => {
    // c/ juros: valor + multa + juros (updatedValue)
    if (criticalWithInterest) return acc + (d.updatedValue || d.value);
    // s/ juros: valor + multa, sem os juros diários
    const semJuros = Math.round((d.value * (1 + globalFinePct / 100)) * 100) / 100;
    return acc + semJuros;
  }, 0);
  const liquidadoValue = debtors.filter(d => d.category === "liquidado").reduce((acc, d) => acc + d.value, 0);

  // Apply filters to display debtors lists
  const filteredDebtors = (() => {
    const filtered = debtors.filter(d => {
      const matchesSearch = d.client.toLowerCase().includes(searchFilter.toLowerCase()) ||
                            d.document.toLowerCase().includes(searchFilter.toLowerCase()) ||
                            d.supplier.toLowerCase().includes(searchFilter.toLowerCase());
      const matchesCategory = categoryFilter === "all" ? true : d.category === categoryFilter;
      const matchesStatus = statusFilter === "all" ? true : d.status === statusFilter;
      const matchesRep = repFilter === "all" ? true : repFilter === "unassigned" ? !d.representativeId : d.representativeId === repFilter;
      return matchesSearch && matchesCategory && matchesStatus && matchesRep;
    });
    const cmp = (a: string, b: string) =>
      a.trim().localeCompare(b.trim(), "pt-BR", { sensitivity: "base", ignorePunctuation: true });

    // Banco e Data têm prioridade — verificados antes do nome
    if (sortBankOrder === "asc")  return [...filtered].sort((a, b) => cmp(a.bank || "", b.bank || ""));
    if (sortBankOrder === "desc") return [...filtered].sort((a, b) => cmp(b.bank || "", a.bank || ""));

    if (sortValueOrder === "asc")  return [...filtered].sort((a, b) => (a.value || 0) - (b.value || 0));
    if (sortValueOrder === "desc") return [...filtered].sort((a, b) => (b.value || 0) - (a.value || 0));

    const parseDateNum = (d: string) => {
      const [dd, mm, yyyy] = (d || "").split("/");
      if (!dd || !mm || !yyyy) return 0;
      return Number(yyyy) * 10000 + Number(mm) * 100 + Number(dd);
    };
    if (sortDateOrder === "asc")  return [...filtered].sort((a, b) => parseDateNum(a.dueDate) - parseDateNum(b.dueDate));
    if (sortDateOrder === "desc") return [...filtered].sort((a, b) => parseDateNum(b.dueDate) - parseDateNum(a.dueDate));

    if (sortNameOrder === "asc")  return [...filtered].sort((a, b) => cmp(a.client, b.client));
    if (sortNameOrder === "desc") return [...filtered].sort((a, b) => cmp(b.client, a.client));

    return filtered;
  })();

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
            <p className="text-sm font-semibold text-white">Verificando assinatura…</p>
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
            onSupportClick={() => setShowSuporte(true)}
            userLabel={account?.displayName || "Conta autenticada"}
            userEmail={account?.email || user?.email || ""}
          />

          <main className="transition-all duration-300 pl-14 md:pl-16 min-h-screen flex flex-col justify-between">
            
            <div className="border-b border-zinc-800/60 bg-zinc-950 p-4 sticky top-0 z-20 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">
                  {currentTab === "cobrar"     && "Enviar Cobranças"}
                  {currentTab === "dashboard"  && "Dashboard & Métricas"}
                  {currentTab === "importar"   && "Importação Avançada"}
                  {currentTab === "visao_geral"&& "Visão Geral — Base Consolidada"}
                  {currentTab === "cobranca"   && "Cobrança — WhatsApp"}
                  {currentTab === "historico"  && "Histórico de Cobrança"}
                  {currentTab === "automacoes" && "Automações de Cobrança"}
                </h2>
              </div>
            </div>

            {(isWorkspaceLoading || isSavingConfig) && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
                <div className="space-y-2">
                  {isWorkspaceLoading && (
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                      Carregando seus dados persistidos no Supabase...
                    </div>
                  )}
                  {isSavingConfig && !isWorkspaceLoading && (
                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Salvando suas preferencias...
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">

              {/* ── Tab: Cobrar (novo fluxo simplificado) ──────────────────── */}
              {currentTab === "cobrar" && userId && (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-400">
                    Importe sua planilha, revise os devedores e envie as mensagens em segundos.
                  </p>
                  <ClientDashboard
                    userId={userId}
                    globalFinePct={globalFinePct}
                    globalInterestDayPct={globalInterestDayPct}
                    knownContacts={contactsByKey}
                    onLearnContacts={learnContactsFromDebtors}
                    onBatchSent={(result) => {
                      setBatchSendResult(result);
                      // Re-fetch billing logs so Histórico reflects the new batch entries
                      if (currentOwnerUserId) {
                        void billingLogsService.listByUser(currentOwnerUserId)
                          .then(setBillingLogs)
                          .catch(() => {/* non-critical */});
                      }
                    }}
                    onDebtorsImported={async () => {
                      // Recarrega a Visão Geral do DB após qualquer importação ou reconciliação
                      if (!currentOwnerUserId) return;
                      try {
                        const updated = await financeService.listByUser(currentOwnerUserId);
                        setDebtors(updated);
                      } catch {
                        // non-critical — Visão Geral será atualizada no próximo acesso
                      }
                    }}
                  />
                </div>
              )}

              {currentTab === "dashboard" && (
              <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-emerald-500/10 p-4 sm:p-5 rounded-3xl relative overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-[200px] h-full bg-[radial-gradient(circle_at_right_top,rgba(16,185,129,0.06),transparent)]" />
                <div className="flex flex-col gap-4">
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                      <Zap className="w-5 h-5 text-emerald-400 animate-pulse" /> Sistema Moderno NC Finance
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 font-light mt-1">
                      Gerencie faturamentos, extraia devedores com o pipeline local de análise de documentos e envie notificações automáticas de cobrança.
                    </p>
                  </div>
                </div>
              </div>
              )}

              {currentTab === "dashboard" && (
                <div className="space-y-8">
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

                      <div className="flex items-center justify-between text-emerald-400 text-xs uppercase tracking-wider font-mono">
                        <span>Faturamento Corrigido</span>
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl sm:text-3xl font-extrabold text-emerald-300 font-mono">{formatBRL(vencidosValue)}</span>
                      </div>
                      <div className="text-[10px] text-emerald-400/60 mt-2">
                        Total dos vencidos com {globalFinePct}% de multa + {globalInterestDayPct}% de juros diários.
                      </div>
                    </div>

                    <div className="bg-zinc-900/60 border border-rose-950/40 p-5 rounded-2xl relative overflow-hidden flex flex-col justify-between min-h-[120px] shadow-lg shadow-rose-950/20">
                      {/* subtle glow accent */}
                      <div className="absolute inset-0 bg-gradient-to-br from-rose-950/20 via-transparent to-transparent pointer-events-none rounded-2xl" />

                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-rose-400/80 uppercase tracking-widest font-mono font-semibold">Pendência Crítica</span>
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                      </div>

                      {/* Value + count */}
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <span className="text-2xl sm:text-3xl font-extrabold text-rose-400 font-mono leading-none">{formatBRL(criticalValue)}</span>
                        <span className="text-[11px] text-rose-400/50 font-mono mb-0.5 shrink-0">{criticalDebtors.length} títulos</span>
                      </div>

                      {/* Controls */}
                      <div className="mt-3 flex items-center gap-2">
                        {/* Days input pill */}
                        <div className="flex items-center gap-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-lg px-2.5 py-1">
                          <span className="text-[10px] text-zinc-500 select-none">dias ≥</span>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={criticalDaysStr}
                            onChange={e => {
                              const raw = e.target.value;
                              setCriticalDaysStr(raw);
                              const n = parseInt(raw, 10);
                              if (!isNaN(n) && n > 0) setCriticalDays(n);
                            }}
                            onBlur={() => {
                              const n = parseInt(criticalDaysStr, 10);
                              if (isNaN(n) || n <= 0) { setCriticalDays(1); setCriticalDaysStr("1"); }
                            }}
                            className="w-10 bg-transparent text-[11px] text-rose-300 font-mono text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </div>

                        {/* Interest toggle */}
                        <button
                          type="button"
                          onClick={() => setCriticalWithInterest(v => !v)}
                          className={`relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all duration-200 ${
                            criticalWithInterest
                              ? "bg-rose-500/15 border-rose-500/40 text-rose-300"
                              : "bg-zinc-800/80 border-zinc-700/60 text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full transition-colors ${criticalWithInterest ? "bg-rose-400" : "bg-zinc-600"}`} />
                          {criticalWithInterest ? "c/ juros" : "s/ juros"}
                        </button>
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

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {representatives.map(r => {
                          const assignedDebtors = debtors.filter(db => db.representativeId === r.id);
                          const assignedCount = assignedDebtors.length;
                          const isExpanded = expandedRepId === r.id;
                          return (
                            <div key={r.id} className="rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden">
                              <div className="flex items-center justify-between p-2.5">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2.5 h-2.5 rounded-full ${r.color}`} />
                                  <div>
                                    <div className="text-xs font-bold text-zinc-300">{r.name}</div>
                                    <div className="text-[10px] text-zinc-500">{r.role}</div>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setExpandedRepId(isExpanded ? null : r.id)}
                                  disabled={assignedCount === 0}
                                  className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                                    assignedCount === 0
                                      ? "bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-default"
                                      : isExpanded
                                        ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                                        : "bg-zinc-900 border border-zinc-700 text-zinc-300 hover:border-emerald-500/40 hover:text-emerald-300"
                                  }`}
                                >
                                  {assignedCount} {assignedCount === 1 ? "devedor" : "devedores"} {assignedCount > 0 && (isExpanded ? "▲" : "▼")}
                                </button>
                              </div>
                              {isExpanded && assignedDebtors.length > 0 && (
                                <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
                                  {assignedDebtors.map(d => (
                                    <div key={d.id} className="flex items-center justify-between px-3 py-2 gap-2">
                                      <div className="min-w-0">
                                        <p className="text-[11px] font-semibold text-zinc-200 truncate">{d.client}</p>
                                        <p className="text-[10px] text-zinc-500 font-mono">{d.document}</p>
                                      </div>
                                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                          d.category === "vencidos"  ? "bg-rose-500/10 text-rose-400"   :
                                          d.category === "a_vencer"  ? "bg-amber-500/10 text-amber-400" :
                                          "bg-emerald-500/10 text-emerald-400"
                                        }`}>
                                          {d.category === "vencidos" ? "Vencido" : d.category === "a_vencer" ? "A vencer" : "Liquidado"}
                                        </span>
                                        <span className="text-[10px] font-mono text-zinc-400">
                                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(d.updatedValue || d.value)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        onClick={() => setShowRepModal(true)}
                        className="w-full mt-2 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-semibold text-center transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Gerenciar Responsáveis Ativos
                      </button>
                    </div>

                  </div>

                  {/* ── Automation rules card ─────────────────────────────────── */}
                  <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <Bot className="w-4 h-4 text-emerald-400" /> Regras de Automação
                        </h4>
                        <p className="text-xs text-zinc-500 mt-0.5">Regras ativas de disparo automático de cobranças</p>
                      </div>
                      <button
                        onClick={() => setCurrentTab("automacoes")}
                        className="text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 rounded-xl px-3 py-1.5 transition-colors flex items-center gap-1.5"
                      >
                        Gerenciar regras <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                    {isLoadingAutomation ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando regras...
                      </div>
                    ) : automationRules.length === 0 ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 text-center space-y-1">
                        <Bot className="w-8 h-8 text-zinc-700 mx-auto" />
                        <p className="text-xs font-semibold text-zinc-400">Nenhuma regra configurada</p>
                        <p className="text-[11px] text-zinc-600">Clique em "Gerenciar regras" para criar sua primeira automação.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {automationRules.map((rule) => (
                          <div key={rule.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${rule.enabled ? "bg-emerald-400" : "bg-zinc-600"}`} />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-200 truncate">{rule.name}</p>
                                <p className="text-[10px] text-zinc-500">{RULE_TYPE_LABELS[rule.ruleType] ?? rule.ruleType} · tom: {rule.messageTone}</p>
                              </div>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border flex-shrink-0 ${rule.enabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-zinc-800 border-zinc-700 text-zinc-500"}`}>
                              {rule.enabled ? "ATIVA" : "PAUSADA"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-900">
                    <h4 className="text-sm font-bold text-white mb-4">Fluxo Operacional de Cobranças da NC Finance</h4>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                      <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-850 flex flex-col gap-2">
                        <span className="font-mono text-emerald-400 font-bold">Passo 1</span>
                        <h5 className="font-bold text-white">Importação e Extração</h5>
                        <p className="text-zinc-500 font-light">Cole o relatório bruto ou insira as parcelas para que o extrator local estruture os vencimentos.</p>
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

                    {isLoadingMetrics && !operationalMetrics && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4 h-24 animate-pulse" />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Resumo por Representante ──────────────────────────── */}
                  <div className="bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" /> Resumo por Representante
                      </h4>
                      <p className="text-xs text-zinc-500 mt-0.5">Distribuição de clientes e valores por responsável atribuído</p>
                    </div>

                    {(() => {
                      // Group debtors by representativeId
                      const repGroups = new Map<string, { rep: Representative | null; items: typeof debtors }>();

                      // Add "Sem representante" group
                      repGroups.set("__none__", { rep: null, items: [] });
                      representatives.forEach(r => repGroups.set(r.id, { rep: r, items: [] }));

                      debtors.forEach(d => {
                        const key = d.representativeId && repGroups.has(d.representativeId) ? d.representativeId : "__none__";
                        repGroups.get(key)!.items.push(d);
                      });

                      const rows = Array.from(repGroups.entries())
                        .map(([key, { rep, items }]) => ({
                          key,
                          name: rep ? rep.name : "Sem representante",
                          color: rep?.color ?? "text-zinc-400",
                          total: items.length,
                          vencidos: items.filter(d => d.category === "vencidos").length,
                          aVencer: items.filter(d => d.category === "a_vencer").length,
                          liquidados: items.filter(d => d.category === "liquidado").length,
                          valorTotal: items.reduce((s, d) => s + (d.updatedValue || d.value), 0),
                        }))
                        .filter(r => r.total > 0)
                        .sort((a, b) => b.total - a.total);

                      if (rows.length === 0) {
                        return (
                          <p className="text-xs text-zinc-500 text-center py-4">Nenhum cliente cadastrado ainda.</p>
                        );
                      }

                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left text-zinc-300">
                            <thead className="text-[10px] uppercase font-mono tracking-wider bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
                              <tr>
                                <th className="px-4 py-3">Representante</th>
                                <th className="px-4 py-3 text-center">Total clientes</th>
                                <th className="px-4 py-3 text-center text-rose-400">Vencidos</th>
                                <th className="px-4 py-3 text-center text-amber-400">A Vencer</th>
                                <th className="px-4 py-3 text-center text-emerald-400">Liquidados</th>
                                <th className="px-4 py-3 text-right">Valor Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800">
                              {rows.map(r => (
                                <tr key={r.key} className="hover:bg-zinc-900/30 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-zinc-200">{r.name}</td>
                                  <td className="px-4 py-3 text-center font-mono font-bold text-white">{r.total}</td>
                                  <td className="px-4 py-3 text-center font-mono text-rose-400">{r.vencidos}</td>
                                  <td className="px-4 py-3 text-center font-mono text-amber-400">{r.aVencer}</td>
                                  <td className="px-4 py-3 text-center font-mono text-emerald-400">{r.liquidados}</td>
                                  <td className="px-4 py-3 text-right font-mono font-bold text-emerald-300">{formatBRL(r.valorTotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  <SubscriptionStatusCard
                    subscription={subscription}
                    usage={usage}
                    remainingCharges={remainingCharges}
                    canSendCharge={canSendCharge}
                    onManageSubscription={() => void handleOpenBillingPortal()}
                  />

                </div>
              )}

              {currentTab === "importar" && (
                <div className="space-y-8">
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-sky-200">
                      Esta é a ferramenta avançada de extração (OCR, presets e texto bruto). Para o fluxo guiado de importação e envio, use a aba <strong>Cobrar</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCurrentTab("cobrar")}
                      className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      Ir para Cobrar <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                          <Download className="w-4 h-4 text-emerald-400" /> Upload ou Texto de Cobrança
                        </h4>
                        <p className="text-xs text-zinc-500 font-light">
                          Cole faturas, relatórios de ERP ou selecione presets abaixo. O extrator local identifica clientes, vencimentos, valores e documentos automaticamente.
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-zinc-950 border-2 border-dashed border-zinc-800 hover:border-emerald-500/30 transition-all text-center space-y-2 relative group">
                        <div className="w-10 h-10 rounded-full bg-zinc-900/50 flex items-center justify-center text-zinc-400 mx-auto group-hover:bg-emerald-500/10 group-hover:text-emerald-400 transition-colors">
                          <FileCheck2 className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-zinc-300">Arraste seus relatórios PDF, TXT ou EXCEL aqui</p>
                          <p className="text-[10px] text-zinc-600">
                            {isParsingImportFile
                              ? "Lendo arquivo..."
                              : importFileName
                                ? `Arquivo carregado: ${importFileName}`
                                : "O conteúdo real do arquivo terá prioridade sobre presets e textos de exemplo."}
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
                        <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                          <FileCheck2 className="w-3.5 h-3.5" />
                          Tipo de arquivo
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                          {([
                            { value: "vencidos",  label: "Vencidos",   description: "Títulos já vencidos — cobráveis com juros e multa", inactive: "border-zinc-700 text-zinc-400 hover:border-rose-500/50 hover:text-rose-300",    active: "border-rose-500 bg-rose-500/10 text-rose-300" },
                            { value: "a_vencer",  label: "A vencer",   description: "Títulos a vencer — aviso preventivo amigável",       inactive: "border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-300",   active: "border-amber-500 bg-amber-500/10 text-amber-300" },
                            { value: "liquidado", label: "Liquidação", description: "Títulos pagos — reconciliação, SEM cobrança",        inactive: "border-zinc-700 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-300", active: "border-emerald-500 bg-emerald-500/10 text-emerald-300" },
                          ] as const).map(cat => (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => setImportCategory(cat.value)}
                              className={`px-3 py-3 rounded-xl border transition-all text-left ${importCategory === cat.value ? cat.active : cat.inactive}`}
                            >
                              <div className="font-semibold text-sm">{cat.label}</div>
                              <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{cat.description}</div>
                            </button>
                          ))}
                        </div>
                        {importCategory === "liquidado" && (
                          <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                            <HandCoins className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>Arquivo de <strong>liquidação</strong>: os registros identificados serão marcados como pagos na base consolidada. <strong>Nenhuma cobrança será enviada.</strong></span>
                          </div>
                        )}
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
                        <div className="p-3 border text-xs rounded-xl flex items-start gap-2 bg-amber-500/10 border-amber-500/20 text-amber-400">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span className="flex-1">{extractionAlert}</span>
                        </div>
                      )}

                      <button
                        onClick={handleAIExtract}
                        disabled={isExtracting}
                        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all text-sm cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isExtracting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Extraindo dados do documento…
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4" /> Extrair Dados do Documento
                          </>
                        )}
                      </button>

                    </div>

                    <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-900 p-6 rounded-3xl space-y-4 shadow-xl flex flex-col justify-between">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Dados Financeiros Extraídos Revisáveis</h4>
                        <p className="text-xs text-zinc-500 font-light">
                          Os dados abaixo foram extraídos pelo pipeline local. Você pode editar os campos e optar por enviá-los de forma consolidada para a Visão Geral.
                        </p>
                      </div>

                      {/* ── Post-import summary chips ──────────────────────── */}
                      {lastExtractionResult && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle className="w-3 h-3" />
                            {lastExtractionResult.records.length} registro{lastExtractionResult.records.length !== 1 ? "s" : ""}
                          </span>
                          {lowConfidenceIds.size > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                const ids = [...lowConfidenceIds];
                                if (!ids.length) return;
                                // Cicla pelo próximo item de baixa confiança a cada clique
                                lowConfCursorRef.current = lowConfCursorRef.current % ids.length;
                                const targetId = ids[lowConfCursorRef.current];
                                lowConfCursorRef.current++;
                                // Flash
                                setFlashedLowConfId(targetId);
                                setTimeout(() => setFlashedLowConfId(null), 1200);
                                // Scroll
                                document.getElementById(`extracted-card-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors cursor-pointer"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {lowConfidenceIds.size} para revisar
                            </button>
                          )}
                          {lastExtractionResult.missingDocCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-500 border border-zinc-700">
                              {lastExtractionResult.missingDocCount} doc gerado
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex-1 min-h-[300px] overflow-y-auto max-h-[420px] pr-1 space-y-4">
                        {extractedDebtors.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-zinc-850 border-dashed rounded-2xl text-zinc-500">
                            <SlidersHorizontal className="w-10 h-10 text-zinc-700 animate-pulse mb-2" />
                            <p className="text-xs font-semibold">Nenhuma informação estruturada pendente</p>
                            <p className="text-[10px] text-zinc-600 max-w-sm mt-1">Cole as faturas e clique no botão verde para ver os campos extraídos estruturados em tabela editável.</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-mono font-bold text-emerald-400">✓ {extractedDebtors.length} Registros Prontos para Revisão:</span>
                              <div className="flex items-center gap-3">
                                {extractedSelectedIds.size > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExtractedDebtors(prev => prev.filter(d => !extractedSelectedIds.has(d.id)));
                                      setExtractedSelectedIds(new Set());
                                    }}
                                    className="flex items-center gap-1.5 text-[10px] text-rose-400 hover:text-rose-300 transition-colors font-semibold"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Remover {extractedSelectedIds.size} selecionado{extractedSelectedIds.size !== 1 ? "s" : ""}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const allSelected = extractedDebtors.every(d => extractedSelectedIds.has(d.id));
                                    setExtractedSelectedIds(allSelected ? new Set() : new Set(extractedDebtors.map(d => d.id)));
                                  }}
                                  className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-emerald-400 transition-colors font-semibold"
                                >
                                  {extractedDebtors.every(d => extractedSelectedIds.has(d.id))
                                    ? <><CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> Desmarcar todos</>
                                    : <><Square className="w-3.5 h-3.5" /> Selecionar todos</>
                                  }
                                </button>
                              </div>
                            </div>

                            {extractedDebtors.map((item, index) => (
                              <div key={item.id} id={`extracted-card-${item.id}`} className={`p-3 bg-zinc-950 border rounded-xl space-y-2 relative group transition-all duration-300 ${extractedSelectedIds.has(item.id) ? "border-emerald-500/50" : flashedLowConfId === item.id ? "border-amber-400 bg-amber-500/15 shadow-[0_0_12px_rgba(251,191,36,0.3)]" : lowConfidenceIds.has(item.id) ? "border-amber-500/50 bg-amber-500/5" : "border-zinc-850"}`}>
                                <div className="flex items-center gap-2 absolute top-2.5 left-2.5">
                                  <button
                                    type="button"
                                    onClick={() => setExtractedSelectedIds(prev => {
                                      const next = new Set(prev);
                                      next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                      return next;
                                    })}
                                    className="text-zinc-500 hover:text-emerald-400 transition-colors"
                                    title="Selecionar para importar"
                                  >
                                    {extractedSelectedIds.has(item.id)
                                      ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                                      : <Square className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                <button
                                  onClick={() => removeExtractedRow(item.id)}
                                  className="absolute top-2.5 right-2.5 text-zinc-600 hover:text-rose-400 p-1 rounded transition-colors"
                                  title="Ignorar este registro"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>

                                {lowConfidenceIds.has(item.id) && (
                                  <div className="absolute top-2.5 right-8 flex items-center gap-1 text-[9px] font-mono text-amber-400">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>Revisar</span>
                                  </div>
                                )}

                                <div className="text-xs pt-5">
                                  <div>
                                    <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Cliente</label>
                                    <input
                                      type="text"
                                      value={item.client}
                                      onChange={(e) => updateExtractedField(item.id, "client", e.target.value)}
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
                                  <div>
                                    <label className="text-[9px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">Banco</label>
                                    <input
                                      type="text"
                                      value={item.bank || ""}
                                      onChange={(e) => updateExtractedField(item.id, "bank", e.target.value)}
                                      placeholder="—"
                                      className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-white focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-zinc-900 flex items-center justify-between gap-4 flex-wrap">
                        <span className="text-zinc-500 text-xs">
                          {extractedSelectedIds.size > 0
                            ? `${extractedSelectedIds.size} de ${extractedDebtors.length} selecionado(s)`
                            : "Aguardando consolidação do operador."}
                        </span>
                        <button
                          onClick={sendExtractedToOverview}
                          disabled={extractedDebtors.length === 0}
                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold flex items-center gap-2 shadow disabled:opacity-50 transition-all text-xs cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" />
                          {extractedSelectedIds.size > 0
                            ? `Enviar ${extractedSelectedIds.size} selecionado(s) para a Visão Geral`
                            : "Enviar todos para a Visão Geral"}
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {currentTab === "visao_geral" && (
                <>
                <div className="space-y-8">
                  
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-md">
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
                              type="text"
                              inputMode="decimal"
                              value={globalFinePctStr}
                              onChange={(e) => {
                                const raw = e.target.value.replace(",", ".");
                                setGlobalFinePctStr(e.target.value);
                                if (raw === "" || raw === ".") { setGlobalFinePct(0); return; }
                                const n = parseFloat(raw);
                                if (!isNaN(n)) setGlobalFinePct(Math.max(0, n));
                              }}
                              placeholder="0"
                              className="w-full bg-transparent focus:outline-none focus:border-none text-sm text-center font-mono font-bold text-emerald-400 placeholder:text-zinc-700"
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Juros / Dia (%)</label>
                          <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-905 p-2 rounded-xl">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={globalInterestDayPctStr}
                              onChange={(e) => {
                                const raw = e.target.value.replace(",", ".");
                                setGlobalInterestDayPctStr(e.target.value);
                                if (raw === "" || raw === ".") { setGlobalInterestDayPct(0); return; }
                                const n = parseFloat(raw);
                                if (!isNaN(n)) setGlobalInterestDayPct(Math.max(0, n));
                              }}
                              placeholder="0"
                              className="w-full bg-transparent focus:outline-none focus:border-none text-sm text-center font-mono font-bold text-emerald-400 placeholder:text-zinc-700"
                            />
                            <span className="text-xs text-zinc-500">%</span>
                          </div>
                        </div>
                      </div>
                      
                    </div>

                    <div className="lg:col-span-7 bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-md">
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

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        onClick={() => { setShowAddDebtorModal(true); setAddDebtorError(""); }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs whitespace-nowrap"
                      >
                        <PlusCircle className="w-3.5 h-3.5" /> Adicionar Devedor
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setShowExportMenu((v) => !v)}
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs border border-zinc-700 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-400" /> Exportar
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
                        </button>

                        {showExportMenu && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                            <div className="absolute right-0 top-full mt-2 z-40 w-60 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl overflow-hidden">
                              <button
                                onClick={() => { setShowExportMenu(false); downloadExcelFormat(); }}
                                className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Planilha (XLS/CSV)
                              </button>
                              <button
                                onClick={() => {
                                  setShowExportMenu(false);
                                  const exportList = selectedDebtorIds.size > 0
                                    ? filteredDebtors.filter(d => selectedDebtorIds.has(d.id))
                                    : filteredDebtors;
                                  // Quando há seleção, os cards de totais também refletem só os selecionados
                                  const exportBase = selectedDebtorIds.size > 0 ? exportList : debtors;
                                  exportRelatorio(exportBase, exportList, account?.email ?? "", representatives);
                                }}
                                className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5 text-rose-400" />
                                {selectedDebtorIds.size > 0 ? `Relatório PDF (${selectedDebtorIds.size} selecionados)` : "Relatório PDF"}
                              </button>
                              <button
                                onClick={() => { setShowExportMenu(false); setSheetsExportResult(null); setExportSheetUrl(sheetUrlInput); setShowExportSheetsModal(true); }}
                                className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 transition-colors flex items-center gap-2 cursor-pointer"
                              >
                                <CloudLightning className="w-3.5 h-3.5 text-sky-400" /> Sincronizar com Sheets
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <button
                        onClick={clearOverviewVision}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Limpar Visão Geral
                      </button>
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
                            Plano Basic → upgrade para Pro/Premium
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

                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Excluir ${selectedDebtorIds.size} devedor(es) selecionado(s)? Esta ação não pode ser desfeita.`)) {
                              void handleBulkDelete();
                            }
                          }}
                          disabled={isBatchSending}
                          className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir selecionados ({selectedDebtorIds.size})
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
                              ? `✓ ${batchSendResult.dryRun ? "[Simulação] " : ""}Lote processado · ${batchSendResult.sent} enviados`
                              : `✗ ${BATCH_TOP_STATUS_LABELS[batchSendResult.status as BatchTopStatus] ?? batchSendResult.error}`
                            }
                          </div>
                          {batchSendResult.success && (
                            <div className="flex flex-wrap gap-3 text-[10px] font-mono">
                              {batchSendResult.sent > 0 && (
                                <span className="text-emerald-400">✓ {batchSendResult.sent} enviados</span>
                              )}
                              {batchSendResult.failed > 0 && (
                                <span className="text-rose-400">✗ {batchSendResult.failed} falhas</span>
                              )}
                              {batchSendResult.duplicated > 0 && (
                                <span className="text-zinc-400">≈ {batchSendResult.duplicated} duplicados</span>
                              )}
                              {batchSendResult.invalidPhone > 0 && (
                                <span className="text-amber-400">{batchSendResult.invalidPhone} tel. inválidos</span>
                              )}
                              {batchSendResult.blockedLimit > 0 && (
                                <span className="text-zinc-500">⚡ {batchSendResult.blockedLimit} bloqueados (limite)</span>
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
                                {r.status === "sucesso"             ? "✓ enviado"           :
                                 r.status === "duplicado"           ? "≈ duplicado"        :
                                 r.status === "telefone_invalido"   ? "tel. inválido"    :
                                 r.status === "bloqueado_limite"    ? "⚡ limite"           :
                                 r.status === "devedor_nao_encontrado" ? "✗ não encontrado" :
                                 "✗ erro"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl overflow-hidden shadow-xl">
                    <div
                      ref={tableScrollRef}
                      className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900 cursor-grab active:cursor-grabbing select-none"
                      onMouseDown={(e) => {
                        // Ignora cliques em inputs, selects e botões para não interferir na edição
                        if ((e.target as HTMLElement).closest("input,select,button,a,label")) return;
                        const el = tableScrollRef.current;
                        if (!el) return;
                        tableDragRef.current = { isDown: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
                        el.style.cursor = "grabbing";
                      }}
                      onMouseLeave={() => {
                        tableDragRef.current.isDown = false;
                        if (tableScrollRef.current) tableScrollRef.current.style.cursor = "grab";
                      }}
                      onMouseUp={() => {
                        tableDragRef.current.isDown = false;
                        if (tableScrollRef.current) tableScrollRef.current.style.cursor = "grab";
                      }}
                      onMouseMove={(e) => {
                        if (!tableDragRef.current.isDown) return;
                        e.preventDefault();
                        const el = tableScrollRef.current;
                        if (!el) return;
                        const x = e.pageX - el.offsetLeft;
                        const walk = (x - tableDragRef.current.startX) * 1.2;
                        el.scrollLeft = tableDragRef.current.scrollLeft - walk;
                      }}
                    >
                      <table id="tbl-devedores" className="w-full text-xs text-left text-zinc-300">
                        <thead className="text-[10px] uppercase font-mono tracking-wider bg-zinc-900/80 border-b border-zinc-800 text-zinc-400">
                          <tr>
                            <th className="px-3 py-4 w-8 sticky left-0 z-10 bg-zinc-900/80 backdrop-blur-sm">
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
                            {/* Cliente / Sacado — com sort A-Z inline */}
                            <th className="px-5 py-3 sticky left-8 z-10 bg-zinc-900/80 backdrop-blur-sm shadow-[2px_0_8px_rgba(0,0,0,0.4)]">
                              <button
                                type="button"
                                onClick={() => { setSortDateOrder("none"); setSortNameOrder(o => o === "asc" ? "desc" : "asc"); }}
                                className="flex items-center gap-1.5 group transition-colors text-zinc-400 hover:text-zinc-200"
                                title={sortNameOrder === "asc" ? "Clique para Z-A" : "Clique para A-Z"}
                              >
                                <span className="text-emerald-400">CLIENTE</span>
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded transition-colors bg-emerald-500/20 text-emerald-400">
                                  {sortNameOrder === "desc" ? "Z→A ↓" : "A→Z ↑"}
                                </span>
                              </button>
                            </th>
                            <th className="px-4 py-3 text-center">DOCUMENTO</th>
                            <th className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => { setSortNameOrder("none"); setSortDateOrder("none"); setSortValueOrder("none"); setSortBankOrder(o => o === "asc" ? "desc" : o === "desc" ? "none" : "asc"); }}
                                className="flex items-center gap-1.5 group transition-colors text-zinc-400 hover:text-zinc-200"
                                title={sortBankOrder === "asc" ? "Clique para Z-A" : sortBankOrder === "desc" ? "Clique para remover ordenação" : "Clique para A-Z"}
                              >
                                <span className={sortBankOrder !== "none" ? "text-emerald-400" : ""}>BANCO</span>
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${
                                  sortBankOrder !== "none" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"
                                }`}>
                                  {sortBankOrder === "asc" ? "↑" : sortBankOrder === "desc" ? "↓" : "↕"}
                                </span>
                              </button>
                            </th>
                            <th className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSortNameOrder("none");
                                  setSortBankOrder("none");
                                  setSortValueOrder("none");
                                  setSortDateOrder(o => o === "asc" ? "desc" : o === "desc" ? "none" : "asc");
                                }}
                                className="flex items-center gap-1.5 group transition-colors text-zinc-400 hover:text-zinc-200 mx-auto"
                                title={sortDateOrder === "asc" ? "Clique para mais novo primeiro" : sortDateOrder === "desc" ? "Clique para remover ordenação" : "Clique para mais antigo primeiro"}
                              >
                                <span className={sortDateOrder !== "none" ? "text-emerald-400" : ""}>VENCIMENTO</span>
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${
                                  sortDateOrder !== "none" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"
                                }`}>
                                  {sortDateOrder === "asc" ? "↑" : sortDateOrder === "desc" ? "↓" : "↕"}
                                </span>
                              </button>
                            </th>
                            <th className="px-4 py-3 text-center">TELEFONE (WHATSAPP)</th>
                            <th className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => { setSortNameOrder("none"); setSortBankOrder("none"); setSortDateOrder("none"); setSortValueOrder(o => o === "desc" ? "asc" : o === "asc" ? "none" : "desc"); }}
                                className="flex items-center gap-1.5 group transition-colors text-zinc-400 hover:text-zinc-200 ml-auto"
                                title={sortValueOrder === "desc" ? "Clique para menor primeiro" : sortValueOrder === "asc" ? "Clique para remover ordenação" : "Clique para maior primeiro"}
                              >
                                <span className={sortValueOrder !== "none" ? "text-emerald-400" : ""}>VALOR BASE (R$)</span>
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${
                                  sortValueOrder !== "none" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"
                                }`}>
                                  {sortValueOrder === "desc" ? "↓" : sortValueOrder === "asc" ? "↑" : "↕"}
                                </span>
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right bg-emerald-500/5 text-emerald-400">TOTAL + MULTA + JUROS (R$)</th>
                            {/* Tipo / Status — com filtros de categoria e status inline */}
                            <th className="px-4 py-2 text-center">
                              <div className="flex flex-col items-center gap-1.5">
                                <span>TIPO</span>
                                <div className="flex gap-1">
                                  <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className={`bg-zinc-900 border rounded-lg text-[9px] px-1.5 py-0.5 cursor-pointer transition-colors focus:outline-none normal-case tracking-normal font-normal ${categoryFilter !== "all" ? "border-emerald-500/50 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
                                  >
                                    <option value="all">Todos</option>
                                    <option value="vencidos">Vencidos</option>
                                    <option value="a_vencer">A vencer</option>
                                    <option value="liquidado">Liquidado</option>
                                  </select>
                                </div>
                              </div>
                            </th>
                            {/* Responsável — com filtro inline */}
                            <th className="px-4 py-2">
                              <div className="flex flex-col gap-1.5">
                                <span>RESPONSÁVEL</span>
                                <select
                                  value={repFilter}
                                  onChange={(e) => setRepFilter(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`bg-zinc-900 border rounded-lg text-[9px] px-1.5 py-0.5 cursor-pointer transition-colors focus:outline-none normal-case tracking-normal font-normal w-full ${repFilter !== "all" ? "border-emerald-500/50 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
                                >
                                  <option value="all">Todos</option>
                                  <option value="unassigned">Não atribuído</option>
                                  {representatives.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                              </div>
                            </th>
                            <th className="px-4 py-3">OBSERVAÇÕES</th>
                            <th className="px-4 py-3 text-center">BOLETO PDF</th>
                            <th className="px-5 py-3 text-right">AÇÃO</th>
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
                                  <td className={`px-3 py-4 sticky left-0 z-[5] ${selectedDebtorIds.has(d.id) ? "bg-emerald-950/60" : "bg-zinc-950"} backdrop-blur-sm`}>
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
                                  <td className={`px-5 py-4 font-bold text-white min-w-[160px] sticky left-8 z-[5] ${selectedDebtorIds.has(d.id) ? "bg-emerald-950/60" : "bg-zinc-950"} backdrop-blur-sm shadow-[2px_0_8px_rgba(0,0,0,0.4)]`}>
                                    <input
                                      type="text"
                                      value={d.client}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "client", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-bold text-white"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono text-zinc-400">
                                    <input
                                      type="text"
                                      value={d.document}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "document", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-20 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono"
                                    />
                                  </td>
                                  <td className="px-4 py-4 min-w-[90px]">
                                    <input
                                      type="text"
                                      value={d.bank || ""}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "bank", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      placeholder="—"
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded px-1.5 py-1 text-zinc-400"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono">
                                    <input
                                      type="text"
                                      value={d.dueDate}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "dueDate", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-22 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-center font-mono">
                                    <input
                                      type="text"
                                      value={d.phone || ""}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "phone", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      placeholder="Ex: 5577999998888"
                                      className="w-32 text-center bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-mono text-xs text-zinc-300 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-4 text-right font-mono">
                                    <div className="inline-flex items-center justify-end">
                                      <span className="text-zinc-500 text-xs mr-px">R$</span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editingValueDebtorId === d.id
                                          ? String(d.value)
                                          : d.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        onFocus={() => setEditingValueDebtorId(d.id)}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/[^\d,]/g, "").replace(",", ".");
                                          const num = parseFloat(raw);
                                          updateDebtorFieldLocal(d.id, "value", isNaN(num) ? 0 : num);
                                        }}
                                        onBlur={() => { setEditingValueDebtorId(null); saveDebtorFieldToDB(d.id); }}
                                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                        className="w-24 text-right bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                      />
                                    </div>
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
                                  <td className="px-4 py-4 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setNotesPopover({ debtorId: d.id, draft: d.notes || "" })}
                                      title={d.notes ? d.notes : "Adicionar observação"}
                                      className={`relative inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all ${
                                        d.notes
                                          ? "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 border border-amber-400/40 shadow-[0_0_6px_rgba(251,191,36,0.25)]"
                                          : "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 border border-transparent"
                                      }`}
                                    >
                                      {d.notes
                                        ? <MessageSquare className="w-3.5 h-3.5 fill-amber-400/30" />
                                        : <MessageSquare className="w-3.5 h-3.5" />
                                      }
                                      {d.notes && (
                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 border border-zinc-950" />
                                      )}
                                    </button>
                                  </td>
                                  {/* ── Coluna PDF ─────────────────────────── */}
                                  <td className="px-3 py-4 text-center min-w-[110px]">
                                    <div className="flex items-center justify-center gap-1.5">
                                      {uploadingPdfDebtorId === d.id ? (
                                        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                                          Enviando…
                                        </span>
                                      ) : d.driveFileId ? (
                                        <>
                                          {d.driveFileUrl ? (
                                            <a
                                              href={d.driveFileUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors max-w-[70px] truncate"
                                              title={d.driveFileName || "boleto.pdf"}
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <ExternalLink className="w-3 h-3 shrink-0" />
                                              <span className="truncate">{d.driveFileName || "PDF"}</span>
                                            </a>
                                          ) : (
                                            <span className="text-[10px] font-mono text-emerald-400 truncate max-w-[70px]" title={d.driveFileName || "boleto.pdf"}>
                                              📎 {d.driveFileName || "PDF"}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); void handlePdfRemove(d.id); }}
                                            className="text-zinc-600 hover:text-rose-400 transition-colors p-0.5 rounded shrink-0"
                                            title="Remover PDF"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <label
                                            htmlFor={`pdf-tbl-${d.id}`}
                                            className="flex items-center gap-1 text-[10px] font-mono text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer"
                                            title="Anexar boleto PDF"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Upload className="w-3 h-3" />
                                            <span>Anexar</span>
                                          </label>
                                          <input
                                            id={`pdf-tbl-${d.id}`}
                                            type="file"
                                            accept=".pdf,application/pdf"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) void handlePdfUpload(d.id, file);
                                              e.target.value = "";
                                            }}
                                          />
                                        </>
                                      )}
                                    </div>
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
                                        Cobrar
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

                </div>{/* end space-y-8 */}

                {/* ── Modal: Sincronizar com Google Sheets ─────────────────── */}
                {showExportSheetsModal && (
                  <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={(e) => e.target === e.currentTarget && setShowExportSheetsModal(false)}
                  >
                    <div className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-md">
                      {/* Header */}
                      <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                          <CloudLightning className="w-5 h-5 text-sky-400" />
                          <h3 className="text-base font-bold text-white">Sincronizar com Google Sheets</h3>
                        </div>
                        <button onClick={() => setShowExportSheetsModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Body */}
                      <div className="p-5 space-y-4">
                        <p className="text-xs text-zinc-400">
                          Envia todos os registros da Visão Geral para a aba indicada da planilha. O conteúdo existente nessa aba será substituído.
                        </p>

                        <div className="space-y-3">
                          <div>
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-1">URL da Planilha *</label>
                            <input
                              type="text"
                              value={exportSheetUrl}
                              onChange={(e) => { setExportSheetUrl(e.target.value); if (sheetsExportResult?.status === "payload_invalido") setSheetsExportResult(null); }}
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              className={`w-full bg-zinc-950 border rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500 ${!exportSheetUrl.trim() ? "border-rose-500/60" : "border-zinc-800"}`}
                            />
                            {!exportSheetUrl.trim() && (
                              <p className="text-[10px] text-rose-400 mt-1 font-semibold">Cole a URL da planilha para continuar.</p>
                            )}
                            <p className="text-[10px] text-zinc-600 mt-1">
                              A planilha deve estar compartilhada com{" "}
                              <span className="text-sky-400 font-mono select-all">{import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "—"}</span>{" "}
                              com permissão de <strong>Editor</strong>.
                            </p>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-1">Nome da Aba</label>
                            <input
                              type="text"
                              value={exportSheetName}
                              onChange={(e) => setExportSheetName(e.target.value)}
                              placeholder="Visão Geral"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                            />
                            <p className="text-[10px] text-zinc-600 mt-1">Deixe em branco para usar "Visão Geral" como padrão.</p>
                          </div>
                        </div>

                        {/* Result feedback */}
                        {sheetsExportResult && (
                          <div className={`rounded-2xl border px-4 py-3 text-xs space-y-1 ${
                            sheetsExportResult.success
                              ? "border-sky-500/20 bg-sky-500/8 text-sky-200"
                              : "border-rose-500/20 bg-rose-500/8 text-rose-200"
                          }`}>
                            {sheetsExportResult.success ? (
                              <>
                                <div className="font-bold text-sky-300">✓ Sincronização concluída</div>
                                <div>{sheetsExportResult.rowsExported} de {sheetsExportResult.rowsTotal} registros exportados</div>
                                {sheetsExportResult.sheetName && (
                                  <div className="text-sky-400/70">Aba: {sheetsExportResult.sheetName}</div>
                                )}
                              </>
                            ) : (
                              <>
                                <div className="font-bold text-rose-300">✗ Falha na exportação</div>
                                <div className="text-rose-200/80">{sheetsExportResult.error ?? "Erro desconhecido."}</div>
                              </>
                            )}
                          </div>
                        )}

                        <button
                          onClick={() => void handleExportToSheets()}
                          disabled={isExportingSheets || !exportSheetUrl.trim()}
                          className="w-full py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isExportingSheets ? (
                            <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Exportando {debtors.length} registros...</>
                          ) : (
                            <><CloudLightning className="w-3.5 h-3.5" /> Exportar {debtors.length} registros para Sheets</>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Modal: Adicionar Devedor Manualmente ──────────────────── */}
                {showAddDebtorModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && setShowAddDebtorModal(false)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-lg">
                      <div className="flex items-center justify-between p-5 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                          <PlusCircle className="w-5 h-5 text-emerald-400" />
                          <h3 className="text-base font-bold text-white">Adicionar Devedor Manualmente</h3>
                        </div>
                        <button
                          onClick={() => setShowAddDebtorModal(false)}
                          className="text-zinc-500 hover:text-white transition-colors p-1"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <form onSubmit={(e) => void handleAddDebtorManually(e)} className="p-5 space-y-4">

                        {/* Categoria */}
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold flex items-center gap-1.5">
                            <FileCheck2 className="w-3 h-3" />
                            Tipo de arquivo
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { value: "vencidos",  label: "Vencidos",   description: "Títulos já vencidos — cobráveis com juros e multa", inactive: "border-zinc-700 text-zinc-400 hover:border-rose-500/50 hover:text-rose-300",    active: "border-rose-500 bg-rose-500/10 text-rose-300" },
                              { value: "a_vencer",  label: "A vencer",   description: "Títulos a vencer — aviso preventivo amigável",       inactive: "border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-300",   active: "border-amber-500 bg-amber-500/10 text-amber-300" },
                              { value: "liquidado", label: "Liquidação", description: "Títulos pagos — reconciliação, SEM cobrança",        inactive: "border-zinc-700 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-300", active: "border-emerald-500 bg-emerald-500/10 text-emerald-300" },
                            ] as const).map(cat => (
                              <button
                                key={cat.value}
                                type="button"
                                onClick={() => setAddDebtorForm(f => ({ ...f, category: cat.value }))}
                                className={`px-2.5 py-2.5 rounded-xl border transition-all text-left ${addDebtorForm.category === cat.value ? cat.active : cat.inactive}`}
                              >
                                <div className="font-semibold text-xs">{cat.label}</div>
                                <div className="text-[9px] opacity-70 mt-0.5 leading-tight">{cat.description}</div>
                              </button>
                            ))}
                          </div>
                          {addDebtorForm.category === "liquidado" && (
                            <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-2.5">
                              <HandCoins className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                              <span>Registro será salvo como <strong>liquidado</strong> — sem cobrança.</span>
                            </div>
                          )}
                        </div>

                        {/* Nome + Fornecedor */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Nome do Cliente *</label>
                            <input
                              type="text"
                              required
                              value={addDebtorForm.client}
                              onChange={e => setAddDebtorForm(f => ({ ...f, client: e.target.value }))}
                              placeholder="João Silva Ltda"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Fornecedor / S.A.</label>
                            <input
                              type="text"
                              value={addDebtorForm.supplier}
                              onChange={e => setAddDebtorForm(f => ({ ...f, supplier: e.target.value }))}
                              placeholder="Distribuidora Alfa"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Documento + Vencimento */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Nº Documento</label>
                            <input
                              type="text"
                              value={addDebtorForm.document}
                              onChange={e => setAddDebtorForm(f => ({ ...f, document: e.target.value }))}
                              placeholder="1082-3"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Vencimento * (DD/MM/AAAA)</label>
                            <input
                              type="text"
                              required
                              value={addDebtorForm.dueDate}
                              onChange={e => setAddDebtorForm(f => ({ ...f, dueDate: e.target.value }))}
                              placeholder="15/06/2026"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Valor + Telefone */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Valor (R$) *</label>
                            <input
                              type="text"
                              required
                              value={addDebtorForm.value}
                              onChange={e => setAddDebtorForm(f => ({ ...f, value: e.target.value }))}
                              placeholder="1.250,00"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block">Telefone WhatsApp</label>
                            <input
                              type="text"
                              value={addDebtorForm.phone}
                              onChange={e => setAddDebtorForm(f => ({ ...f, phone: e.target.value }))}
                              placeholder="5511999990001"
                              className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Sugestão: cliente já cadastrado com telefone salvo */}
                        {(() => {
                          const match = contactsByKey.get(contactKeyFromName(addDebtorForm.client));
                          const phoneEmpty = addDebtorForm.phone.replace(/\D/g, "").length < 10;
                          if (!match || !match.phone || !phoneEmpty || addDebtorForm.client.trim().length < 3) return null;
                          return (
                            <div className="flex items-start gap-2.5 text-xs bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                              <UserCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-emerald-200">
                                  <span className="font-bold">{match.clientName}</span> já está cadastrado no sistema. Deseja preencher os dados automaticamente?
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setAddDebtorForm(f => ({ ...f, phone: match.phone }))}
                                  className="mt-2 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                                >
                                  <Check className="w-3 h-3" strokeWidth={3} /> Preencher telefone ({match.phone})
                                </button>
                              </div>
                            </div>
                          );
                        })()}

                        {addDebtorError && (
                          <div className="flex items-start gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            {addDebtorError}
                          </div>
                        )}

                        <div className="flex gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setShowAddDebtorModal(false)}
                            className="flex-1 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm font-medium transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={addDebtorSaving}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            {addDebtorSaving
                              ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Salvando…</>
                              : <><PlusCircle className="w-4 h-4" /> Adicionar Devedor</>
                            }
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
                </>
              )}

              {currentTab === "cobranca" && (
                <div className="space-y-8">

                  {/* ── Boletos do Google Drive ──────────────────────────────── */}
                  <div className="bg-zinc-900/40 border border-zinc-900 p-5 rounded-3xl space-y-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-emerald-400" /> Boletos do Google Drive
                        </h4>
                        <p className="text-xs text-zinc-500 font-light max-w-xl">
                          Conecte a pasta de boletos do Drive. O sistema casa por nome do cliente + número do documento e sugere anexar o boleto encontrado a cada devedor.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleMatchDriveFiles()}
                        disabled={isDriveMatching || !driveFolderStatus?.configured}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                        title={driveFolderStatus?.configured ? "Buscar boletos correspondentes no Drive" : "Configure a pasta do Drive primeiro"}
                      >
                        {isDriveMatching
                          ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Buscando…</>
                          : <><Search className="w-3.5 h-3.5" /> Buscar boletos no Drive</>}
                      </button>
                    </div>

                    {/* Status da pasta */}
                    {driveFolderStatus?.configured && !editingDriveFolder ? (
                      <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2">
                        <FolderOpen className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span className="truncate flex-1">
                          Pasta: <span className="text-zinc-200 font-medium">{driveFolderStatus.folderName || "Drive"}</span> · {driveFolderStatus.fileCount} arquivo(s)
                          {driveFolderStatus.indexing
                            ? <span className="text-sky-300"> · indexando conteúdo {driveFolderStatus.contentIndexed ?? 0}/{driveFolderStatus.fileCount}…</span>
                            : ` · ${driveFolderStatus.contentIndexed ?? driveFolderStatus.fileCount} lido(s)`}
                          {driveFolderStatus.unmatchedDebtors > 0 && ` · ${driveFolderStatus.unmatchedDebtors} sem boleto`}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleSyncDriveFolder()}
                          disabled={isDriveSyncing}
                          className="text-sky-400 hover:text-sky-300 disabled:opacity-50 font-semibold inline-flex items-center gap-1 flex-shrink-0 transition-colors"
                          title="Revarrer a pasta e atualizar o índice"
                        >
                          <RefreshCw className={`w-3 h-3 ${isDriveSyncing ? "animate-spin" : ""}`} /> {isDriveSyncing ? "Indexando…" : "Reindexar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDriveFolderUrl(""); setDriveSaveMsg(null); setEditingDriveFolder(true); }}
                          className="text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 flex-shrink-0 transition-colors"
                          title="Trocar a pasta do Google Drive"
                        >
                          <Pencil className="w-3 h-3" /> Trocar pasta
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={driveFolderUrl}
                            onChange={(e) => setDriveFolderUrl(e.target.value)}
                            placeholder="Cole a URL da nova pasta do Google Drive…"
                            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveDriveFolder()}
                            disabled={isDriveSaving || !driveFolderUrl.trim()}
                            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 text-xs font-semibold border border-zinc-700 transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            {isDriveSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : (driveFolderStatus?.configured ? "Salvar nova pasta" : "Conectar pasta")}
                          </button>
                          {driveFolderStatus?.configured && (
                            <button
                              type="button"
                              onClick={() => { setEditingDriveFolder(false); setDriveFolderUrl(""); setDriveSaveMsg(null); }}
                              className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 text-xs transition-colors whitespace-nowrap"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        {driveFolderStatus?.configured && (
                          <p className="text-[10px] text-zinc-500">
                            Pasta atual: <span className="text-zinc-400">{driveFolderStatus.folderName || "Drive"}</span>. A nova pasta substituirá a atual e será reindexada.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Mensagens */}
                    {driveSaveMsg && (
                      <div className={`text-[11px] rounded-lg px-3 py-2 border ${driveSaveMsg.ok ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-300 bg-rose-500/10 border-rose-500/20"}`}>
                        {driveSaveMsg.text}
                      </div>
                    )}
                    {driveMatchResult && !driveMatchResult.success && (
                      <div className="text-[11px] rounded-lg px-3 py-2 border text-rose-300 bg-rose-500/10 border-rose-500/20">
                        {DRIVE_STATUS_LABELS[driveMatchResult.status] ?? driveMatchResult.error}
                      </div>
                    )}
                    {driveMatchResult && driveMatchResult.success && (
                      <div className="text-[11px] rounded-lg px-3 py-2 border text-emerald-300 bg-emerald-500/10 border-emerald-500/20">
                        {driveMatchResult.debtorsMatched > 0
                          ? `Encontramos ${driveMatchResult.debtorsMatched} boleto(s) — confirme "Anexar" em cada devedor abaixo.`
                          : "Nenhum boleto correspondente encontrado na pasta."}
                      </div>
                    )}
                    {driveBoletoMsg && (
                      <div className={`text-[11px] rounded-lg px-3 py-2 border ${driveBoletoMsg.ok ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-300 bg-rose-500/10 border-rose-500/20"}`}>
                        {driveBoletoMsg.text}
                      </div>
                    )}
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
                            const isEditingPhone = editingPhoneDebtorId === d.id;

                            return (
                              <div
                                key={d.id}
                                className={`w-full p-3.5 rounded-2xl border text-left transition-all
                                  ${isSelected
                                    ? "bg-emerald-500/10 border-emerald-500/80 shadow-[0_4px_15px_rgba(16,185,129,0.15)]"
                                    : "bg-zinc-950 border-zinc-900 hover:border-zinc-800"
                                  }
                                `}
                              >
                                <button
                                  type="button"
                                  onClick={() => setSelectedDebtorForMessage(d)}
                                  className="w-full flex items-center justify-between cursor-pointer"
                                >
                                  <div className="space-y-1 select-none text-left">
                                    <div className="text-xs font-pro font-black text-white">{d.client}</div>
                                    <div className="text-[10px] text-zinc-400 font-light font-mono flex items-center gap-1">
                                      <span>Doc: {d.document}</span> · <span>{d.dueDate}</span>
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
                                        ✓ Enviado
                                      </span>
                                    ) : (
                                      <span className="text-[9px] text-zinc-500 font-light">Pendente</span>
                                    )}
                                  </div>
                                </button>

                                {/* Inline phone edit row */}
                                <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center gap-2">
                                  {isEditingPhone ? (
                                    <>
                                      <input
                                        type="text"
                                        value={editingPhoneValue}
                                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") void saveCobrancaPhone(d.id); if (e.key === "Escape") setEditingPhoneDebtorId(null); }}
                                        autoFocus
                                        className="flex-1 bg-zinc-900 border border-emerald-500/40 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none"
                                        placeholder="5577999998888"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void saveCobrancaPhone(d.id)}
                                        className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                                      >
                                        OK
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPhoneDebtorId(null)}
                                        className="text-zinc-500 hover:text-zinc-300 text-[10px] px-1 transition-colors"
                                      >
                                        ✕
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-mono text-zinc-500 flex-1 truncate">{d.phone || "(sem telefone)"}</span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingPhoneValue(d.phone || ""); setEditingPhoneDebtorId(d.id); }}
                                        className="text-zinc-600 hover:text-emerald-400 transition-colors p-0.5 rounded"
                                        title="Editar telefone"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>

                                {/* PDF attachment row */}
                                <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center gap-2 min-w-0">
                                  {uploadingPdfDebtorId === d.id ? (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-1">
                                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                                      Enviando PDF…
                                    </span>
                                  ) : importingBoletoId === d.id ? (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-1">
                                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                                      Importando do Drive…
                                    </span>
                                  ) : (d.driveFileId && d.driveFileId !== "uploaded") ? (
                                    /* Estado SUGERIDO — achado no Drive, aguardando confirmação */
                                    <div className="flex-1 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-[10px] text-sky-300 flex items-center gap-1 truncate" title={d.driveFileName || "boleto.pdf"}>
                                        <HardDrive className="w-3 h-3 flex-shrink-0" />
                                        Achamos o boleto no Drive{typeof d.driveMatchScore === "number" ? ` (${Math.round(d.driveMatchScore * 100)}%)` : ""}: {d.driveFileName || "boleto.pdf"}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); void handleAttachDriveBoleto(d.id); }}
                                          className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold transition-all inline-flex items-center gap-1"
                                        >
                                          <Check className="w-3 h-3" strokeWidth={3} /> Anexar
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); void handleIgnoreDriveBoleto(d.id); }}
                                          className="px-2 py-0.5 rounded text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 text-[10px] transition-colors"
                                        >
                                          Ignorar
                                        </button>
                                      </div>
                                    </div>
                                  ) : d.driveFileId === "uploaded" ? (
                                    <>
                                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 flex-1 truncate" title={d.driveFileName || "boleto.pdf"}>
                                        📎 {d.driveFileName || "boleto.pdf"}
                                      </span>
                                      {d.driveFileUrl && (
                                        <a
                                          href={d.driveFileUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-zinc-500 hover:text-emerald-400 transition-colors p-0.5 rounded"
                                          title="Visualizar PDF"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); void handlePdfRemove(d.id); }}
                                        className="text-zinc-600 hover:text-rose-400 transition-colors p-0.5 rounded"
                                        title="Remover PDF"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] font-mono text-zinc-600 flex-1 truncate">Sem boleto PDF</span>
                                      <label
                                        htmlFor={`pdf-upload-${d.id}`}
                                        className="text-zinc-500 hover:text-emerald-400 transition-colors p-0.5 rounded cursor-pointer"
                                        title="Anexar PDF do boleto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Upload className="w-3 h-3" />
                                      </label>
                                      <input
                                        id={`pdf-upload-${d.id}`}
                                        type="file"
                                        accept=".pdf,application/pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) void handlePdfUpload(d.id, file);
                                          e.target.value = "";
                                        }}
                                      />
                                    </>
                                  )}
                                </div>
                              </div>
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
                                "Enviando cobrança..."
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
                          <p className="text-xs text-zinc-500 mt-1 max-w-sm">Selecione uma fatura ativa ou inadimplente na lista ao lado para desenhar e projetar a régua de cobrança perfeita.</p>
                          <button
                            type="button"
                            onClick={() => setCurrentTab("visao_geral")}
                            className="mt-4 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" /> Ir para a Visão Geral
                          </button>
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
                        <span className="text-xs uppercase tracking-wider text-zinc-400 block">Total de Disparos</span>
                        <span className="text-xl font-bold text-white font-mono whitespace-nowrap">{billingLogs.length}</span>
                      </div>
                    </div>
                    
                    <div className="bg-zinc-900/40 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider text-zinc-400 block">Clientes Contatados</span>
                        <span className="text-xl font-bold text-white font-mono whitespace-nowrap">
                          {Array.from(new Set(billingLogs.map(log => log.document))).length}
                        </span>
                      </div>
                    </div>

                    <div className="bg-zinc-900/40 border border-zinc-900/80 p-5 rounded-2xl shadow-lg flex items-center gap-4">
                      <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs uppercase tracking-wider text-zinc-400 block">Faturamento Notificado</span>
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
                              console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao limpar historico.');
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
                                    <td className="px-5 py-4 font-mono text-zinc-500 text-[11px]">
                                      {log.dateSent
                                        ? new Date(log.dateSent).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                                        : "—"}
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="font-bold text-white text-xs">{log.client}</div>
                                      <div className="text-[10px] text-zinc-500 font-mono">Doc: {log.document} · Tel: {log.phone}</div>
                                    </td>
                                    <td className="px-5 py-4">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-medium font-mono text-emerald-400 bg-emerald-500/5 border border-emerald-500/10 px-2 py-0.5 rounded">
                                          WhatsApp Z-API
                                        </span>
                                        <span className={`text-[9px] uppercase font-bold font-mono px-1.5 py-0.5 rounded
                                          ${log.type === "auto" ? "bg-purple-500/10 text-purple-400" : log.type === "lote" ? "bg-emerald-500/10 text-emerald-400" : "bg-blue-500/10 text-blue-400"}
                                        `}>
                                          {log.type === "auto" ? "Robô" : log.type === "lote" ? "Lote" : "Manual"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-5 py-4 text-right font-mono text-emerald-300 font-semibold">{formatBRL(log.value)}</td>
                                    <td className="px-5 py-4 text-center">
                                      {(log.status === "sucesso" || log.status === "sent") ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded font-mono font-semibold">
                                          ✓ Sucesso
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
                                          ✗ Erro
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
                      <button onClick={() => setAutomationError("")} className="text-rose-400 hover:text-rose-200 text-xs cursor-pointer">✕</button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Bot className="w-5 h-5 text-emerald-400" /> Regras de Automação
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        As cobranças automáticas são enviadas todos os dias às 08h (horário de Brasília), conforme as regras ativas abaixo.
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
                            onChange={(e) => {
                              const tone = e.target.value as AutomationRuleCreate["messageTone"];
                              setNewRuleForm((p) => ({ ...p, messageTone: tone, customMessage: getMessageTemplate(tone ?? "neutro") }));
                            }}
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
                                Janela de Envio — Início <span className="text-purple-400">(Premium)</span>
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
                                Janela de Envio — Fim <span className="text-purple-400">(Premium)</span>
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

                        {/* Frequência de envio */}
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-2 uppercase tracking-wider">Dias de Envio</label>
                          <div className="flex gap-2">
                            {([ ["daily", "Todos os dias"], ["weekdays", "Só dias úteis (Seg–Sex)"] ] as const).map(([val, label]) => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => setNewRuleForm((p) => ({ ...p, scheduleMode: val }))}
                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                  (newRuleForm.scheduleMode ?? "daily") === val
                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                                    : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Pular feriados */}
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] text-zinc-400 mb-2 uppercase tracking-wider">Feriados Nacionais</label>
                          <button
                            type="button"
                            onClick={() => setNewRuleForm((p) => ({ ...p, skipHolidays: !(p.skipHolidays ?? false) }))}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                              (newRuleForm.skipHolidays ?? false)
                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                                : "bg-zinc-950 border-zinc-700 text-zinc-400 hover:text-zinc-200"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${(newRuleForm.skipHolidays ?? false) ? "bg-amber-400" : "bg-zinc-600"}`} />
                            {(newRuleForm.skipHolidays ?? false) ? "Pular feriados ativado" : "Enviar também em feriados"}
                          </button>
                          {/* Aviso se hoje for feriado */}
                          {isBrazilHoliday() && (
                            <p className="mt-1.5 text-[10px] text-amber-400/80">
                              Hoje é feriado nacional: {getBrazilHolidayName()}.
                              {(newRuleForm.skipHolidays ?? false) ? " Esta regra não disparará hoje." : " Esta regra disparará normalmente."}
                            </p>
                          )}
                          {!isBrazilHoliday() && (newRuleForm.scheduleMode ?? "daily") === "weekdays" && !isBusinessDay() && (
                            <p className="mt-1.5 text-[10px] text-zinc-500">
                              Hoje é fim de semana — esta regra não disparará hoje.
                            </p>
                          )}
                        </div>

                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-[11px] text-zinc-400 uppercase tracking-wider">
                              Mensagem
                            </label>
                            <button
                              type="button"
                              onClick={() => setNewRuleForm((p) => ({ ...p, customMessage: getMessageTemplate(p.messageTone ?? "neutro") }))}
                              className="text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors underline underline-offset-2"
                            >
                              Restaurar template padrão
                            </button>
                          </div>
                          <textarea
                            rows={7}
                            value={newRuleForm.customMessage ?? ""}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, customMessage: e.target.value || null }))}
                            placeholder="Olá {nome_cliente}, ..."
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 resize-none font-mono text-xs leading-relaxed"
                          />
                        </div>

                        {/* Matching clients preview */}
                        <div className="sm:col-span-2">
                          {(() => {
                            const ruleType = newRuleForm.ruleType ?? "overdue";
                            const daysBefore = newRuleForm.daysBefore ?? 3;
                            let matchCount = 0;

                            if (ruleType === "overdue") {
                              matchCount = debtors.filter(d => d.category === "vencidos" && d.status !== "sent").length;
                            } else if (ruleType === "all_pending") {
                              matchCount = debtors.filter(d => d.category !== "liquidado").length;
                            } else if (ruleType === "due_in_days") {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const limitDate = new Date(today);
                              limitDate.setDate(limitDate.getDate() + daysBefore);
                              matchCount = debtors.filter(d => {
                                if (d.category !== "a_vencer") return false;
                                const parts = d.dueDate?.split("/");
                                if (!parts || parts.length !== 3) return false;
                                const due = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                                return due >= today && due <= limitDate;
                              }).length;
                            } else if (ruleType === "due_today") {
                              const todayStr = new Date().toLocaleDateString("pt-BR");
                              matchCount = debtors.filter(d => d.dueDate === todayStr && d.category !== "liquidado").length;
                            }

                            return (
                              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-xs text-emerald-300">
                                <span><strong>{matchCount}</strong> cliente(s) se enquadram nesta regra atualmente</span>
                              </div>
                            );
                          })()}
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
                          {/* Animated slide toggle */}
                          <button
                            onClick={() => void handleToggleRule(rule.id, !rule.enabled)}
                            title={rule.enabled ? "Desativar regra" : "Ativar regra"}
                            className="flex-shrink-0 cursor-pointer focus:outline-none group"
                            role="switch"
                            aria-checked={rule.enabled}
                          >
                            <div className={`relative w-11 h-6 rounded-full transition-colors duration-300 ease-in-out ${
                              rule.enabled ? "bg-emerald-500" : "bg-zinc-700 group-hover:bg-zinc-600"
                            }`}>
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ease-in-out ${
                                rule.enabled ? "translate-x-5" : "translate-x-0"
                              }`} />
                            </div>
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
                              {plan === "basic" && rule.enabled && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border bg-amber-500/10 border-amber-500/30 text-amber-400" title="Automações requerem plano Pro ou Premium. Esta regra não será executada.">
                                  BLOQUEADA · upgrade necessário
                                </span>
                              )}
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 font-mono">
                                {RULE_TYPE_LABELS[rule.ruleType]}
                                {rule.ruleType === "due_in_days" && rule.daysBefore != null && ` (${rule.daysBefore}d)`}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 capitalize">
                                {rule.messageTone === "amigavel" ? "Amigável" : rule.messageTone === "neutro" ? "Neutro" : rule.messageTone === "firme" ? "Firme" : "Jurídico"}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 mt-1.5 text-[11px] text-zinc-500 font-mono">
                              <span>{rule.scheduleMode === "weekdays" ? "Seg–Sex" : "Todo dia"}</span>
                              {rule.skipHolidays && <span>Pula feriados</span>}
                              {rule.sendWindowStart && rule.sendWindowEnd && (
                                <span>Janela: {rule.sendWindowStart}–{rule.sendWindowEnd}</span>
                              )}
                              {rule.maxDailySends != null && (
                                <span>Limite: máx {rule.maxDailySends}/dia</span>
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
                        <History className="w-4 h-4 text-emerald-400" /> Histórico
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
                              <th className="px-4 py-3">Executado em</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Devedores Elegíveis</th>
                              <th className="px-4 py-3 text-right">Cobranças Criadas</th>
                              <th className="px-4 py-3 text-right">Ignorados</th>
                              <th className="px-4 py-3 text-right">Enviados</th>
                              <th className="px-4 py-3 text-right">Erros</th>
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
                                    {run.status === "success" ? "CONCLUÍDO" : run.status === "running" ? "RODANDO" : run.status === "failed" ? "FALHOU" : run.status.toUpperCase()}
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

                  {/* ── Como usar Automações ── */}
                  <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 space-y-5">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-emerald-400" /> Como usar as Automações
                      </h4>
                      <p className="text-xs text-zinc-500">
                        Configure uma vez e o sistema cobra seus clientes automaticamente todos os dias.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {[
                        {
                          step: "1",
                          icon: <Upload className="w-4 h-4 text-emerald-400" />,
                          title: "Importe seus devedores",
                          desc: "Vá em Importar e carregue seu PDF ou planilha. O sistema extrai cliente, título, vencimento e valor automaticamente.",
                        },
                        {
                          step: "2",
                          icon: <Bot className="w-4 h-4 text-emerald-400" />,
                          title: "Crie uma regra",
                          desc: 'Clique em "Nova Regra", escolha o tipo (Vencidos, A Vencer…), o tom da mensagem e salve.',
                        },
                        {
                          step: "3",
                          icon: <Clock className="w-4 h-4 text-emerald-400" />,
                          title: "O robô age sozinho",
                          desc: "Todos os dias às 08h o scheduler verifica suas regras e envia cobranças via WhatsApp para os clientes elegíveis.",
                        },
                        {
                          step: "4",
                          icon: <History className="w-4 h-4 text-emerald-400" />,
                          title: "Acompanhe em Histórico",
                          desc: "Cada mensagem enviada aparece na aba Histórico com status, tom e dados do cliente para auditoria completa.",
                        },
                      ].map(({ step, icon, title, desc }) => (
                        <div key={step} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold shrink-0">
                              {step}
                            </span>
                            {icon}
                            <span className="text-xs font-semibold text-white">{title}</span>
                          </div>
                          <p className="text-[11px] text-zinc-500 leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-2.5 bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
                      <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        <span className="text-emerald-400 font-medium">Deduplicação automática:</span> o sistema nunca envia duas cobranças para o mesmo cliente dentro de 20 horas, evitando spam mesmo que a regra rode todos os dias.
                      </p>
                    </div>
                  </div>

                </div>
              )}

            </div>

            <footer className="border-t border-zinc-900 bg-zinc-950 py-6 text-zinc-600 text-[10px] text-center">
              <span>NC Finance • {new Date().getFullYear()} NC Finance.</span>
            </footer>

          </main>

          {/* ── Popover: Observação do Devedor ── */}
          {notesPopover && (() => {
            const debtor = debtors.find(d => d.id === notesPopover.debtorId);
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                onMouseDown={(e) => { if (e.target === e.currentTarget) setNotesPopover(null); }}
              >
                <div
                  className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-3"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                      Observação — <span className="text-zinc-400 font-normal truncate max-w-[180px]">{debtor?.client}</span>
                    </h3>
                    <button type="button" onClick={() => setNotesPopover(null)} className="text-zinc-500 hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    autoFocus
                    rows={5}
                    value={notesPopover.draft}
                    onChange={(e) => setNotesPopover(p => p ? { ...p, draft: e.target.value } : null)}
                    placeholder="Anotar follow-up, contato realizado, acordo..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const debtor = debtors.find(d => d.id === notesPopover.debtorId);
                        if (!debtor || !currentOwnerUserId) { setNotesPopover(null); return; }
                        const updated = { ...debtor, notes: notesPopover.draft };
                        setDebtors(prev => prev.map(d => d.id === updated.id ? updated : d));
                        setNotesPopover(null);
                        try {
                          await financeService.update(currentOwnerUserId, updated);
                        } catch (err) {
                          console.error('[workspace]', err instanceof Error ? err.message : 'Falha ao salvar observação.');
                        }
                      }}
                      className="flex-1 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      Salvar
                    </button>
                    {notesPopover.draft && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setNotesPopover(p => p ? { ...p, draft: "" } : null); }}
                        className="px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition-colors"
                        title="Limpar observação"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── Modal: Documentos Duplicados na Importação ── */}
          {dupDocModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Documentos Duplicados Detectados
                </h3>
                <p className="text-xs text-zinc-400">
                  Os seguintes números de documento aparecem mais de uma vez no arquivo. Como deseja prosseguir?
                </p>
                <div className="bg-zinc-950 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
                  {dupDocModal.dupes.map(({ doc, count }) => (
                    <div key={doc} className="flex items-center justify-between text-xs font-mono">
                      <span className="text-zinc-300">{doc}</span>
                      <span className="text-amber-400 font-bold">{count}× duplicado</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    onClick={() => void doSendToOverview(dupDocModal.pending, true)}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Salvar todos
                    <span className="block text-[10px] font-normal opacity-80">Duplicatas recebem sufixo -2, -3…</span>
                  </button>
                  <button
                    onClick={() => void doSendToOverview(dupDocModal.pending, false)}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                  >
                    Manter só o primeiro
                    <span className="block text-[10px] font-normal opacity-80">Descarta os registros duplicados</span>
                  </button>
                </div>
                <button
                  onClick={() => setDupDocModal(null)}
                  className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors pt-1"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Modal Global: Gerenciar Responsáveis (acessível de qualquer aba) ── */}
          {showRepModal && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={(e) => e.target === e.currentTarget && setShowRepModal(false)}
            >
              <div className="bg-zinc-900 border border-zinc-700 rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-zinc-800 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-bold text-white">Responsáveis Ativos</h3>
                  </div>
                  <button onClick={() => setShowRepModal(false)} className="text-zinc-500 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 p-5 space-y-2">
                  {representatives.length === 0 ? (
                    <p className="text-xs text-zinc-500 text-center py-4">Nenhum responsável cadastrado.</p>
                  ) : representatives.map((r) => {
                    const assignedCount = debtors.filter((d) => d.representativeId === r.id).length;
                    return (
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800 gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${r.color}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-zinc-200 truncate">{r.name}</p>
                            <p className="text-[10px] text-zinc-500">{r.role} · {assignedCount} devedor{assignedCount !== 1 ? "es" : ""}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => void handleDeleteRep(r.id)}
                          className="text-zinc-600 hover:text-rose-400 transition-colors flex-shrink-0 p-1 rounded"
                          title="Excluir responsável"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Add form */}
                <div className="border-t border-zinc-800 p-5 space-y-3 flex-shrink-0">
                  <p className="text-xs font-bold text-zinc-300">Adicionar novo responsável</p>
                  {repModalError && (
                    <p className="text-xs text-rose-400">{repModalError}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">Nome *</label>
                      <input
                        type="text"
                        value={repModalForm.name}
                        onChange={(e) => setRepModalForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ex: João Silva"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">Cargo</label>
                      <input
                        type="text"
                        value={repModalForm.role}
                        onChange={(e) => setRepModalForm((f) => ({ ...f, role: e.target.value }))}
                        placeholder="Ex: Cobrança"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">Telefone WhatsApp</label>
                    <input
                      type="text"
                      value={repModalForm.phone}
                      onChange={(e) => setRepModalForm((f) => ({ ...f, phone: e.target.value }))}
                      placeholder="5511999990000"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <button
                    onClick={() => void handleAddRepFromModal()}
                    disabled={isSavingRep}
                    className="w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSavingRep ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando...</>
                    ) : (
                      <><UserPlus className="w-3.5 h-3.5" /> Adicionar Responsável</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showSuporte && <Suporte onClose={() => setShowSuporte(false)} />}
        </>
      )}
    </div>
  );
}











