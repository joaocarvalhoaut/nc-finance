import { isValidDueDate, parseManualAmount } from "./utils/manualDebtorValidation";
import { CATEGORY_BADGE, CATEGORY_CYCLE, CATEGORY_LABEL, CATEGORY_TINT, cobraComoVencido } from "./config/categories";
import React, { useState, useEffect, useMemo, useCallback, lazy } from "react";
import * as XLSX from "xlsx";
import Sidebar from "./components/Sidebar";
import CountUp from "./components/CountUp";
const MinhaConta = lazy(() => import("./components/MinhaConta"));
import PasswordInput from "./components/PasswordInput";
import BoletoResponsibilityModal from "./components/BoletoResponsibilityModal";
const DeleteAccountModal = lazy(() => import("./components/DeleteAccountModal"));
import { addOptOuts } from "./services/optOutService";
import LandingPage from "./components/LandingPage";
import SubscriptionGate from "./components/SubscriptionGate";
import GerenciarAssinatura from "./components/GerenciarAssinatura";
import CompletarCadastro from "./components/CompletarCadastro";
import { fetchMyProfileOrThrow, isProfileComplete, type UserProfileData } from "./services/accountService";
const ClientDashboard = lazy(() => import("./components/ClientDashboard"));
import { PLAN_LIST, getPlanDefinition } from "./config/plans";
import { useAccount } from "./hooks/useAccount";
import { useSubscription } from "./hooks/useSubscription";
import { billingLogsService } from "./services/billingLogsService";
import { financeService } from "./services/financeService";
import { representativesService } from "./services/representativesService";
import { contactsService, contactKeyFromName, type Contact } from "./services/contactsService";
import { BillingError, subscriptionService } from "./services/subscriptionService";
import { isStripeLegacy, STRIPE_LEGACY_CUTOFF } from "../supabase/functions/_shared/billingStatus.ts";
import { userConfigService } from "./services/userConfigService";
import { whatsappService, SEND_STATUS_LABELS, type SendChargeStatus } from "./services/whatsappService";
import { googleSheetsService, type ImportResult as SheetsImportResult, type ExportResult as SheetsExportResult } from "./services/googleSheetsService";
import { googleDriveService, DRIVE_STATUS_LABELS, type DriveMatchResult, type DriveMatchStatus } from "./services/googleDriveService";
import { driveFolderService, type DriveFolderStatus } from "./services/driveMatching/driveFolderService";
import { whatsappBatchService, BATCH_TOP_STATUS_LABELS, type BatchChargeResult, type BatchTopStatus } from "./services/whatsappBatchService";
import { automationService, RULE_TYPE_LABELS, JOB_STATUS_COLORS, type AutomationRule, type AutomationRun, type AutomationRuleCreate } from "./services/automationService";
import { validateNewAutomationRule } from "./utils/automationValidation";
import { isBrazilHoliday, getBrazilHolidayName, isBusinessDay } from "./utils/brazilHolidays";
import { getMessageTemplate, fillMessageTemplate } from "./utils/messageTemplates";
import { aplicarEmpresa } from "../supabase/functions/_shared/assinatura.ts";
import { metricsService, type OperationalMetrics } from "./services/metricsService";
import {
  ACEITA_IMPORTACAO,
  extrairDeTexto,
  interpretarDocumento,
  lerArquivo,
  type DocumentoImportado,
  type LocalExtractionResult,
} from "./services/localDocumentExtraction";
import { normalizarDigitosTelefone } from "./services/localDocumentExtraction/regexExtractors";
import { exportRelatorio } from "./services/exportRelatorio";
const Suporte = lazy(() => import("./components/Suporte"));
import { PdfPreviewModal, openPdfPreview } from "./components/PdfPreviewModal";
import DriveHelpPopover from "./components/DriveHelpPopover";
import { 
  Debtor, 
  Representative, 
  BillingLog,
  PlanId,
  UserConfig,

  MessageTone,
  PatternMessage,
  SignUpPayload
} from "./types";
import { 
  Users, 
  UserPlus, 
  FileCheck2, 
  Trash2,
  Ban,
  PhoneOff,
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
  Archive,
  ArchiveRestore,
  Plus,
  PlusCircle,
  HelpCircle,

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
  HardDrive,
  Menu
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

Fico à disposição. Equipe financeira {empresa}.`
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

O título consta em aberto em nosso acompanhamento.
Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.

Atenciosamente, equipe financeira {empresa}.`
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
Equipe de cobrança {empresa}.`
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

Atenciosamente, departamento administrativo {empresa}.`
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

/**
 * Mescla os registros devolvidos pelo banco na lista em memoria.
 *
 * financeService.createMany faz UPSERT por (user_id, document_number). Quando o
 * documento ja existe, o banco ATUALIZA a linha e devolve ela com o id ANTIGO —
 * nao um id novo. Anexar esse retorno sem conferir colocava o mesmo id duas
 * vezes no array: a linha aparecia duplicada, o React avisava de key repetida e
 * a reconciliacao seguinte derrubava uma delas. Era o "duplica, some, fica um".
 *
 * Aqui o que ja esta na lista e atualizado no lugar, preservando a posicao, e so
 * o que e realmente novo entra.
 */
const mesclarDevedores = (
  anteriores: Debtor[],
  salvos: Debtor[],
  posicao: "inicio" | "fim",
): Debtor[] => {
  if (!salvos.length) return anteriores;

  const salvosPorId = new Map(salvos.map((d) => [d.id, d]));
  const atualizados = anteriores.map((d) => salvosPorId.get(d.id) ?? d);

  const idsExistentes = new Set(anteriores.map((d) => d.id));
  const novos = salvos.filter((d) => !idsExistentes.has(d.id));
  if (!novos.length) return atualizados;

  return posicao === "inicio" ? [...novos, ...atualizados] : [...atualizados, ...novos];
};

// Máscaras do cadastro manual: a pessoa digita só números.
const mascaraData = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
};
const mascaraTelefone = (v: string) => {
  let d = v.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // colado com DDI
  d = d.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
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
    resetPassword,
    updatePassword,
    passwordRecovery,
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
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [subscriptionGateError, setSubscriptionGateError] = useState("");
  // Plano à espera do CPF/CNPJ (cadastro sem documento) e modal de gerenciar.
  const [documentPromptPlanId, setDocumentPromptPlanId] = useState<PlanId | null>(null);
  const [showGerenciarAssinatura, setShowGerenciarAssinatura] = useState(false);
  // Cadastro (CPF, telefone, endereço): conta sem esses dados completa antes de
  // usar o sistema. Falha ao ler o perfil não obriga a preencher de novo.
  const [perfilCadastro, setPerfilCadastro] = useState<{ carregado: boolean; completo: boolean; perfil: UserProfileData | null }>(
    { carregado: false, completo: true, perfil: null },
  );
  // Nome da empresa que assina as cobranças ({empresa} nos modelos).
  const empresaAssinatura = perfilCadastro.perfil?.company_name ?? null;
  const carregarPerfilCadastro = useCallback(async (uid: string) => {
    try {
      const perfil = await fetchMyProfileOrThrow(uid);
      setPerfilCadastro({ carregado: true, completo: isProfileComplete(perfil), perfil });
    } catch {
      setPerfilCadastro({ carregado: true, completo: true, perfil: null });
    }
  }, []);
  useEffect(() => {
    if (!userId) { setPerfilCadastro({ carregado: false, completo: true, perfil: null }); return; }
    void carregarPerfilCadastro(userId);
  }, [userId, carregarPerfilCadastro]);

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
  const [importCategory, setImportCategory] = useState<"vencidos" | "a_vencer" | "recompra" | "liquidado">("vencidos");
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractedDebtors, setExtractedDebtors] = useState<Debtor[]>([]);
  const [extractedSelectedIds, setExtractedSelectedIds] = useState<Set<string>>(new Set());
  // Revisão da importação: leitura com dúvida (vem da extração) e registros
  // que a pessoa já conferiu ou corrigiu. O que precisa de revisão é calculado
  // ao vivo (pendenciasRevisao), então o contador baixa a cada correção.
  const [duvidaLeituraIds, setDuvidaLeituraIds] = useState<Set<string>>(new Set());
  const [conferidosIds, setConferidosIds] = useState<Set<string>>(new Set());
  const [flashedLowConfId, setFlashedLowConfId] = useState<string | null>(null);
  const lowConfCursorRef = React.useRef(0);
  const tableScrollRef = React.useRef<HTMLDivElement>(null);
  const tableDragRef = React.useRef({ isDown: false, startX: 0, scrollLeft: 0 });
  const [extractionAlert, setExtractionAlert] = useState<string>("");
  const [dupDocModal, setDupDocModal] = useState<{ pending: typeof extractedDebtors; dupes: { doc: string; count: number }[] } | null>(null);
  const [revisaoModal, setRevisaoModal] = useState<{ pending: typeof extractedDebtors; duvidosos: number } | null>(null);
  // Exclusão sempre confirmada: um cliente, ou a carteira inteira (com "EXCLUIR" digitado).
  const [excluirConfirm, setExcluirConfirm] = useState<{ tipo: "um"; debtor: Debtor } | { tipo: "todos"; total: number } | null>(null);
  const [excluirTexto, setExcluirTexto] = useState("");
  // Arquivados: fora da lista ativa (e de qualquer cobrança), numa área
  // própria da Carteira, de onde podem ser restaurados ou excluídos.
  const [arquivados, setArquivados] = useState<Debtor[]>([]);
  const [verArquivados, setVerArquivados] = useState(false);
  const [avisoArquivo, setAvisoArquivo] = useState<{ ids: string[]; texto: string; desfazerArquivando: boolean } | null>(null);
  const [addDupModal, setAddDupModal] = useState<{ novo: Debtor; existente: Debtor } | null>(null);
  const [notesPopover, setNotesPopover] = useState<{ debtorId: string; draft: string } | null>(null);
  const [isParsingImportFile, setIsParsingImportFile] = useState<boolean>(false);
  // Andamento da leitura (páginas do PDF, OCR) mostrado no campo do arquivo.
  const [importProgresso, setImportProgresso] = useState<string>("");
  // Arquivo já lido (tabelas + texto). Enquanto o texto da tela for o dele, a
  // extração usa as tabelas; se a pessoa editar o texto, vale o texto.
  const [importDoc, setImportDoc] = useState<DocumentoImportado | null>(null);
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
  // Importação em lote de boletos do Drive (Visão Geral)
  const [isAttachingAll, setIsAttachingAll] = useState<boolean>(false);
  const [attachAllProgress, setAttachAllProgress] = useState<{ done: number; total: number; ok: number } | null>(null);
  // Visualização do PDF do boleto: estado isolado em PdfPreviewModal (openPdfPreview)
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
  const [editingValueText, setEditingValueText] = useState("");
  const [debtorSaveError, setDebtorSaveError] = useState("");

  // PDF attachment in Cobrança tab
  const [uploadingPdfDebtorId, setUploadingPdfDebtorId] = useState<string | null>(null);
  // Boleto pendente aguardando a confirmação de responsabilidade (1ª vez).
  const [pendingBoletoPdf, setPendingBoletoPdf] = useState<{ debtorId: string; file: File } | null>(null);

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
  // Regra aberta no formulário para edição; null = formulário de nova regra.
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
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
  // Carteira: encargos (multa/juros) e "mais ações" abrem no lugar, sem ocupar a tela.
  const [showEncargos, setShowEncargos] = useState(false);
  const [showMaisCarteira, setShowMaisCarteira] = useState(false);
  // Celular: gaveta de navegação e cartão da carteira aberto para edição.
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [cartaoAbertoId, setCartaoAbertoId] = useState<string | null>(null);
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
  // Dashboard em duas visões para não lotar a tela: o dia a dia e a divisão por responsável.
  const [dashView, setDashView] = useState<"geral" | "responsaveis">("geral");
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
    category: "vencidos" as "vencidos" | "a_vencer" | "recompra" | "liquidado",
  });

  // Billing Tab specific interactive properties
  const [selectedDebtorForMessage, setSelectedDebtorForMessage] = useState<Debtor | null>(null);
  const [buscaEnvio, setBuscaEnvio] = useState("");
  const [verTodasExecucoes, setVerTodasExecucoes] = useState(false);
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

  const handleForgotPassword = async (email: string) => {
    await resetPassword(email);
  };

  // ── Recuperação de senha: define a nova senha após abrir o link do email ──
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [newPwdError, setNewPwdError] = useState("");
  const [newPwdSaving, setNewPwdSaving] = useState(false);
  const [newPwdDone, setNewPwdDone] = useState(false);

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewPwdError("");
    if (newPwd.length < 6) {
      setNewPwdError("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPwd !== newPwdConfirm) {
      setNewPwdError("As senhas não coincidem.");
      return;
    }
    setNewPwdSaving(true);
    try {
      await updatePassword(newPwd);
      setNewPwdDone(true);
      setNewPwd("");
      setNewPwdConfirm("");
    } catch (error) {
      setNewPwdError(error instanceof Error ? error.message : "Falha ao atualizar a senha.");
    } finally {
      setNewPwdSaving(false);
    }
  };

  const handleSignUp = async ({ name, email, password }: SignUpPayload) => {
    setIsAuthenticating(true);
    try {
      const authResult = await signUp({ name, email, password });
      const needsEmailConfirmation = !authResult.session;

      if (!needsEmailConfirmation) {
        setCurrentTab("cobrar");
      }

      return {
        needsEmailConfirmation,
        message: needsEmailConfirmation
          ? "Conta criada. Enviamos um link de confirmação para o seu e-mail — abra e depois entre aqui."
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

  // Retorno com ?checkout=success: aguarda o webhook atualizar a assinatura
  // (polling). O fluxo do Asaas não usa mais esse parâmetro — quem volta da
  // fatura é tratado pelo efeito de visibilidade abaixo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutResult = params.get("checkout");
    if (!checkoutResult) return;

    // Limpa o parâmetro da URL imediatamente (evita re-trigger em F5)
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete("checkout");
    window.history.replaceState({}, "", cleanUrl.toString());

    if (checkoutResult === "success" && userId) {
      // Inicia polling aguardando o webhook atualizar o status
      startCheckoutPolling();
    }
    // canceled: apenas limpa URL, não faz nada (usuário volta para SubscriptionGate)
  }, [userId]);

  // Carregamento inicial de dados da conta autenticada

  // Assinatura pelo Asaas. Primeira vez: teste grátis, acesso liberado na hora.
  // Depois disso: vai para a fatura (Pix, boleto ou cartão).
  const handleStartCheckout = async (planId: PlanId, cpfCnpj?: string) => {
    setIsSubscriptionActionLoading(true);
    setSubscriptionGateError("");

    try {
      const result = await subscriptionService.createCheckoutSession(planId, cpfCnpj);
      setDocumentPromptPlanId(null);
      if (result.invoice_url) {
        window.location.assign(result.invoice_url);
        return;
      }
      await refreshSubscription();
    } catch (error) {
      if (error instanceof BillingError && error.code === "documento_necessario") {
        setDocumentPromptPlanId(planId);
      } else {
        setSubscriptionGateError(error instanceof Error ? error.message : "Falha ao iniciar a assinatura.");
      }
    } finally {
      setIsSubscriptionActionLoading(false);
    }
  };

  // Relê a assinatura direto no Asaas antes de recarregar — cobre webhook
  // atrasado (boleto compensando) ou perdido.
  const syncSubscription = async () => {
    try {
      await subscriptionService.billingAction("sync");
    } catch { /* Asaas indisponível: mostra o que já está no banco */ }
    await refreshSubscription();
  };

  // Tela de bloqueio: abre direto a fatura em aberto.
  const handlePayInvoice = async () => {
    setIsSubscriptionActionLoading(true);
    setSubscriptionGateError("");

    try {
      const { invoice_url } = await subscriptionService.billingAction("pay");
      if (invoice_url) {
        window.location.assign(invoice_url);
        return;
      }
    } catch (error) {
      setSubscriptionGateError(error instanceof Error ? error.message : "Falha ao abrir a fatura.");
    } finally {
      setIsSubscriptionActionLoading(false);
    }
  };

  const handleOpenBillingPortal = () => setShowGerenciarAssinatura(true);

  // Quem foi pagar a fatura em outra aba (ou no app do banco) e voltou:
  // sincroniza ao reabrir a página, sem precisar clicar em "Atualizar".
  useEffect(() => {
    if (!userId || canUseApp) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncSubscription();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [userId, canUseApp]);

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

        setDebtors(hydratedRecords.filter(d => !d.archivedAt));
        setArquivados(hydratedRecords.filter(d => d.archivedAt));
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
      // Liquidado / Desabilitado: mantém valor original sem encargos
      if (d.category === "liquidado" || d.category === "desabilitado") {
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
    // Comparação direta (sem serializar a lista inteira em JSON duas vezes)
    const hasChanged =
      updated.length !== debtors.length ||
      updated.some((u, i) => u.updatedValue !== debtors[i].updatedValue);
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
      if (result.success) {
        // Aplica os matches retornados no state local de devedores. Quem não
        // veio na lista ficou sem sugestão no servidor (o novo casamento limpa
        // sugestão que não se sustenta) — exceto boleto já anexado.
        setDebtors((prev) =>
          prev.map((d) => {
            const m = result.matches.find((r) => r.debtorId === d.id);
            if (!m) {
              return d.driveFileId && d.driveFileId !== "uploaded"
                ? { ...d, driveFileId: null, driveFileName: null, driveFileUrl: null, driveMatchScore: null }
                : d;
            }
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
        // Contador "sem boleto" da barra do Drive
        void driveFolderService.getStatus().then((s) => { if (!s.loadError) setDriveFolderStatus(s); });
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

  // Anexar TODOS os boletos sugeridos (importação em lote) — usado na Visão Geral
  const handleAttachAllDriveBoletos = async () => {
    const suggested = debtors.filter(d => d.driveFileId && d.driveFileId !== "uploaded");
    if (!suggested.length) return;
    setIsAttachingAll(true);
    setAttachAllProgress({ done: 0, total: suggested.length, ok: 0 });
    let done = 0;
    let ok = 0;
    for (const target of suggested) {
      const result = await googleDriveService.importBoleto(target.id);
      if (result.success) {
        ok++;
        setDebtors(prev => prev.map(d =>
          d.id === target.id
            ? { ...d, driveFileId: "uploaded", driveFileName: result.fileName, driveFileUrl: result.fileUrl }
            : d
        ));
      }
      done++;
      setAttachAllProgress({ done, total: suggested.length, ok });
    }
    setIsAttachingAll(false);
    setDriveBoletoMsg({ ok: true, text: `${ok} de ${suggested.length} boleto(s) anexado(s) aos clientes.` });
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
  // até o servidor terminar de ler o conteúdo de todos os PDFs. true = terminou.
  const pollDriveIndexingProgress = async (): Promise<boolean> => {
    for (let i = 0; i < 120; i++) { // ~6 min de teto; o background segue mesmo após
      const status = await driveFolderService.getStatus();
      setDriveFolderStatus(status);
      if (status.loadError) return false;
      if (!status.indexing) {
        setDriveSaveMsg({
          ok: true,
          text: `Indexação concluída: ${status.contentIndexed ?? status.fileCount} de ${status.fileCount} boleto(s) lidos. Clique em "Buscar boletos no Drive" para casar com os devedores.`,
        });
        return true;
      }
      setDriveSaveMsg({
        ok: true,
        text: `Indexando em segundo plano: ${status.contentIndexed ?? 0} de ${status.fileCount} boleto(s) lidos…`,
      });
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
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

  // Reindexar a pasta — dispara o ciclo de indexação e acompanha o progresso.
  // true = pasta relida até o fim.
  const handleSyncDriveFolder = async (): Promise<boolean> => {
    setIsDriveSyncing(true);
    try {
      const r = await driveFolderService.syncFolder();
      const status = await driveFolderService.getStatus();
      setDriveFolderStatus(status);

      // Indexação rodando em background segue valendo mesmo se a chamada caiu
      // (tempo esgotado); fora isso, falha é falha — antes, havendo índice
      // antigo, a tela dizia "concluída" até com a pasta sem acesso.
      if (status.indexing) return await pollDriveIndexingProgress();
      if (!r.success) {
        setDriveSaveMsg({ ok: false, text: r.error || "Falha ao indexar a pasta." });
        return false;
      }
      setDriveSaveMsg({
        ok: true,
        text: `Indexação concluída: ${status.contentIndexed ?? status.fileCount} de ${status.fileCount} boleto(s) lidos. Clique em "Buscar boletos no Drive" para casar com os devedores.`,
      });
      return true;
    } finally {
      setIsDriveSyncing(false);
    }
  };

  // Pasta lida há mais de 12 h é relida sozinha ao abrir a tela, e os devedores
  // são casados em seguida. Antes dependia de alguém lembrar do "Reindexar": o
  // índice ficava meses parado e os boletos novos nunca apareciam.
  const DRIVE_RELEITURA_MS = 12 * 60 * 60 * 1000;
  const driveReleituraFeitaRef = React.useRef(false);

  const loadDriveFolderStatus = async () => {
    const status = await driveFolderService.getStatus();
    setDriveFolderStatus(status);

    // "indexing" não segura a releitura: leitura em fila há mais de 12 h é
    // cadeia em background que parou — a releitura a retoma.
    const lidaHa = status.lastIndexedAt ? Date.now() - new Date(status.lastIndexedAt).getTime() : Infinity;
    if (!status.configured || !status.isAccessible || lidaHa < DRIVE_RELEITURA_MS) return;
    if (driveReleituraFeitaRef.current) return;
    driveReleituraFeitaRef.current = true;
    if (await handleSyncDriveFolder()) {
      setDriveSaveMsg(null);
      await handleMatchDriveFiles();
    }
  };


  // Envio em lote de cobranças — liquidados são bloqueados
  const handleBatchSend = async () => {
    if (selectedDebtorIds.size === 0 || isBatchSending) return;

    // Nunca envia cobranças para títulos liquidados ou clientes desabilitados
    const cobráveis: string[] = Array.from(selectedDebtorIds).filter((id): id is string => {
      const d = debtors.find(x => x.id === id);
      if (!d) return false;
      if (d.category === "liquidado" || d.category === "desabilitado") return false;
      // Valor nao cobravel: enviar "R$ 0,00" a um devedor e pior que nao enviar.
      if (!(d.value > 0)) return false;
      return true;
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
    if ((currentTab === "cobranca" || currentTab === "visao_geral") && isLoggedIn && !driveFolderStatus) {
      void loadDriveFolderStatus();
    }
  }, [currentTab, isLoggedIn]);

  const regraVazia = (): Partial<AutomationRuleCreate> => ({
    name: "", ruleType: "overdue", daysBefore: 3, messageTone: "neutro", customMessage: getMessageTemplate("neutro"),
  });

  // Cria a regra ou, com editingRuleId, salva as alterações da regra aberta.
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleForm.name?.trim()) return;
    const payload: AutomationRuleCreate = {
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
    };
    try {
      if (editingRuleId) {
        const erro = validateNewAutomationRule(payload);
        if (erro) throw new Error(erro);
        await automationService.updateRule(editingRuleId, payload);
        setAutomationRules((prev) => prev.map((r) => (r.id === editingRuleId ? {
          ...r,
          name: payload.name,
          ruleType: payload.ruleType,
          daysBefore: payload.daysBefore ?? null,
          messageTone: payload.messageTone ?? r.messageTone,
          customMessage: payload.customMessage ?? null,
          sendWindowStart: payload.sendWindowStart ?? null,
          sendWindowEnd: payload.sendWindowEnd ?? null,
          maxDailySends: payload.maxDailySends ?? null,
          scheduleMode: payload.scheduleMode ?? r.scheduleMode,
          skipHolidays: payload.skipHolidays ?? r.skipHolidays,
        } : r)));
      } else {
        const created = await automationService.createRule(payload);
        setAutomationRules((prev) => [...prev, created]);
      }
      setShowCreateRuleForm(false);
      setEditingRuleId(null);
      setNewRuleForm(regraVazia());
    } catch (e) {
      setAutomationError(e instanceof Error ? e.message : editingRuleId ? "Falha ao salvar a regra." : "Falha ao criar regra.");
    }
  };

  const abrirNovaRegra = () => {
    // Clicar de novo em "Nova regra" com o formulário de criação aberto fecha.
    if (showCreateRuleForm && !editingRuleId) { setShowCreateRuleForm(false); return; }
    setEditingRuleId(null);
    setNewRuleForm(regraVazia());
    setShowCreateRuleForm(true);
  };

  const abrirEdicaoRegra = (rule: AutomationRule) => {
    setEditingRuleId(rule.id);
    setNewRuleForm({
      name: rule.name,
      ruleType: rule.ruleType,
      daysBefore: rule.daysBefore ?? 3,
      messageTone: rule.messageTone,
      // Sem texto próprio, a regra usa o padrão do tom — mostramos esse padrão.
      customMessage: rule.customMessage ?? getMessageTemplate(rule.messageTone),
      sendWindowStart: rule.sendWindowStart,
      sendWindowEnd: rule.sendWindowEnd,
      maxDailySends: rule.maxDailySends,
      scheduleMode: rule.scheduleMode,
      skipHolidays: rule.skipHolidays,
    });
    setShowCreateRuleForm(true);
    setTimeout(() => document.getElementById("form-regra")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const fecharFormRegra = () => {
    setShowCreateRuleForm(false);
    setEditingRuleId(null);
    setNewRuleForm(regraVazia());
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
      const limit = getPlanDefinition(plan).monthlyChargeLimit;
      const metrics = await metricsService.load(limit);
      setOperationalMetrics(metrics);
    } catch {
      // silently ignore ? metrics are non-critical
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  useEffect(() => {
    // Recarrega SEMPRE que a aba Dashboard é aberta — senão "Envios este mês"
    // ficava congelado no primeiro load e divergia do card de assinatura.
    if (currentTab === "dashboard" && isLoggedIn && !isLoadingMetrics) {
      void loadOperationalMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTab, isLoggedIn]);

  // Helper routine to format raw currency values in Brazil standards
  const formatBRL = (val: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(val);
  };

  // Build simulated message template replacements dynamically
  // Confirma o valor digitado na Carteira — tabela e cartões do celular usam a
  // mesma regra (vírgula nos centavos, valor positivo, aviso por registro).
  const confirmarValorEditado = (d: Debtor) => {
    setEditingValueDebtorId(null);
    const amount = parseManualAmount(editingValueText);
    if (Number.isNaN(amount)) {
      // Identifica a linha: sem isso o usuario nao descobre
      // qual edicao foi descartada.
      const alvo = d.client || d.document || "registro";
      // Ponto no lugar da virgula e o erro mais comum (teclado
      // numerico, colagem de planilha). O valor segue recusado,
      // porque 1.25 e ambiguo com 1.250 — mas em vez de repetir
      // a regra generica, mostramos a forma ja corrigida.
      const bruto = editingValueText.trim();
      const pontoDecimal = /^\d+\.\d{1,2}$/.test(bruto);
      setDebtorSaveError(
        pontoDecimal
          ? `Valor nao salvo em "${alvo}": use virgula para os centavos — ${bruto.replace(".", ",")}.`
          : `Valor nao salvo em "${alvo}": use um valor positivo, como 1.250,00.`
      );
      return;
    }
    // Sem isto o alerta ficava na tela para sempre, ate recarregar.
    setDebtorSaveError("");
    void saveDebtorFieldToDB(d.id, amount);
  };

  const buildMessageText = (debtor: Debtor, tone: MessageTone): string => {
    const pat = patternTemplates.find(p => p.id === tone);
    if (!pat) return "";

    // Dias de atraso reais, contados do vencimento (DD/MM/AAAA). Antes era fixo
    // em "12": os tons Firme e Jurídico diziam a todo vencido que o título
    // "acumula 12 dia(s) de atraso", qualquer que fosse o atraso de verdade.
    const diasDeAtraso = (() => {
      const m = (debtor.dueDate || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (!m) return 0;
      const venc = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return Math.max(0, Math.floor((hoje.getTime() - venc.getTime()) / 86_400_000));
    })();
    const daysAtraso = cobraComoVencido(debtor.category) ? String(diasDeAtraso) : "0";
    // Cobranca usa o valor base: multa e juros seguem calculados para gestao,
    // mas nao entram no que e cobrado do devedor.
    const valStr = debtor.value.toFixed(2);
    
    return aplicarEmpresa(pat.template, empresaAssinatura)
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
    setImportProgresso("");
    setExtractionAlert("");
    // Trocar de arquivo não é "revisão esvaziada": sem isto o efeito que limpa
    // a revisão apagava também o nome do arquivo que acabou de ser escolhido.
    extraidosAntesRef.current = 0;
    setExtractedDebtors([]);
    setLastExtractionResult(null);
    setImportFileName(file.name);
    setImportDoc(null);

    try {
      const doc = await lerArquivo(file, setImportProgresso);

      if (!doc.texto.trim() && !doc.tabelas.length) {
        throw new Error(
          doc.tipo === "imagem" || doc.tipo === "pdf-ocr"
            ? "Não foi possível reconhecer texto na imagem. Use uma foto nítida, de frente, com boa luz."
            : "O arquivo foi lido, mas não tem texto. Confira se é o arquivo certo.",
        );
      }

      setImportDoc(doc);
      setImportText(doc.texto);
    } catch (error) {
      setImportFileName("");
      setImportText("");
      setExtractionAlert(
        error instanceof Error
          ? error.message
          : "Não foi possível ler o arquivo enviado. Use PDF, Excel, CSV, TXT ou uma imagem.",
      );
    } finally {
      setIsParsingImportFile(false);
      setImportProgresso("");
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
      // ── Extração local: o arquivo lido (tabelas + texto) ou o texto da tela ──
      const result = importDoc && importText === importDoc.texto
        ? interpretarDocumento(importDoc)
        : extrairDeTexto(importText, importDoc?.nomeArquivo);

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

        // Leitura com dúvida (OCR incerto, valor ilegível): a nota veio abaixo
        // do que os campos presentes justificariam. O que FALTA (telefone,
        // vencimento…) é calculado ao vivo em pendenciasRevisao — assim o
        // contador "para revisar" baixa conforme a pessoa corrige.
        const presenca = (r: typeof result.records[number]) =>
          (r.client.trim().length >= 3 ? 25 : 0) + (r.document && !/^DOC-\d+$/.test(r.document) ? 20 : 0) +
          (r.dueDate ? 20 : 0) + (r.value > 0 ? 20 : 0) + (r.phone ? 15 : 0);
        setDuvidaLeituraIds(new Set(
          result.records.flatMap((item, index) => item.confidenceScore < presenca(item) ? [`ext-${ts}-${index}`] : [])
        ));
        setConferidosIds(new Set());
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
  /**
   * O que ainda falta num registro da revisão. Calculado ao vivo a partir dos
   * campos: corrigir o telefone, o vencimento ou o valor tira o registro da
   * contagem na hora. "Documento" e "leitura" (dúvida do OCR) saem quando a
   * pessoa edita o registro ou clica em "Conferido".
   */
  const pendenciasRevisao = (d: { id: string; client: string; document: string; dueDate: string; value: number; phone: string; category: Debtor["category"] }): string[] => {
    const falta: string[] = [];
    if (d.client.trim().length < 2) falta.push("cliente");
    if (!isValidDueDate(d.dueDate)) falta.push("vencimento");
    if (!(Number(d.value) > 0)) falta.push("valor");
    if (d.category !== "liquidado" && !normalizarDigitosTelefone(d.phone || "")) falta.push("WhatsApp");
    if (!conferidosIds.has(d.id)) {
      if (!d.document.trim() || /^DOC-\d+$/.test(d.document)) falta.push("documento");
      if (duvidaLeituraIds.has(d.id)) falta.push("leitura");
    }
    return falta;
  };
  const paraRevisarIds = new Set(extractedDebtors.filter(d => pendenciasRevisao(d).length > 0).map(d => d.id));

  // Appends parsed extraction items back to the general central view state
  const sendExtractedToOverview = async (revisaoConfirmada = false) => {
    if (extractedDebtors.length === 0 || !currentOwnerUserId) return;

    const toSend = extractedSelectedIds.size > 0
      ? extractedDebtors.filter(d => extractedSelectedIds.has(d.id))
      : extractedDebtors;

    if (toSend.length === 0) return;

    // Trava de revisao: registros marcados como incompletos na extracao nao
    // entram na Visao Geral sem confirmacao. Depois da importacao eles viram
    // devedores cobraveis com id novo do banco, e a marcacao se perde — por
    // isso a revisao tem de acontecer AQUI, enquanto ainda da para distinguir.
    const duvidosos = toSend.filter(d => pendenciasRevisao(d).length > 0);
    if (duvidosos.length > 0 && !revisaoConfirmada) {
      setRevisaoModal({ pending: toSend, duvidosos: duvidosos.length });
      return;
    }

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
      setDebtors((prev) => mesclarDevedores(prev, savedDebtors, "fim"));
      const sentIds = new Set(finalList.map(d => d.id));
      setExtractedDebtors(prev => prev.filter(d => !sentIds.has(d.id)));
      setExtractedSelectedIds(new Set());
      setDupDocModal(null);
      if (extractedDebtors.length === toSend.length) {
        setImportText("");
        setImportFileName("");
        setImportDoc(null);
        setCurrentTab("visao_geral");
      }
    } catch (error) {
      setExtractionAlert(error instanceof Error ? error.message : "Não foi possível salvar os registros importados.");
      setDupDocModal(null);
    }
  };

  // Individual editable text change handler on the parsed list
  const updateExtractedField = (id: string, field: keyof Debtor, val: Debtor[keyof Debtor]) => {
    // Mexeu no registro = olhou para ele: a dúvida de leitura sai da contagem.
    // O que falta de fato (telefone, vencimento, valor) continua contando até
    // ser preenchido.
    setConferidosIds(prev => (prev.has(id) ? prev : new Set(prev).add(id)));
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
  const saveDebtorFieldToDB = async (id: string, amount?: number) => {
    const existing = debtors.find((debtor) => debtor.id === id);
    const currentDebtor = existing && amount !== undefined ? { ...existing, value: amount } : existing;
    if (!currentDebtor || !currentOwnerUserId) return;
    if (!isValidDueDate(currentDebtor.dueDate)) {
      setDebtorSaveError("Alteração não salva: informe um vencimento válido no formato DD/MM/AAAA.");
      return;
    }
    setDebtorSaveError("");
    try {
      const savedDebtor = await financeService.update(currentOwnerUserId, currentDebtor);
      setDebtors((prev) => prev.map((debtor) => (debtor.id === id ? savedDebtor : debtor)));
      if (selectedDebtorForMessage?.id === id) {
        setSelectedDebtorForMessage(savedDebtor);
      }
    } catch (error) {
      setDebtorSaveError("Não foi possível salvar a alteração. Confira sua conexão e tente novamente.");
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

  // Revisão esvaziada (removeu tudo, um a um ou "remover selecionados"): limpa
  // também o texto colado, o arquivo e o resumo da leitura — senão o texto
  // antigo e o selo "N registros" ficavam na tela sem nada para revisar.
  // Só na passagem de "tinha registros" para "nenhum": uma leitura que não
  // achou nada mantém o texto para a pessoa corrigir.
  const extraidosAntesRef = React.useRef(0);
  useEffect(() => {
    const antes = extraidosAntesRef.current;
    extraidosAntesRef.current = extractedDebtors.length;
    if (antes > 0 && extractedDebtors.length === 0) {
      setImportText("");
      setImportFileName("");
      setImportDoc(null);
      setLastExtractionResult(null);
      setDuvidaLeituraIds(new Set());
      setConferidosIds(new Set());
      setExtractedSelectedIds(new Set());
      setExtractionAlert("");
    }
  }, [extractedDebtors.length]);

  // Bulk delete selected debtors in Visão Geral
  // Desabilita os devedores selecionados (não exclui): marca category="desabilitado"
  // com o motivo obrigatório salvo em notes. Desabilitados nunca são cobrados.
  const handleBulkDisable = async () => {
    if (selectedDebtorIds.size === 0 || !currentOwnerUserId) return;

    const motivo = window.prompt(
      `Desabilitar ${selectedDebtorIds.size} cliente(s) selecionado(s).\n\nDigite o MOTIVO da desabilitação (obrigatório):`,
    );
    if (motivo === null) return;              // cancelou
    const reason = motivo.trim();
    if (!reason) {
      window.alert("É obrigatório informar o motivo para desabilitar o cliente.");
      return;
    }

    const ids = new Set(selectedDebtorIds);
    const ownerUid = currentOwnerUserId as string;
    const stamp = new Date().toISOString().slice(0, 10);
    const noteText = `Desabilitado em ${stamp}: ${reason}`;

    // Atualiza estado local
    const toUpdate: Debtor[] = [];
    setDebtors(prev =>
      prev.map(d => {
        if (!ids.has(d.id)) return d;
        const updated: Debtor = { ...d, category: "desabilitado", notes: noteText };
        toUpdate.push(updated);
        return updated;
      }),
    );
    setSelectedDebtorIds(new Set());
    setBatchSendResult(null);

    try {
      await Promise.all(toUpdate.map(d => financeService.update(ownerUid, d)));
    } catch (error) {
      console.error('[workspace]', error instanceof Error ? error.message : 'Erro ao desabilitar selecionados.');
    }
  };

  const handleBulkOptOut = async () => {
    if (selectedDebtorIds.size === 0 || !currentOwnerUserId) return;

    const selected = debtors.filter(d => selectedDebtorIds.has(d.id) && (d.phone || "").replace(/\D/g, "").length >= 8);
    if (selected.length === 0) {
      window.alert("Nenhum dos selecionados tem telefone válido para adicionar à lista de não-contatar.");
      return;
    }
    if (!window.confirm(
      `Adicionar ${selected.length} contato(s) à lista de NÃO CONTATAR?\n\n` +
      `Eles não receberão mais nenhuma cobrança (manual ou automática) enquanto estiverem na lista.`,
    )) return;

    try {
      const added = await addOptOuts(
        currentOwnerUserId as string,
        selected.map(d => ({ phone: d.phone, reason: `Não contatar — ${d.client}` })),
      );
      setSelectedDebtorIds(new Set());
      window.alert(`${added} contato(s) adicionados à lista de não-contatar.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Erro ao adicionar à lista de não-contatar.");
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
  // Gate de responsabilidade: na 1ª vez que anexa um boleto, confirma que o
  // pagamento vai para o beneficiário do boleto e que o cliente é o credor
  // legítimo. Decisão fica salva no localStorage (não repete a cada anexo).
  const handlePdfUpload = async (debtorId: string, file: File) => {
    const acked = (() => { try { return localStorage.getItem("ncf-boleto-ack-v1") === "1"; } catch { return false; } })();
    if (!acked) { setPendingBoletoPdf({ debtorId, file }); return; }
    await doPdfUpload(debtorId, file);
  };

  const doPdfUpload = async (debtorId: string, file: File) => {
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

  const confirmBoletoAck = async () => {
    try { localStorage.setItem("ncf-boleto-ack-v1", "1"); } catch { /* ignore */ }
    const pending = pendingBoletoPdf;
    setPendingBoletoPdf(null);
    if (pending) await doPdfUpload(pending.debtorId, pending.file);
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
    setArquivados((prev) => prev.filter((debtor) => debtor.id !== id));
    if (selectedDebtorForMessage?.id === id) {
      setSelectedDebtorForMessage(null);
    }

    try {
      await financeService.remove(currentOwnerUserId, id);
    } catch (error) {
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao excluir devedor.');
    }
  };

  /**
   * Arquiva (arquivar=true) ou restaura clientes. Muda a tela na hora e grava
   * em seguida; se a gravação falhar, desfaz. Arquivado sai da lista ativa —
   * e com isso do Resumo, dos envios e das automações (as Edge Functions
   * também conferem archived_at).
   */
  const moverArquivo = async (ids: string[], arquivar: boolean) => {
    if (!currentOwnerUserId || !ids.length) return;
    const quando = arquivar ? new Date().toISOString() : null;
    const origem = arquivar ? debtors : arquivados;
    const movidos = origem.filter(d => ids.includes(d.id)).map(d => ({ ...d, archivedAt: quando }));
    if (!movidos.length) return;
    const idsMovidos = movidos.map(d => d.id);

    if (arquivar) {
      setDebtors(prev => prev.filter(d => !idsMovidos.includes(d.id)));
      setArquivados(prev => [...movidos, ...prev]);
      setSelectedDebtorIds(prev => { const n = new Set(prev); idsMovidos.forEach(i => n.delete(i)); return n; });
      if (selectedDebtorForMessage && idsMovidos.includes(selectedDebtorForMessage.id)) setSelectedDebtorForMessage(null);
    } else {
      setArquivados(prev => prev.filter(d => !idsMovidos.includes(d.id)));
      setDebtors(prev => mesclarDevedores(prev, movidos, "inicio"));
    }

    try {
      await financeService.setArchived(currentOwnerUserId, idsMovidos, quando);
      const qtd = idsMovidos.length === 1 ? movidos[0].client : `${idsMovidos.length} clientes`;
      setAvisoArquivo({ ids: idsMovidos, texto: arquivar ? `${qtd} foi para Arquivados.` : `${qtd} voltou para a carteira.`, desfazerArquivando: !arquivar });
    } catch (err) {
      // Desfaz na tela: o banco não mudou.
      if (arquivar) {
        setArquivados(prev => prev.filter(d => !idsMovidos.includes(d.id)));
        setDebtors(prev => mesclarDevedores(prev, movidos.map(d => ({ ...d, archivedAt: null })), "inicio"));
      } else {
        setDebtors(prev => prev.filter(d => !idsMovidos.includes(d.id)));
        setArquivados(prev => [...movidos.map(d => ({ ...d, archivedAt: new Date().toISOString() })), ...prev]);
      }
      setDebtorSaveError(err instanceof Error ? err.message : "Não foi possível arquivar. Tente de novo.");
    }
  };

  // Aviso de arquivamento some sozinho.
  useEffect(() => {
    if (!avisoArquivo) return;
    const t = setTimeout(() => setAvisoArquivo(null), 7000);
    return () => clearTimeout(t);
  }, [avisoArquivo]);

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
    const val = parseManualAmount(addDebtorForm.value);
    if (!addDebtorForm.client.trim() || !addDebtorForm.dueDate.trim() || isNaN(val) || val <= 0) {
      setAddDebtorError("Preencha ao menos: Nome, Vencimento e Valor.");
      return;
    }
    if (!isValidDueDate(addDebtorForm.dueDate)) {
      setAddDebtorError("Informe um vencimento válido no formato DD/MM/AAAA.");
      return;
    }
    setAddDebtorError("");

    const newDebtor: Debtor = {
      id:       crypto.randomUUID(),
      client:   addDebtorForm.client.trim(),
      supplier: addDebtorForm.supplier.trim(),
      document: addDebtorForm.document.trim() || `M-${Date.now()}`,
      dueDate:  addDebtorForm.dueDate.trim(),
      value:    val,
      // Só dígitos: o campo mostra "(11) 98765-4321", mas o envio usa o número.
      phone:    addDebtorForm.phone.replace(/\D/g, ""),
      category: addDebtorForm.category,
      status:   "pending",
      interestApplied: addDebtorForm.category === "liquidado" ? 0 : globalInterestDayPct,
      fineApplied:     addDebtorForm.category === "liquidado" ? 0 : globalFinePct,
      updatedValue:    addDebtorForm.category === "liquidado"
        ? val
        : Math.round(val * (1 + globalFinePct / 100) * 100) / 100,
    };

    // createMany faz upsert por (user_id, document_number): salvar com um
    // documento que ja existe SOBRESCREVE o boleto anterior, sem aviso. Como o
    // usuario acha que esta criando um novo, perguntamos antes.
    const existente = debtors.find(d => d.document === newDebtor.document);
    if (existente) {
      setAddDupModal({ novo: newDebtor, existente });
      return;
    }

    await salvarDevedorManual(newDebtor);
  };

  /** Proximo documento livre no padrao "base-2", "base-3"… */
  const documentoLivre = (base: string): string => {
    const usados = new Set(debtors.map(d => d.document));
    if (!usados.has(base)) return base;
    let n = 2;
    while (usados.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  };

  const salvarDevedorManual = async (devedor: Debtor) => {
    if (!currentOwnerUserId) return;
    setAddDebtorSaving(true);
    setAddDebtorError("");
    try {
      const [saved] = await financeService.createMany(currentOwnerUserId, [devedor]);
      setDebtors(prev => mesclarDevedores(prev, [saved], "inicio"));
      // Aprende o contato (telefone) para sugerir em cadastros/importações futuras
      void learnContactsFromDebtors([saved]);
      setAddDebtorForm({ client: "", supplier: "", document: "", dueDate: "", value: "", phone: "", category: "vencidos" });
      setShowAddDebtorModal(false);
      setAddDupModal(null);
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
        setDebtors(updated.filter(d => !d.archivedAt));
        setArquivados(updated.filter(d => d.archivedAt));
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
      vencidos:     "Vencido",
      a_vencer:     "A Vencer",
      recompra:     "Recompra",
      liquidado:    "Liquidado",
      // Antes ausente: desabilitado saía em branco na planilha exportada.
      desabilitado: "Desabilitado",
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

  // Apaga a carteira inteira — só depois da confirmação (modal excluirConfirm).
  const clearOverviewVision = async () => {
    if (!currentOwnerUserId) return;
    const currentIds = debtors.map((debtor) => debtor.id);
    setDebtors([]);
    setSelectedDebtorForMessage(null);

    try {
      await Promise.all(currentIds.map((debtorId) => financeService.remove(currentOwnerUserId, debtorId)));
    } catch (error) {
      console.error('[workspace]', error instanceof Error ? error.message : 'Falha ao limpar registros financeiros.');
    }
  };

  // Envio real via Edge Function send-whatsapp-charge (Z-API global da plataforma)
  const handleSendMessage = async () => {
    if (!selectedDebtorForMessage) return;

    // Liquidados / desabilitados nunca devem receber cobrança
    if (selectedDebtorForMessage.category === "liquidado" || selectedDebtorForMessage.category === "desabilitado") {
      setMessageFeedback({
        success: false,
        text: selectedDebtorForMessage.category === "desabilitado"
          ? "Este cliente está desabilitado. Cobranças não são enviadas para clientes desabilitados."
          : "Este título está marcado como liquidado. Cobranças não são enviadas para títulos pagos.",
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
        amount: selectedDebtorForMessage.value,
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
          value: selectedDebtorForMessage.value,
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


  // Metrics calculators do Dashboard — memoizados: antes rodavam ~8 varreduras
  // O(n) sobre os devedores a CADA render do App (digitar num campo, abrir um
  // modal…), mesmo fora do Dashboard. Agora só recalculam quando os insumos mudam.
  const {
    totalOriginalVolumeStatus,
    totalUpdatedVolumeStatus,
    vencidosCount,
    aVencerCount,
    liquidadoCount,
    desabilitadoCount,
    vencidosValue,
    aVencerValue,
    criticalDebtors,
    criticalValue,
    liquidadoValue,
  } = useMemo(() => {
    // Em aberto: exclui liquidados (já pagos) e desabilitados
    const totalOriginalVolumeStatus = debtors
      .filter(d => d.category !== "liquidado" && d.category !== "desabilitado")
      .reduce((acc, d) => acc + d.value, 0);
    const totalUpdatedVolumeStatus = debtors.reduce((acc, d) => acc + (d.updatedValue || d.value), 0);

    let vencidosCount = 0, aVencerCount = 0, liquidadoCount = 0, desabilitadoCount = 0;
    let vencidosValue = 0, aVencerValue = 0, liquidadoValue = 0;
    for (const d of debtors) {
      const v = d.updatedValue || d.value;
      // Recompra é cobrada como vencido e soma nos totais de vencidos.
      if (cobraComoVencido(d.category))       { vencidosCount++;     vencidosValue += v; }
      else if (d.category === "a_vencer")     { aVencerCount++;      aVencerValue += v; }
      else if (d.category === "liquidado")    { liquidadoCount++;    liquidadoValue += d.value; }
      else if (d.category === "desabilitado") { desabilitadoCount++; }
    }

    // Pendência Crítica: vencidos com atraso ≥ criticalDays
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const criticalDebtors = debtors.filter(d => {
      if (!cobraComoVencido(d.category)) return false;
      if (!d.dueDate) return false;
      const [dd, mm, yyyy] = d.dueDate.split("/");
      if (!dd || !mm || !yyyy) return false;
      const due = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
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

    return {
      totalOriginalVolumeStatus,
      totalUpdatedVolumeStatus,
      vencidosCount,
      aVencerCount,
      liquidadoCount,
      desabilitadoCount,
      vencidosValue,
      aVencerValue,
      criticalDebtors,
      criticalValue,
      liquidadoValue,
    };
  }, [debtors, criticalDays, criticalWithInterest, globalFinePct]);

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

  // public/session-hint.js marca <html class="tem-sessao"> antes da primeira
  // pintura quando há sessão salva neste navegador. Sem ela não há o que
  // validar: a landing (já pré-renderizada no HTML) segue na tela, sem piscar
  // o spinner entre o HTML estático e o React.
  const temSessaoSalva = typeof document !== "undefined" && document.documentElement.classList.contains("tem-sessao");

  if (isSessionLoading && temSessaoSalva) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
          <p className="text-sm font-semibold text-white">Validando sua sessão...</p>
          <p className="text-xs text-zinc-500">Preparando o acesso seguro ao painel NC Finance.</p>
        </div>
      </div>
    );
  }

  // ── Tela de definição de nova senha (após abrir o link de recuperação) ──
  if (passwordRecovery || newPwdDone) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 shadow-2xl">
          {newPwdDone ? (
            <div className="text-center space-y-4">
              <h1 className="text-lg font-bold text-emerald-400">Senha alterada com sucesso</h1>
              <p className="text-sm text-zinc-400">Você já está conectado com a nova senha.</p>
              <button
                type="button"
                onClick={() => setNewPwdDone(false)}
                className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black transition hover:bg-emerald-400"
              >
                Ir para o painel
              </button>
            </div>
          ) : (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div>
                <h1 className="text-lg font-bold text-white">Criar nova senha</h1>
                <p className="mt-1 text-sm text-zinc-400">Defina uma nova senha para sua conta.</p>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Nova senha</label>
                <PasswordInput aria-label="Nova senha"
                  value={newPwd}
                  onChange={(e) => { setNewPwd(e.target.value); setNewPwdError(""); }}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1.5">Confirmar senha</label>
                <PasswordInput aria-label="Confirmar senha"
                  value={newPwdConfirm}
                  onChange={(e) => { setNewPwdConfirm(e.target.value); setNewPwdError(""); }}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-white focus:border-emerald-500 focus:outline-none font-mono"
                  placeholder="••••••••"
                />
              </div>
              {newPwdError && <p className="text-xs text-rose-400">{newPwdError}</p>}
              <button
                type="submit"
                disabled={newPwdSaving}
                className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {newPwdSaving ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          )}
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
          onForgotPassword={handleForgotPassword}
          isAuthLoading={isAuthenticating}
          authConfigError={authConfigError}
        />
      ) : ((isSubscriptionLoading && !isSubscriptionSyncing) || (userId && !perfilCadastro.carregado)) ? (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 mx-auto rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
            <p className="text-sm font-semibold text-white">Verificando assinatura…</p>
            <p className="text-xs text-zinc-500">Preparando acesso seguro ao painel NC Finance.</p>
          </div>
        </div>
      ) : (userId && !perfilCadastro.completo) ? (
        <CompletarCadastro
          userId={userId}
          email={account?.email || user?.email || ""}
          displayName={account?.displayName || ""}
          termsAcceptedAt={typeof user?.user_metadata?.accepted_terms_at === "string" ? user.user_metadata.accepted_terms_at : null}
          perfil={perfilCadastro.perfil}
          onSaved={() => void carregarPerfilCadastro(userId)}
          onLogout={() => void handleSignOut()}
        />
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
          onManageSubscription={() => void handlePayInvoice()}
          documentPromptPlanId={documentPromptPlanId}
          onSubmitDocument={(planId, cpfCnpj) => void handleStartCheckout(planId, cpfCnpj)}
          onCancelDocument={() => setDocumentPromptPlanId(null)}
          onRefresh={() => void syncSubscription()}
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
            mobileOpen={menuMobileAberto}
            onMobileClose={() => setMenuMobileAberto(false)}
          />

          <main className="transition-all duration-300 pl-0 md:pl-16 min-h-screen flex flex-col justify-between">
            
            <div className="border-b border-zinc-800/60 bg-zinc-950 p-4 sticky top-0 z-20 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMenuMobileAberto(true)}
                  aria-label="Abrir menu"
                  aria-controls="sidebar"
                  aria-expanded={menuMobileAberto}
                  className="md:hidden -ml-1 w-10 h-10 flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold text-white">
                  {currentTab === "cobrar"     && "Enviar Cobranças"}
                  {currentTab === "dashboard"  && "Dashboard & Métricas"}
                  {currentTab === "importar"   && "Importar carteira"}
                  {currentTab === "visao_geral"&& "Carteira"}
                  {currentTab === "cobranca"   && "Preparar envios"}
                  {currentTab === "historico"  && "Histórico de Cobrança"}
                  {currentTab === "automacoes" && "Automações"}
                  {currentTab === "minha_conta"&& "Minha Conta"}
                </h2>
              </div>
            </div>

            {(isWorkspaceLoading || isSavingConfig) && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
                <div className="space-y-2">
                  {isWorkspaceLoading && (
                    <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                      Carregando seus dados...
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

            {/* Conta da época da Stripe: precisa ativar pelo Asaas até o prazo. */}
            {subscription && isStripeLegacy({
              status: subscription.status,
              billing_provider: subscription.billingProvider,
              asaas_subscription_id: subscription.asaasSubscriptionId,
            }) && (
              <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-amber-100">
                    Mudamos o sistema de pagamento. Ative sua assinatura até{" "}
                    <strong>{new Date(Date.parse(STRIPE_LEGACY_CUTOFF) - 1).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</strong>{" "}
                    para não perder o acesso — Pix, boleto ou cartão.
                  </p>
                  <button
                    onClick={handleOpenBillingPortal}
                    className="flex-shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black transition hover:bg-amber-300 cursor-pointer"
                  >
                    Ativar assinatura
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">

              {/* ── Tab: Minha Conta ───────────────────────────────────────── */}
              {currentTab === "minha_conta" && userId && (
                <MinhaConta
                  userId={userId}
                  email={account?.email || user?.email || ""}
                  displayName={account?.displayName || "Conta autenticada"}
                  plan={plan}
                  subscription={subscription}
                  chargesSent={usage?.chargesSent ?? 0}
                  onManageSubscription={handleOpenBillingPortal}
                  onDeleteAccount={() => setShowDeleteAccount(true)}
                  onProfileUpdated={() => { if (userId) void carregarPerfilCadastro(userId); }}
                />
              )}

              {/* ── Tab: Cobrar (novo fluxo simplificado) ──────────────────── */}
              {currentTab === "cobrar" && userId && (
                <div className="space-y-4 max-w-4xl mx-auto">
                  <p className="text-xs text-zinc-500">
                    Importe a planilha, revise os devedores e envie as cobranças pelo seu WhatsApp.
                  </p>
                  <ClientDashboard
                    userId={userId}
                    onGoToSettings={() => setCurrentTab("minha_conta")}
                    companyName={empresaAssinatura}
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
                        setDebtors(updated.filter(d => !d.archivedAt));
                        setArquivados(updated.filter(d => d.archivedAt));
                      } catch {
                        // non-critical — Visão Geral será atualizada no próximo acesso
                      }
                    }}
                  />
                </div>
              )}

              {currentTab === "dashboard" && (() => {
                // ── Dashboard ──────────────────────────────────────────────
                // Mesmo padrão visual de Minha Conta e Gerenciar assinatura:
                // seções com cabeçalho e linha fina, cantos retos, rótulos mono.
                // Cores das situações validadas para fundo escuro (dataviz):
                // vencido #e11d48 · a vencer #d97706 · liquidado #059669, sempre
                // com o nome escrito ao lado — a cor nunca identifica sozinha.
                const card = "bg-zinc-950 border border-zinc-800 rounded-xl";
                const cabecalho = "flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80";
                const rotulo = "text-[10px] font-mono uppercase tracking-widest text-zinc-500";
                const recompraCount = debtors.filter(d => d.category === "recompra").length;
                const situacoes = [
                  { key: "vencidos",  label: "Vencidos",   count: vencidosCount,  value: vencidosValue,  cor: "#e11d48",
                    nota: recompraCount > 0 ? `com multa e juros · inclui ${recompraCount} recompra${recompraCount !== 1 ? "s" : ""}` : "com multa e juros" },
                  { key: "a_vencer",  label: "A vencer",   count: aVencerCount,   value: aVencerValue,   cor: "#d97706", nota: "ainda no prazo" },
                  { key: "liquidado", label: "Liquidados", count: liquidadoCount, value: liquidadoValue, cor: "#059669", nota: "valor original recebido" },
                ];
                const maxSituacao = Math.max(1, ...situacoes.map(s => s.value));
                const somaSituacoes = situacoes.reduce((a, s) => a + s.value, 0) || 1;
                const totalClientes = vencidosCount + aVencerCount + liquidadoCount;
                const enviosUsados = operationalMetrics?.usageThisMonth?.chargesUsed ?? (usage?.chargesSent ?? 0);
                const enviosLimite = operationalMetrics?.usageThisMonth?.planLimit ?? getPlanDefinition(plan).monthlyChargeLimit;
                const enviosRestantes = operationalMetrics?.usageThisMonth?.remaining ?? remainingCharges ?? 0;
                const enviosPct = Math.min(100, (enviosUsados / (enviosLimite || 1)) * 100);
                const titulos = (n: number) => `${n} título${n !== 1 ? "s" : ""}`;

                return (
                <div className="space-y-6">

                  <div className="flex rounded-lg border border-zinc-800 overflow-hidden w-fit" role="tablist" aria-label="Visão do dashboard">
                    {([["geral", "Visão geral"], ["responsaveis", "Por responsável"]] as const).map(([v, txt]) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={dashView === v}
                        onClick={() => setDashView(v)}
                        className={`px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${dashView === v ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        {txt}
                      </button>
                    ))}
                  </div>

                  {dashView === "geral" && (<>
                  {/* ── Indicadores ─────────────────────────────────────────── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className={`${card} p-5`}>
                      <div className="flex items-center justify-between">
                        <p className={rotulo}>Em aberto</p>
                        <DollarSign className="w-3.5 h-3.5 text-zinc-600" />
                      </div>
                      <p className="mt-3 text-2xl font-bold text-white font-mono tabular-nums"><CountUp to={totalOriginalVolumeStatus} prefix="R$ " decimals={2} /></p>
                      <p className="mt-1.5 text-[11px] text-zinc-500">Valor original dos títulos não pagos.</p>
                    </div>

                    <div className={`${card} p-5`}>
                      <div className="flex items-center justify-between">
                        <p className={rotulo}>Vencidos corrigidos</p>
                        <TrendingUp className="w-3.5 h-3.5 text-zinc-600" />
                      </div>
                      <p className="mt-3 text-2xl font-bold text-white font-mono tabular-nums"><CountUp to={vencidosValue} prefix="R$ " decimals={2} /></p>
                      <p className="mt-1.5 text-[11px] text-zinc-500">Com {globalFinePct}% de multa + {globalInterestDayPct}% de juros ao dia.</p>
                    </div>

                    <div className={`${card} p-5 border-rose-900/50`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle className="w-3 h-3" /> Pendência crítica
                        </p>
                        <span className="text-[11px] text-zinc-500 font-mono">{titulos(criticalDebtors.length)}</span>
                      </div>
                      <p className="mt-3 text-2xl font-bold text-white font-mono tabular-nums"><CountUp to={criticalValue} prefix="R$ " decimals={2} /></p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-zinc-500">
                        <span className="whitespace-nowrap">Atraso ≥</span>
                        <input
                          type="number"
                          min={1}
                          max={9999}
                          aria-label="Dias de atraso para pendência crítica"
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
                          className="w-12 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[11px] text-white font-mono text-center outline-none focus:border-rose-500/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <span>dias</span>
                        <div className="ml-auto flex rounded border border-zinc-800 overflow-hidden" role="group" aria-label="Juros na pendência crítica">
                          {[true, false].map(comJuros => (
                            <button
                              key={String(comJuros)}
                              type="button"
                              onClick={() => setCriticalWithInterest(comJuros)}
                              aria-pressed={criticalWithInterest === comJuros}
                              className={`px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                                criticalWithInterest === comJuros ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-500 hover:text-zinc-300"
                              }`}
                            >
                              {comJuros ? "c/ juros" : "s/ juros"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className={`${card} p-5`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3" /> Recebido
                        </p>
                        <span className="text-[11px] text-zinc-500 font-mono">{titulos(liquidadoCount)}</span>
                      </div>
                      <p className="mt-3 text-2xl font-bold text-white font-mono tabular-nums"><CountUp to={liquidadoValue} prefix="R$ " decimals={2} /></p>
                      <p className="mt-1.5 text-[11px] text-zinc-500">Títulos liquidados e confirmados.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* ── Carteira por situação ───────────────────────────────── */}
                    <section className={`${card} lg:col-span-7`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Carteira por situação</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Quanto há em cada situação, em reais</p>
                        </div>
                        <span className="text-xs text-zinc-400 font-mono flex-shrink-0">{totalClientes} cliente{totalClientes !== 1 ? "s" : ""}</span>
                      </header>
                      <div className="px-5 py-5 space-y-5">
                        {situacoes.map(s => {
                          const largura = s.value > 0 ? Math.max(1.5, (s.value / maxSituacao) * 100) : 0;
                          const pct = Math.round((s.value / somaSituacoes) * 100);
                          return (
                            <div key={s.key} title={`${s.label}: ${formatBRL(s.value)} — ${titulos(s.count)}, ${pct}% da carteira`}>
                              <div className="flex items-baseline justify-between gap-3">
                                <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.cor }} />
                                  {s.label}
                                  <span className="font-normal text-zinc-500">· {titulos(s.count)}</span>
                                </span>
                                <span className="text-sm font-mono text-white tabular-nums">{formatBRL(s.value)}</span>
                              </div>
                              <div className="mt-2 h-2.5 bg-zinc-900 rounded-sm overflow-hidden">
                                <div className="dash-bar-x h-full rounded-r" style={{ width: `${largura}%`, background: s.cor }} />
                              </div>
                              <p className="mt-1.5 text-[11px] text-zinc-500">{pct}% da carteira · {s.nota}</p>
                            </div>
                          );
                        })}
                      </div>
                      <footer className="px-5 py-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                        <span>
                          Média por boleto <span className="text-zinc-200 font-mono">{formatBRL(debtors.length > 0 ? totalUpdatedVolumeStatus / debtors.length : 0)}</span>
                        </span>
                        {desabilitadoCount > 0 && <span>{desabilitadoCount} desabilitado{desabilitadoCount !== 1 ? "s" : ""} fora da conta</span>}
                      </footer>
                    </section>

                    {/* ── Operação do mês ─────────────────────────────────────── */}
                    <section className={`${card} lg:col-span-5`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Operação do mês</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Envios, entregas e fila de disparo</p>
                        </div>
                        <button
                          onClick={() => void loadOperationalMetrics()}
                          disabled={isLoadingMetrics}
                          className="flex-shrink-0 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          title="Atualizar"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingMetrics ? "animate-spin" : ""}`} />
                          {operationalMetrics ? new Date(operationalMetrics.loadedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Carregar"}
                        </button>
                      </header>
                      <div className="px-5 py-5 space-y-5">
                        <div>
                          <div className="flex items-baseline justify-between">
                            <p className={rotulo}>Envios</p>
                            <span className="text-xs font-mono text-zinc-300 tabular-nums">
                              {enviosUsados.toLocaleString("pt-BR")} <span className="text-zinc-600">/ {enviosLimite.toLocaleString("pt-BR")}</span>
                            </span>
                          </div>
                          <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${enviosPct >= 90 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${enviosPct}%` }} />
                          </div>
                          <p className={`mt-1.5 text-[11px] ${enviosRestantes > 0 ? "text-zinc-500" : "text-rose-400"}`}>
                            {enviosRestantes > 0 ? `Restam ${enviosRestantes.toLocaleString("pt-BR")} envios no mês` : "Limite do mês atingido"}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-px bg-zinc-800 rounded-lg overflow-hidden border border-zinc-800">
                          <div className="bg-zinc-950 p-3">
                            <p className={rotulo}>Taxa de entrega</p>
                            <p className="mt-1.5 text-xl font-bold text-white font-mono tabular-nums flex items-center gap-1.5">
                              {isLoadingMetrics || !operationalMetrics ? "—" : `${operationalMetrics.successRateThisMonth}%`}
                              {operationalMetrics && (
                                <span className={`w-1.5 h-1.5 rounded-full ${operationalMetrics.successRateThisMonth >= 80 ? "bg-emerald-500" : "bg-amber-400"}`}
                                  title={operationalMetrics.successRateThisMonth >= 80 ? "Boa" : "Abaixo de 80%"} />
                              )}
                            </p>
                          </div>
                          <div className="bg-zinc-950 p-3">
                            <p className={rotulo}>Na fila</p>
                            <p className="mt-1.5 text-xl font-bold text-white font-mono tabular-nums">
                              {isLoadingMetrics ? "…" : (operationalMetrics?.activeJobsInQueue ?? 0)}
                            </p>
                          </div>
                        </div>

                        {isLoadingMetrics && !operationalMetrics && (
                          <div className="h-10 rounded-lg bg-zinc-900 animate-pulse" />
                        )}
                      </div>
                      <footer className="px-5 py-3 border-t border-zinc-800/80 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-zinc-500">
                            Automações{" "}
                            <span className="text-zinc-200">
                              {isLoadingAutomation ? "…"
                                : automationRules.length === 0 ? "nenhuma configurada"
                                : `${automationRules.filter(r => r.enabled).length} de ${automationRules.length} ativas`}
                            </span>
                          </span>
                          <button onClick={() => setCurrentTab("automacoes")} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
                            Gerenciar
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-zinc-500">Plano <span className="text-zinc-200">{getPlanDefinition(plan).name}</span></span>
                          <button onClick={handleOpenBillingPortal} className="text-zinc-400 hover:text-white transition-colors cursor-pointer">
                            Gerenciar assinatura
                          </button>
                        </div>
                      </footer>
                    </section>
                  </div>

                  {/* Primeiros passos: só enquanto a carteira está vazia. */}
                  {debtors.length === 0 && (
                  <>
                  {/* ── Como funciona ───────────────────────────────────────── */}
                  <section className={card}>
                    <header className={cabecalho}>
                      <div>
                        <h4 className="text-sm font-bold text-white">Como funciona</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">Da planilha ao WhatsApp do cliente em quatro passos</p>
                      </div>
                    </header>
                    <ol className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-zinc-900">
                      {[
                        { t: "Importe", d: "Envie o relatório, a planilha ou o PDF. O sistema lê os vencimentos sozinho." },
                        { t: "Corrija os valores", d: "Defina multa e juros ao dia. Os valores atualizados aparecem na hora." },
                        { t: "Escolha o tom", d: "Amigável, neutro, firme ou notificação jurídica, conforme o atraso." },
                        { t: "Dispare", d: "Envie pelo seu WhatsApp, com o boleto do Google Drive anexado, ou deixe automático." },
                      ].map((p, i) => (
                        <li key={p.t} className="px-5 py-4">
                          <p className="text-[10px] font-mono text-emerald-400">{String(i + 1).padStart(2, "0")}</p>
                          <p className="mt-1.5 text-xs font-bold text-white">{p.t}</p>
                          <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">{p.d}</p>
                        </li>
                      ))}
                    </ol>
                  </section>
                  </>
                  )}
                  </>)}

                  {dashView === "responsaveis" && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* ── Responsáveis ────────────────────────────────────────── */}
                    <section className={`${card} lg:col-span-5`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Responsáveis</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Quem cuida de cada carteira</p>
                        </div>
                        <button
                          onClick={() => setShowRepModal(true)}
                          className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <UserPlus className="w-3 h-3" /> Gerenciar
                        </button>
                      </header>
                      {representatives.length === 0 ? (
                        <p className="px-5 py-6 text-xs text-zinc-500 text-center">Nenhum responsável cadastrado.</p>
                      ) : (
                        <div className="max-h-[340px] overflow-y-auto divide-y divide-zinc-900">
                          {representatives.map(r => {
                            const assignedDebtors = debtors.filter(db => db.representativeId === r.id);
                            const assignedCount = assignedDebtors.length;
                            const isExpanded = expandedRepId === r.id;
                            return (
                              <div key={r.id}>
                                <button
                                  onClick={() => setExpandedRepId(isExpanded ? null : r.id)}
                                  disabled={assignedCount === 0}
                                  aria-expanded={isExpanded}
                                  className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-zinc-900/60 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-default"
                                >
                                  <span className="flex items-center gap-2.5 min-w-0">
                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.color}`} />
                                    <span className="min-w-0">
                                      <span className="block text-xs font-semibold text-zinc-200 truncate">{r.name}</span>
                                      <span className="block text-[10px] text-zinc-500">{r.role}</span>
                                    </span>
                                  </span>
                                  <span className={`text-[11px] font-mono flex-shrink-0 ${assignedCount === 0 ? "text-zinc-600" : "text-zinc-300"}`}>
                                    {assignedCount} {assignedCount === 1 ? "devedor" : "devedores"}{assignedCount > 0 && (isExpanded ? " ▴" : " ▾")}
                                  </span>
                                </button>
                                {isExpanded && assignedDebtors.length > 0 && (
                                  <div className="bg-zinc-900/40 divide-y divide-zinc-900">
                                    {assignedDebtors.map(d => (
                                      <div key={d.id} className="flex items-center justify-between gap-2 pl-10 pr-5 py-2">
                                        <div className="min-w-0">
                                          <p className="text-[11px] font-semibold text-zinc-200 truncate">{d.client}</p>
                                          <p className="text-[10px] text-zinc-500 font-mono">{d.document}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${CATEGORY_TINT[d.category]}`}>
                                            {CATEGORY_LABEL[d.category]}
                                          </span>
                                          <span className="text-[10px] font-mono text-zinc-400">{formatBRL(d.updatedValue || d.value)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    {/* ── Resumo por responsável ──────────────────────────────── */}
                    <section className={`${card} lg:col-span-7`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2"><Users className="w-3.5 h-3.5 text-zinc-500" /> Resumo por responsável</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Clientes e valores de cada carteira</p>
                        </div>
                      </header>
                      {(() => {
                        // Agrupa os devedores por responsável (e "Sem responsável").
                        const repGroups = new Map<string, { rep: Representative | null; items: typeof debtors }>();
                        repGroups.set("__none__", { rep: null, items: [] });
                        representatives.forEach(r => repGroups.set(r.id, { rep: r, items: [] }));
                        debtors.forEach(d => {
                          const key = d.representativeId && repGroups.has(d.representativeId) ? d.representativeId : "__none__";
                          repGroups.get(key)!.items.push(d);
                        });

                        const rows = Array.from(repGroups.entries())
                          .map(([key, { rep, items }]) => ({
                            key,
                            name: rep ? rep.name : "Sem responsável",
                            total: items.length,
                            vencidos: items.filter(d => cobraComoVencido(d.category)).length,
                            aVencer: items.filter(d => d.category === "a_vencer").length,
                            liquidados: items.filter(d => d.category === "liquidado").length,
                            valorTotal: items.reduce((s, d) => s + (d.updatedValue || d.value), 0),
                          }))
                          .filter(r => r.total > 0)
                          .sort((a, b) => b.total - a.total);

                        if (rows.length === 0) {
                          return <p className="px-5 py-6 text-xs text-zinc-500 text-center">Nenhum cliente cadastrado ainda.</p>;
                        }

                        const th = "px-3 py-2.5 font-medium";
                        return (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left text-zinc-300">
                              <thead className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 border-b border-zinc-800">
                                <tr>
                                  <th className={`${th} pl-5`}>Responsável</th>
                                  <th className={`${th} text-right`}>Clientes</th>
                                  <th className={`${th} text-right`}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: "#e11d48" }} />Vencidos</span></th>
                                  <th className={`${th} text-right`}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: "#d97706" }} />A vencer</span></th>
                                  <th className={`${th} text-right`}><span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm" style={{ background: "#059669" }} />Liquidados</span></th>
                                  <th className={`${th} pr-5 text-right`}>Valor</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-900">
                                {rows.map(r => (
                                  <tr key={r.key} className="hover:bg-zinc-900/40 transition-colors">
                                    <td className="px-3 pl-5 py-2.5 font-semibold text-zinc-200">{r.name}</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">{r.total}</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.vencidos}</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.aVencer}</td>
                                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{r.liquidados}</td>
                                    <td className="px-3 pr-5 py-2.5 text-right font-mono tabular-nums text-white">{formatBRL(r.valorTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </section>
                  </div>
                  )}

                </div>
                );
              })()}

              {currentTab === "importar" && (() => {
                // ── Importar carteira ──────────────────────────────────────
                // Mesmo padrão das telas novas: duas seções numeradas (arquivo →
                // revisão), cantos retos, rótulos mono, cor só onde identifica.
                const card = "bg-zinc-950 border border-zinc-800 rounded-xl";
                const cabecalho = "flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80";
                const rotulo = "block text-[10px] font-mono uppercase tracking-widest text-zinc-500";
                const campo = "w-full bg-zinc-900 border border-zinc-800 rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-emerald-500 transition-colors";
                const tipos = [
                  { value: "vencidos",  label: "Vencidos",   cor: "#e11d48", description: "Cobrados com multa e juros" },
                  { value: "a_vencer",  label: "A vencer",   cor: "#d97706", description: "Aviso preventivo, tom amigável" },
                  { value: "recompra",  label: "Recompra",   cor: "#0284c7", description: "Cobrados como vencidos" },
                  { value: "liquidado", label: "Liquidação", cor: "#059669", description: "Marca como pago, sem cobrança" },
                ] as const;
                const todosMarcados = extractedDebtors.length > 0 && extractedDebtors.every(d => extractedSelectedIds.has(d.id));

                return (
                <div className="space-y-4">
                  <p className="text-xs text-zinc-500">
                    Ferramenta completa de importação: PDF (inclusive escaneado), Excel, CSV, foto do relatório ou texto colado. Para o caminho guiado de
                    importar e enviar, use{" "}
                    <button type="button" onClick={() => setCurrentTab("cobrar")} className="text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer">
                      Cobranças
                    </button>.
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* ── 1. Arquivo ──────────────────────────────────────────── */}
                    <section className={`${card} lg:col-span-5`}>
                      <header className={cabecalho}>
                        <div>
                          <p className="text-[10px] font-mono text-emerald-400">01</p>
                          <h4 className="mt-0.5 text-sm font-bold text-white">Arquivo</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">O sistema lê clientes, vencimentos, valores e documentos</p>
                        </div>
                      </header>
                      <div className="px-5 py-4 space-y-4">

                        <div className={`relative rounded-lg border border-dashed transition-colors px-4 py-5 flex items-center gap-3 ${
                          importFileName ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40"
                        }`}>
                          <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
                            {isParsingImportFile ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-zinc-200 truncate">
                              {isParsingImportFile ? (importProgresso || "Lendo arquivo…") : importFileName ? importFileName : "Clique ou arraste o arquivo aqui"}
                            </p>
                            <p className="text-[11px] text-zinc-500">
                              {isParsingImportFile ? importFileName : importFileName ? "Clique para trocar o arquivo" : "PDF, Excel, CSV, TXT ou foto do relatório"}
                            </p>
                          </div>
                          <input
                            type="file"
                            accept={ACEITA_IMPORTACAO}
                            disabled={isParsingImportFile}
                            onChange={handleImportFileChange}
                            aria-label="Escolher arquivo para importar"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </div>

                        <div>
                          <span className={`${rotulo} mb-1.5`}>O que tem no arquivo</span>
                          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de arquivo">
                            {tipos.map(cat => {
                              const ativo = importCategory === cat.value;
                              return (
                                <button
                                  key={cat.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={ativo}
                                  onClick={() => setImportCategory(cat.value)}
                                  className={`px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                                    ativo ? "" : "border-zinc-800 hover:border-zinc-700"
                                  }`}
                                  style={ativo ? { borderColor: `${cat.cor}99`, background: `${cat.cor}1f` } : undefined}
                                >
                                  <span className="flex items-center gap-2 text-xs font-semibold text-white">
                                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: cat.cor }} />
                                    {cat.label}
                                  </span>
                                  <span className="block mt-0.5 text-[10px] text-zinc-500 leading-snug">{cat.description}</span>
                                </button>
                              );
                            })}
                          </div>
                          {importCategory === "liquidado" && (
                            <p className="mt-2 flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                              <HandCoins className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                              <span>Os títulos encontrados serão marcados como pagos na carteira. Nenhuma cobrança é enviada.</span>
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="importar-texto" className={`${rotulo} mb-1.5`}>Ou cole o texto</label>
                          <textarea
                            id="importar-texto"
                            rows={4}
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder="Linhas do relatório: cliente, documento, vencimento, valor, telefone…"
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                          />
                        </div>

                        {extractionAlert && (
                          <p className="text-[11px] rounded-lg flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-300 px-3 py-2">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                            <span className="flex-1">{extractionAlert}</span>
                          </p>
                        )}

                        <button
                          onClick={handleAIExtract}
                          disabled={isExtracting}
                          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isExtracting
                            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Lendo o documento…</>
                            : <><Zap className="w-3.5 h-3.5" /> Ler dados do documento</>}
                        </button>
                      </div>
                    </section>

                    {/* ── 2. Revisar e enviar ─────────────────────────────────── */}
                    <section className={`${card} lg:col-span-7 flex flex-col`}>
                      <header className={cabecalho}>
                        <div>
                          <p className="text-[10px] font-mono text-emerald-400">02</p>
                          <h4 className="mt-0.5 text-sm font-bold text-white">Revisar e enviar</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {lastExtractionResult?.resumo || "Corrija o que precisar antes de mandar para a carteira"}
                          </p>
                        </div>
                        {lastExtractionResult && (
                          <div className="flex flex-wrap justify-end gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-zinc-300 border-zinc-700 bg-zinc-900">
                              {lastExtractionResult.records.length} registro{lastExtractionResult.records.length !== 1 ? "s" : ""}
                            </span>
                            {paraRevisarIds.size > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const ids = [...paraRevisarIds];
                                  if (!ids.length) return;
                                  // Cicla pelo próximo item de baixa confiança a cada clique
                                  lowConfCursorRef.current = lowConfCursorRef.current % ids.length;
                                  const targetId = ids[lowConfCursorRef.current];
                                  lowConfCursorRef.current++;
                                  setFlashedLowConfId(targetId);
                                  setTimeout(() => setFlashedLowConfId(null), 1200);
                                  document.getElementById(`extracted-card-${targetId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                                className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-amber-300 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors cursor-pointer inline-flex items-center gap-1"
                                title="Ir para o próximo registro a revisar"
                              >
                                <AlertTriangle className="w-3 h-3" /> {paraRevisarIds.size} para revisar
                              </button>
                            )}
                            {lastExtractionResult.missingDocCount > 0 && (
                              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-zinc-500 border-zinc-800" title="Registros sem número de documento: o sistema gerou um">
                                {lastExtractionResult.missingDocCount} doc. gerado{lastExtractionResult.missingDocCount !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </header>

                      {extractedDebtors.length === 0 ? (
                        <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center text-center px-8 py-12">
                          <SlidersHorizontal className="w-8 h-8 text-zinc-700 mb-3" />
                          <p className="text-xs font-semibold text-zinc-300">Nada para revisar ainda</p>
                          <p className="text-[11px] text-zinc-500 max-w-xs mt-1">Escolha um arquivo ou cole o texto e clique em "Ler dados do documento". Os registros aparecem aqui para conferir.</p>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-zinc-900 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setExtractedSelectedIds(todosMarcados ? new Set() : new Set(extractedDebtors.map(d => d.id)))}
                              className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              {todosMarcados ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5" />}
                              {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
                            </button>
                            {extractedSelectedIds.size > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setExtractedDebtors(prev => prev.filter(d => !extractedSelectedIds.has(d.id)));
                                  setExtractedSelectedIds(new Set());
                                }}
                                className="flex items-center gap-1.5 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remover {extractedSelectedIds.size} selecionado{extractedSelectedIds.size !== 1 ? "s" : ""}
                              </button>
                            )}
                          </div>

                          <div className="max-h-[480px] overflow-y-auto divide-y divide-zinc-900">
                            {extractedDebtors.map((item) => {
                              const marcado = extractedSelectedIds.has(item.id);
                              const pendencias = pendenciasRevisao(item);
                              const revisar = pendencias.length > 0;
                              // Só sobra o que dá para confirmar olhando (documento, dúvida de leitura)?
                              const soConferir = revisar && pendencias.every(p => p === "documento" || p === "leitura");
                              return (
                                <div
                                  key={item.id}
                                  id={`extracted-card-${item.id}`}
                                  className={`px-5 py-3 space-y-2 transition-colors duration-300 ${
                                    flashedLowConfId === item.id ? "bg-amber-500/15" : marcado ? "bg-emerald-500/5" : revisar ? "bg-amber-500/5" : ""
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setExtractedSelectedIds(prev => {
                                        const next = new Set(prev);
                                        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                                        return next;
                                      })}
                                      className="text-zinc-500 hover:text-emerald-400 transition-colors cursor-pointer flex-shrink-0"
                                      title="Selecionar"
                                      aria-pressed={marcado}
                                    >
                                      {marcado ? <CheckSquare className="w-3.5 h-3.5 text-emerald-400" /> : <Square className="w-3.5 h-3.5" />}
                                    </button>
                                    <input aria-label="Cliente"
                                      type="text"
                                      value={item.client}
                                      onChange={(e) => updateExtractedField(item.id, "client", e.target.value)}
                                      className={`${campo} text-xs font-semibold`}
                                    />
                                    {revisar && (
                                      soConferir ? (
                                        <button
                                          type="button"
                                          onClick={() => setConferidosIds(prev => new Set(prev).add(item.id))}
                                          className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/30 bg-amber-500/10 text-[10px] font-mono uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                                          title={pendencias.includes("leitura")
                                            ? "A leitura pode ter errado algum campo. Confira e clique para tirar da revisão."
                                            : "Sem número de documento: o sistema gerou um. Clique se estiver certo assim."}
                                        >
                                          <Check className="w-3 h-3" /> Conferido
                                        </button>
                                      ) : (
                                        <span
                                          className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-amber-300"
                                          title="Preencha para tirar da revisão"
                                        >
                                          <AlertTriangle className="w-3 h-3" /> Falta {pendencias.filter(p => p !== "documento" && p !== "leitura").join(", ")}
                                        </span>
                                      )
                                    )}
                                    <button
                                      onClick={() => removeExtractedRow(item.id)}
                                      className="flex-shrink-0 p-1 rounded text-zinc-600 hover:text-rose-400 transition-colors cursor-pointer"
                                      title="Ignorar este registro"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] pl-5">
                                    <div>
                                      <label className={`${rotulo} mb-0.5`}>Documento</label>
                                      <input aria-label="Documento" type="text" value={item.document}
                                        onChange={(e) => updateExtractedField(item.id, "document", e.target.value)}
                                        className={`${campo} font-mono`} />
                                    </div>
                                    <div>
                                      <label className={`${rotulo} mb-0.5`}>Vencimento</label>
                                      <input aria-label="Vencimento" type="text" value={item.dueDate}
                                        onChange={(e) => updateExtractedField(item.id, "dueDate", e.target.value)}
                                        className={`${campo} font-mono`} />
                                    </div>
                                    <div>
                                      <label className={`${rotulo} mb-0.5`}>Valor (R$)</label>
                                      <input aria-label="Valor (R$)" type="number" value={item.value}
                                        onChange={(e) => updateExtractedField(item.id, "value", Number(e.target.value))}
                                        className={`${campo} font-mono`} />
                                    </div>
                                    <div>
                                      <label className={`${rotulo} mb-0.5`}>WhatsApp</label>
                                      <input aria-label="Celular (WhatsApp)" type="text" value={item.phone}
                                        onChange={(e) => updateExtractedField(item.id, "phone", e.target.value)}
                                        className={`${campo} font-mono`} />
                                    </div>
                                    <div>
                                      <label className={`${rotulo} mb-0.5`}>Banco</label>
                                      <input aria-label="Banco" type="text" value={item.bank || ""} placeholder="—"
                                        onChange={(e) => updateExtractedField(item.id, "bank", e.target.value)}
                                        className={campo} />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      <footer className="mt-auto px-5 py-3 border-t border-zinc-800/80 flex items-center justify-between gap-4 flex-wrap">
                        <span className="text-[11px] text-zinc-500">
                          {extractedDebtors.length === 0
                            ? "Nenhum registro lido"
                            : extractedSelectedIds.size > 0
                              ? `${extractedSelectedIds.size} de ${extractedDebtors.length} selecionado${extractedSelectedIds.size !== 1 ? "s" : ""}`
                              : `${extractedDebtors.length} registro${extractedDebtors.length !== 1 ? "s" : ""} para enviar`}
                        </span>
                        <button
                          onClick={() => void sendExtractedToOverview()}
                          disabled={extractedDebtors.length === 0}
                          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {extractedSelectedIds.size > 0
                            ? `Enviar ${extractedSelectedIds.size} para a carteira`
                            : "Enviar todos para a carteira"}
                        </button>
                      </footer>
                    </section>

                  </div>
                </div>
                );
              })()}

              {currentTab === "visao_geral" && (
                <>
                <div className="space-y-4">

                  {/* ── Boletos do Google Drive (busca + anexar em lote) ──────── */}
                  {driveFolderStatus?.configured && (() => {
                    const suggestedCount = debtors.filter(d => d.driveFileId && d.driveFileId !== "uploaded").length;
                    return (
                      <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <HardDrive className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <DriveHelpPopover />
                          <span className="text-xs text-zinc-300 truncate">
                            Boletos do Drive: <span className="text-zinc-400">{driveFolderStatus.folderName || "pasta"}</span>
                            {driveFolderStatus.indexing && <span className="text-sky-300"> · indexando {driveFolderStatus.contentIndexed ?? 0}/{driveFolderStatus.fileCount}…</span>}
                            {suggestedCount > 0 && <span className="text-emerald-300 font-semibold"> · {suggestedCount} boleto(s) sugerido(s)</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleMatchDriveFiles()}
                            disabled={isDriveMatching || isAttachingAll}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 text-xs font-semibold border border-zinc-700 transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            {isDriveMatching ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Buscando…</> : <><Search className="w-3.5 h-3.5" /> Buscar boletos no Drive</>}
                          </button>
                          {suggestedCount > 0 && (
                            <button
                              type="button"
                              onClick={() => void handleAttachAllDriveBoletos()}
                              disabled={isAttachingAll}
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                            >
                              {isAttachingAll
                                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Anexando {attachAllProgress?.done ?? 0}/{attachAllProgress?.total ?? 0}…</>
                                : <><Check className="w-3.5 h-3.5" strokeWidth={3} /> Anexar todos ({suggestedCount})</>}
                            </button>
                          )}
                        </div>
                        {driveBoletoMsg && (
                          <div className={`w-full text-[11px] rounded-lg px-3 py-1.5 border ${driveBoletoMsg.ok ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-300 bg-rose-500/10 border-rose-500/20"}`}>
                            {driveBoletoMsg.text}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Barra da carteira ───────────────────────────────────────
                      Configurações (encargos, responsáveis) viram botões que abrem
                      no lugar, para a tabela ser o foco da tela. */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 w-full sm:w-auto sm:flex-1 sm:min-w-[200px] focus-within:border-zinc-600">
                      <Search className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                      <input aria-label="Buscar por cliente ou documento"
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Buscar por cliente ou documento…"
                        className="w-full text-xs text-zinc-200 bg-transparent focus:outline-none placeholder:text-zinc-600"
                      />
                    </div>

                    {/* Encargos (multa + juros ao dia) */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEncargos((v) => !v)}
                        aria-expanded={showEncargos}
                        className="px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                        title="Multa e juros aplicados aos vencidos"
                      >
                        <Percent className="w-3.5 h-3.5 text-zinc-500" />
                        Multa <span className="font-mono text-white">{globalFinePctStr || "0"}%</span>
                        <span className="text-zinc-600">·</span>
                        Juros <span className="font-mono text-white">{globalInterestDayPctStr || "0"}%</span>/dia
                      </button>
                      {showEncargos && (
                        <>
                          <div className="fixed inset-0 z-30 bg-black/50 sm:bg-transparent" onClick={() => setShowEncargos(false)} />
                          <div className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:left-0 z-40 sm:w-72 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl p-4 space-y-3">
                            <div>
                              <p className="text-xs font-bold text-white">Encargos dos vencidos</p>
                              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">Multa aplicada uma vez e juros por dia de atraso, para toda a carteira.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              {[
                                { rotulo: "Multa", valor: globalFinePctStr, setStr: setGlobalFinePctStr, setNum: setGlobalFinePct },
                                { rotulo: "Juros ao dia", valor: globalInterestDayPctStr, setStr: setGlobalInterestDayPctStr, setNum: setGlobalInterestDayPct },
                              ].map(({ rotulo, valor, setStr, setNum }) => (
                                <div key={rotulo}>
                                  <label className="block mb-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">{rotulo}</label>
                                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 focus-within:border-emerald-500">
                                    <input aria-label={`${rotulo} (%)`}
                                      type="text"
                                      inputMode="decimal"
                                      value={valor}
                                      onChange={(e) => {
                                        const raw = e.target.value.replace(",", ".");
                                        setStr(e.target.value);
                                        if (raw === "" || raw === ".") { setNum(0); return; }
                                        const n = parseFloat(raw);
                                        if (!isNaN(n)) setNum(Math.max(0, n));
                                      }}
                                      placeholder="0"
                                      className="w-full bg-transparent focus:outline-none text-sm font-mono text-white placeholder:text-zinc-700"
                                    />
                                    <span className="text-xs text-zinc-500">%</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowRepModal(true)}
                      className="px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Users className="w-3.5 h-3.5 text-zinc-500" /> Responsáveis
                    </button>

                    <div className="relative">
                      <button
                        onClick={() => setShowExportMenu((v) => !v)}
                        className="px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500" /> Exportar
                        <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? "rotate-180" : ""}`} />
                      </button>

                      {showExportMenu && (
                        <>
                          <div className="fixed inset-0 z-30 bg-black/50 sm:bg-transparent" onClick={() => setShowExportMenu(false)} />
                          <div className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:right-0 z-40 sm:w-60 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden py-1">
                            <button
                              onClick={() => { setShowExportMenu(false); downloadExcelFormat(); }}
                              className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-zinc-500" /> Planilha (XLS/CSV)
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
                              className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5 text-zinc-500" />
                              {selectedDebtorIds.size > 0 ? `Relatório PDF (${selectedDebtorIds.size} selecionados)` : "Relatório PDF"}
                            </button>
                            <button
                              onClick={() => { setShowExportMenu(false); setSheetsExportResult(null); setExportSheetUrl(sheetUrlInput); setShowExportSheetsModal(true); }}
                              className="w-full px-4 py-2.5 text-left text-xs text-zinc-200 hover:bg-zinc-900 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <CloudLightning className="w-3.5 h-3.5 text-zinc-500" /> Sincronizar com Sheets
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => { setShowAddDebtorModal(true); setAddDebtorError(""); }}
                      className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs whitespace-nowrap"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Adicionar devedor
                    </button>

                    <button
                      type="button"
                      onClick={() => setVerArquivados(v => !v)}
                      aria-pressed={verArquivados}
                      className={`px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        verArquivados ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 hover:border-zinc-700 text-zinc-300"
                      }`}
                      title="Clientes arquivados: fora da carteira ativa e de qualquer cobrança"
                    >
                      <Archive className="w-3.5 h-3.5" /> Arquivados
                      {arquivados.length > 0 && <span className="font-mono text-[10px] text-zinc-500">{arquivados.length}</span>}
                    </button>

                    {/* Ações raras e destrutivas ficam fora da vista. */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMaisCarteira((v) => !v)}
                        aria-label="Mais ações"
                        className="px-2.5 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-400 transition-colors cursor-pointer"
                      >
                        ⋯
                      </button>
                      {showMaisCarteira && (
                        <>
                          <div className="fixed inset-0 z-30 bg-black/50 sm:bg-transparent" onClick={() => setShowMaisCarteira(false)} />
                          <div className="fixed inset-x-3 bottom-3 sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-2 sm:right-0 z-40 sm:w-56 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden py-1">
                            <button
                              onClick={() => { setShowMaisCarteira(false); setExcluirConfirm({ tipo: "todos", total: debtors.length }); }}
                              className="w-full px-4 py-2.5 text-left text-xs text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Apagar toda a carteira
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {avisoArquivo && (
                    <div role="status" className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300">
                      <span className="flex items-center gap-2 min-w-0">
                        <Archive className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                        <span className="truncate">{avisoArquivo.texto}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => { const a = avisoArquivo; setAvisoArquivo(null); void moverArquivo(a.ids, a.desfazerArquivando); }}
                        className="flex-shrink-0 font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                      >
                        Desfazer
                      </button>
                    </div>
                  )}

                  {verArquivados && (() => {
                    const termo = searchFilter.trim().toLowerCase();
                    const lista = termo
                      ? arquivados.filter(d => d.client.toLowerCase().includes(termo) || (d.document || "").toLowerCase().includes(termo))
                      : arquivados;
                    const dataCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
                    return (
                      <section className="bg-zinc-950 border border-zinc-800 rounded-xl">
                        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
                          <div>
                            <h4 className="text-sm font-bold text-white">Arquivados</h4>
                            <p className="text-xs text-zinc-500 mt-0.5">Fora da carteira ativa e de qualquer cobrança. Restaure para voltar a cobrar.</p>
                          </div>
                          <button type="button" onClick={() => setVerArquivados(false)} className="text-xs text-zinc-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap">
                            Voltar à carteira
                          </button>
                        </header>
                        {lista.length === 0 ? (
                          <div className="px-5 py-12 text-center">
                            <Archive className="w-7 h-7 text-zinc-700 mx-auto mb-3" />
                            <p className="text-xs font-semibold text-zinc-300">{termo ? "Nenhum arquivado com essa busca" : "Nenhum cliente arquivado"}</p>
                            <p className="text-[11px] text-zinc-500 mt-1 max-w-xs mx-auto">
                              Na carteira, use o ícone de arquivar na linha do cliente, ou selecione vários e clique em “Arquivar”.
                            </p>
                          </div>
                        ) : (
                          <ul className="divide-y divide-zinc-900">
                            {lista.map(d => (
                              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                                <div className="flex-1 min-w-[180px]">
                                  <p className="text-sm font-medium text-zinc-200 truncate">{d.client}</p>
                                  <p className="text-[11px] text-zinc-500 font-mono truncate">
                                    {d.document ? `Doc. ${d.document} · ` : ""}venc. {d.dueDate || "—"} · arquivado em {dataCurta(d.archivedAt)}
                                  </p>
                                </div>
                                <span className="text-sm font-mono tabular-nums text-zinc-300">
                                  {d.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void moverArquivo([d.id], false)}
                                    className="px-2.5 py-1.5 rounded-md border border-zinc-800 hover:border-emerald-500/50 hover:text-emerald-300 text-xs text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5"
                                  >
                                    <ArchiveRestore className="w-3.5 h-3.5" /> Restaurar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExcluirConfirm({ tipo: "um", debtor: d })}
                                    aria-label={`Excluir ${d.client}`}
                                    title="Excluir de vez"
                                    className="p-1.5 rounded-md text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    );
                  })()}

                  {!verArquivados && (<>
                  {selectedDebtorIds.size > 0 && (
                    <div className="px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-wrap items-center justify-between gap-3">
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
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
                          onClick={() => void handleBulkDisable()}
                          disabled={isBatchSending}
                          title="Desabilitar cliente(s) — não serão mais cobrados"
                          className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          Desabilitar selecionados ({selectedDebtorIds.size})
                        </button>

                        <button
                          type="button"
                          onClick={() => void moverArquivo([...selectedDebtorIds], true)}
                          disabled={isBatchSending}
                          title="Arquivar — sai da carteira ativa e de qualquer cobrança; dá para restaurar"
                          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          Arquivar ({selectedDebtorIds.size})
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleBulkOptOut()}
                          disabled={isBatchSending}
                          title="Não contatar — adiciona à lista de opt-out (protege o número/LGPD)"
                          className="px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
                        >
                          <PhoneOff className="w-3.5 h-3.5" />
                          Não contatar ({selectedDebtorIds.size})
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

                  {debtorSaveError && (
                    <p role="alert" className="text-sm text-rose-400 mb-3">{debtorSaveError}</p>
                  )}
                  {/* ── Celular: cartões no lugar da tabela de 13 colunas ─────
                      Resumo à vista (cliente, valor, vencimento, situação);
                      tocar abre a edição no próprio cartão. */}
                  {(() => {
                    const todosMarcados = filteredDebtors.length > 0 && filteredDebtors.every(d => selectedDebtorIds.has(d.id));
                    const ordem = sortValueOrder === "desc" ? "valor_desc" : sortValueOrder === "asc" ? "valor_asc"
                      : sortDateOrder === "asc" ? "venc_asc" : sortDateOrder === "desc" ? "venc_desc"
                      : sortNameOrder === "desc" ? "nome_desc" : "nome_asc";
                    const mudarOrdem = (v: string) => {
                      setSortBankOrder("none");
                      setSortNameOrder(v === "nome_desc" ? "desc" : v === "nome_asc" ? "asc" : "none");
                      setSortDateOrder(v === "venc_asc" ? "asc" : v === "venc_desc" ? "desc" : "none");
                      setSortValueOrder(v === "valor_desc" ? "desc" : v === "valor_asc" ? "asc" : "none");
                    };
                    const rotuloCampo = "block mb-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500";
                    const campoCartao = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500";
                    const filtroCls = "bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600";
                    return (
                      <div className="md:hidden space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select aria-label="Filtrar por tipo" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={filtroCls}>
                            <option value="all">Todos os tipos</option>
                            <option value="vencidos">Vencidos</option>
                            <option value="a_vencer">A vencer</option>
                            <option value="recompra">Recompra</option>
                            <option value="liquidado">Liquidados</option>
                            <option value="desabilitado">Desabilitados</option>
                          </select>
                          <select aria-label="Ordenar" value={ordem} onChange={(e) => mudarOrdem(e.target.value)} className={filtroCls}>
                            <option value="nome_asc">Nome A→Z</option>
                            <option value="nome_desc">Nome Z→A</option>
                            <option value="venc_asc">Vencimento mais antigo</option>
                            <option value="venc_desc">Vencimento mais novo</option>
                            <option value="valor_desc">Maior valor</option>
                            <option value="valor_asc">Menor valor</option>
                          </select>
                        </div>
                        <div className="flex items-center justify-between px-1 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDebtorIds(todosMarcados ? new Set() : new Set(filteredDebtors.map(d => d.id)));
                              setBatchSendResult(null);
                            }}
                            className="flex items-center gap-2 text-xs text-zinc-400 hover:text-white cursor-pointer"
                          >
                            {todosMarcados ? <CheckSquare className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}
                            {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
                          </button>
                          <span className="text-[11px] font-mono text-zinc-500">{filteredDebtors.length} título(s)</span>
                        </div>

                        {filteredDebtors.length === 0 ? (
                          <p className="rounded-xl border border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
                            Nenhum devedor com esses filtros.
                          </p>
                        ) : filteredDebtors.map((d) => {
                          const aberto = cartaoAbertoId === d.id;
                          const marcado = selectedDebtorIds.has(d.id);
                          const corrigido = d.updatedValue && Math.abs(d.updatedValue - d.value) >= 0.01 ? d.updatedValue : null;
                          return (
                            <article
                              key={d.id}
                              className={`rounded-xl border transition-colors ${marcado ? "border-emerald-500/40 bg-emerald-500/10" : "border-zinc-800 bg-zinc-950"}`}
                            >
                              <div className="flex items-start gap-3 p-3">
                                <button
                                  type="button"
                                  aria-label={marcado ? `Desmarcar ${d.client}` : `Selecionar ${d.client}`}
                                  aria-pressed={marcado}
                                  onClick={() => {
                                    setBatchSendResult(null);
                                    setSelectedDebtorIds((prev) => {
                                      const next = new Set(prev);
                                      next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                                      return next;
                                    });
                                  }}
                                  className="mt-0.5 -m-1 p-1 text-zinc-500 hover:text-emerald-400 cursor-pointer"
                                >
                                  {marcado ? <CheckSquare className="w-5 h-5 text-emerald-400" /> : <Square className="w-5 h-5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCartaoAbertoId(aberto ? null : d.id)}
                                  aria-expanded={aberto}
                                  className="min-w-0 flex-1 text-left cursor-pointer"
                                >
                                  <span className="flex items-start justify-between gap-3">
                                    <span className="text-sm font-semibold text-white truncate">{d.client || "Sem nome"}</span>
                                    <span className="text-sm font-mono text-white tabular-nums flex-shrink-0">{formatBRL(d.value)}</span>
                                  </span>
                                  <span className="mt-0.5 flex items-start justify-between gap-3 text-[11px] text-zinc-500">
                                    <span className="font-mono truncate">{d.document || "—"} · {d.dueDate || "sem vencimento"}</span>
                                    {corrigido !== null && <span className="font-mono flex-shrink-0">corrigido {formatBRL(corrigido)}</span>}
                                  </span>
                                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${CATEGORY_BADGE[d.category]}`}>{CATEGORY_LABEL[d.category]}</span>
                                    {d.phone
                                      ? <span className="text-[11px] font-mono text-zinc-400">{d.phone}</span>
                                      : <span className="text-[11px] text-amber-400">sem WhatsApp</span>}
                                    {d.driveFileId && <span className="text-[11px] text-emerald-400">boleto anexado</span>}
                                    {d.notes && <MessageSquare className="w-3.5 h-3.5 text-amber-300" aria-label="Tem observação" />}
                                  </span>
                                </button>
                              </div>

                              {aberto && (
                                <div className="border-t border-zinc-800/80 p-3 space-y-3">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                      <label htmlFor={`c-cli-${d.id}`} className={rotuloCampo}>Cliente</label>
                                      <input id={`c-cli-${d.id}`} value={d.client}
                                        onChange={(e) => updateDebtorFieldLocal(d.id, "client", e.target.value)}
                                        onBlur={() => saveDebtorFieldToDB(d.id)} className={campoCartao} />
                                    </div>
                                    <div>
                                      <label htmlFor={`c-doc-${d.id}`} className={rotuloCampo}>Documento</label>
                                      <input id={`c-doc-${d.id}`} value={d.document}
                                        onChange={(e) => updateDebtorFieldLocal(d.id, "document", e.target.value)}
                                        onBlur={() => saveDebtorFieldToDB(d.id)} className={`${campoCartao} font-mono`} />
                                    </div>
                                    <div>
                                      <label htmlFor={`c-venc-${d.id}`} className={rotuloCampo}>Vencimento</label>
                                      <input id={`c-venc-${d.id}`} value={d.dueDate} inputMode="numeric" placeholder="DD/MM/AAAA"
                                        onChange={(e) => updateDebtorFieldLocal(d.id, "dueDate", e.target.value)}
                                        onBlur={() => saveDebtorFieldToDB(d.id)} className={`${campoCartao} font-mono`} />
                                    </div>
                                    <div>
                                      <label htmlFor={`c-tel-${d.id}`} className={rotuloCampo}>WhatsApp</label>
                                      <input id={`c-tel-${d.id}`} value={d.phone || ""} inputMode="tel" placeholder="5577999998888"
                                        onChange={(e) => updateDebtorFieldLocal(d.id, "phone", e.target.value)}
                                        onBlur={() => saveDebtorFieldToDB(d.id)} className={`${campoCartao} font-mono`} />
                                    </div>
                                    <div>
                                      <label htmlFor={`c-valor-${d.id}`} className={rotuloCampo}>Valor (R$)</label>
                                      <input id={`c-valor-${d.id}`} inputMode="decimal"
                                        value={editingValueDebtorId === d.id
                                          ? editingValueText
                                          : d.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        onFocus={() => { setEditingValueDebtorId(d.id); setEditingValueText(d.value.toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                                        onChange={(e) => setEditingValueText(e.target.value)}
                                        onBlur={() => confirmarValorEditado(d)}
                                        className={`${campoCartao} font-mono text-right`} />
                                    </div>
                                    <div>
                                      <label htmlFor={`c-tipo-${d.id}`} className={rotuloCampo}>Tipo</label>
                                      <select id={`c-tipo-${d.id}`} value={d.category} disabled={d.category === "desabilitado"}
                                        onChange={(e) => updateGeneralDebtorField(d.id, "category", e.target.value as Debtor["category"])}
                                        className={campoCartao}>
                                        {d.category === "desabilitado" && <option value="desabilitado">{CATEGORY_LABEL.desabilitado}</option>}
                                        {CATEGORY_CYCLE.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label htmlFor={`c-banco-${d.id}`} className={rotuloCampo}>Banco</label>
                                      <input id={`c-banco-${d.id}`} value={d.bank || ""} placeholder="—"
                                        onChange={(e) => updateDebtorFieldLocal(d.id, "bank", e.target.value)}
                                        onBlur={() => saveDebtorFieldToDB(d.id)} className={campoCartao} />
                                    </div>
                                    <div className="col-span-2">
                                      <label htmlFor={`c-resp-${d.id}`} className={rotuloCampo}>Responsável</label>
                                      <select id={`c-resp-${d.id}`} value={d.representativeId || ""}
                                        onChange={(e) => updateGeneralDebtorField(d.id, "representativeId", e.target.value || undefined)}
                                        className={campoCartao}>
                                        <option value="">Não atribuído</option>
                                        {representatives.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                      </select>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => { setSelectedDebtorForMessage(d); setCurrentTab("cobranca"); }}
                                      className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <SendHorizonal className="w-3.5 h-3.5" /> Cobrar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setNotesPopover({ debtorId: d.id, draft: d.notes || "" })}
                                      className={`px-3 py-2 rounded-lg border text-xs inline-flex items-center gap-1.5 cursor-pointer ${d.notes ? "border-amber-400/40 text-amber-300" : "border-zinc-800 text-zinc-300"}`}
                                    >
                                      <MessageSquare className="w-3.5 h-3.5" /> {d.notes ? "Ver nota" : "Nota"}
                                    </button>
                                    {uploadingPdfDebtorId === d.id ? (
                                      <span className="px-3 py-2 text-xs text-zinc-400 inline-flex items-center gap-1.5">
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" /> Enviando…
                                      </span>
                                    ) : d.driveFileId ? (
                                      <>
                                        {d.driveFileUrl && (
                                          <button
                                            type="button"
                                            onClick={() => openPdfPreview(d.driveFileUrl!, d.driveFileName || "boleto.pdf")}
                                            className="px-3 py-2 rounded-lg border border-zinc-800 text-xs text-emerald-400 inline-flex items-center gap-1.5 cursor-pointer"
                                          >
                                            <Eye className="w-3.5 h-3.5" /> Boleto
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => void handlePdfRemove(d.id)}
                                          aria-label="Remover boleto"
                                          className="px-2.5 py-2 rounded-lg border border-zinc-800 text-xs text-zinc-500 hover:text-rose-400 cursor-pointer"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <label htmlFor={`pdf-card-${d.id}`} className="px-3 py-2 rounded-lg border border-zinc-800 text-xs text-zinc-300 inline-flex items-center gap-1.5 cursor-pointer">
                                          <Upload className="w-3.5 h-3.5" /> Anexar boleto
                                        </label>
                                        <input
                                          id={`pdf-card-${d.id}`}
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
                                    <button
                                      type="button"
                                      onClick={() => void moverArquivo([d.id], true)}
                                      className="ml-auto px-2.5 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer flex items-center gap-1.5"
                                    >
                                      <Archive className="w-4 h-4" /> Arquivar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExcluirConfirm({ tipo: "um", debtor: d })}
                                      aria-label="Excluir devedor"
                                      className="px-2.5 py-2 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    );
                  })()}

                  <div className="hidden md:block bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
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
                        <thead className="text-[10px] uppercase font-mono tracking-wider bg-zinc-900/60 border-b border-zinc-800 text-zinc-500">
                          <tr>
                            <th className="px-3 py-3 w-8 sticky left-0 z-10 bg-zinc-900/80 backdrop-blur-sm">
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
                                <span className="text-zinc-300">CLIENTE</span>
                                <span className="text-[9px] font-bold px-1 py-0.5 rounded transition-colors bg-zinc-800 text-zinc-300">
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
                            <th className="px-4 py-3 text-center">WHATSAPP</th>
                            <th className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => { setSortNameOrder("none"); setSortBankOrder("none"); setSortDateOrder("none"); setSortValueOrder(o => o === "desc" ? "asc" : o === "asc" ? "none" : "desc"); }}
                                className="flex items-center gap-1.5 group transition-colors text-zinc-400 hover:text-zinc-200 ml-auto"
                                title={sortValueOrder === "desc" ? "Clique para menor primeiro" : sortValueOrder === "asc" ? "Clique para remover ordenação" : "Clique para maior primeiro"}
                              >
                                <span className={sortValueOrder !== "none" ? "text-emerald-400" : ""}>VALOR</span>
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${
                                  sortValueOrder !== "none" ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"
                                }`}>
                                  {sortValueOrder === "desc" ? "↓" : sortValueOrder === "asc" ? "↑" : "↕"}
                                </span>
                              </button>
                            </th>
                            <th className="px-4 py-3 text-right text-zinc-300" title="Valor com multa e juros">TOTAL CORRIGIDO</th>
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
                                    <option value="recompra">Recompra</option>
                                    <option value="liquidado">Liquidado</option>
                                    <option value="desabilitado">Desabilitados</option>
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
                            <th className="px-4 py-3 text-center">NOTAS</th>
                            <th className="px-4 py-3 text-center">BOLETO</th>
                            <th className="px-5 py-3 text-right"><span className="sr-only">Ações</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
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
                                <tr key={d.id} className={`hover:bg-zinc-900/40 transition-colors ${selectedDebtorIds.has(d.id) ? "bg-emerald-500/5" : ""}`}>
                                  <td className={`px-3 py-3 sticky left-0 z-[5] ${selectedDebtorIds.has(d.id) ? "bg-emerald-950/60" : "bg-zinc-950"} backdrop-blur-sm`}>
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
                                  <td className={`px-5 py-3 font-bold text-white min-w-[160px] sticky left-8 z-[5] ${selectedDebtorIds.has(d.id) ? "bg-emerald-950/60" : "bg-zinc-950"} backdrop-blur-sm shadow-[2px_0_8px_rgba(0,0,0,0.4)]`}>
                                    <input aria-label={`Cliente do registro ${d.document || d.client}`}
                                      type="text"
                                      value={d.client}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "client", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-bold text-white"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono text-zinc-400">
                                    <input aria-label={`Documento do registro ${d.document || d.client}`}
                                      type="text"
                                      value={d.document}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "document", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-20 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono"
                                    />
                                  </td>
                                  <td className="px-4 py-3 min-w-[90px]">
                                    <input aria-label={`Banco do registro ${d.document || d.client}`}
                                      type="text"
                                      value={d.bank || ""}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "bank", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      placeholder="—"
                                      className="w-full bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded px-1.5 py-1 text-zinc-400"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono">
                                    <input aria-label={`Vencimento do registro ${d.document || d.client}`}
                                      type="text"
                                      value={d.dueDate}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "dueDate", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      className="w-22 text-center bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono">
                                    <input aria-label={`Telefone WhatsApp do registro ${d.document || d.client}`}
                                      type="text"
                                      value={d.phone || ""}
                                      onChange={(e) => updateDebtorFieldLocal(d.id, "phone", e.target.value)}
                                      onBlur={() => saveDebtorFieldToDB(d.id)}
                                      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                      placeholder="Ex: 5577999998888"
                                      className="w-32 text-center bg-transparent hover:bg-zinc-950/40 focus:bg-zinc-950 rounded p-1 font-mono text-xs text-zinc-300 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono">
                                    <div className="inline-flex items-center justify-end">
                                      <span className="text-zinc-500 text-xs mr-px">R$</span>
                                      <input aria-label={`Valor do registro ${d.document || d.client}`}
                                        type="text"
                                        inputMode="decimal"
                                        value={editingValueDebtorId === d.id
                                          ? editingValueText
                                          : d.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        onFocus={() => { setEditingValueDebtorId(d.id); setEditingValueText(d.value.toLocaleString("pt-BR", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                                        onChange={(e) => {
                                          setEditingValueText(e.target.value);
                                        }}
                                        onBlur={() => confirmarValorEditado(d)}
                                        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                                        className="w-24 text-right bg-transparent focus:bg-zinc-950 rounded p-1 font-mono text-xs"
                                      />
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right font-mono text-white font-semibold tabular-nums">
                                    {formatBRL(d.updatedValue || d.value)}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <span 
                                      onClick={() => {
                                        // Vencido → A vencer → Recompra → Liquidado. Desabilitado não
                                        // cicla ao clicar (mude pela lista de desabilitados).
                                        const currentIdx = CATEGORY_CYCLE.indexOf(d.category);
                                        if (currentIdx === -1) return;
                                        const nextCat = CATEGORY_CYCLE[(currentIdx + 1) % CATEGORY_CYCLE.length];
                                        updateGeneralDebtorField(d.id, "category", nextCat);
                                      }}
                                      title={d.category === "desabilitado" && d.notes ? d.notes : undefined}
                                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase select-none transition-all ${d.category === "desabilitado" ? "cursor-default" : "cursor-pointer"}
                                        ${CATEGORY_BADGE[d.category]}
                                      `}
                                    >
                                      {CATEGORY_LABEL[d.category]}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <select
                                      value={d.representativeId || ""}
                                      onChange={(e) => updateGeneralDebtorField(d.id, "representativeId", e.target.value || undefined)}
                                      className="bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-300 rounded px-2 py-1 max-w-[140px] truncate focus:outline-none"
                                    >
                                      <option value="">Não Atribuído</option>
                                      {representatives.map(r => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-4 py-3 text-center">
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
                                  <td className="px-3 py-3 text-center min-w-[110px]">
                                    <div className="flex items-center justify-center gap-1.5">
                                      {uploadingPdfDebtorId === d.id ? (
                                        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                                          <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                                          Enviando…
                                        </span>
                                      ) : d.driveFileId ? (
                                        <>
                                          {d.driveFileUrl ? (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); openPdfPreview(d.driveFileUrl!, d.driveFileName || "boleto.pdf"); }}
                                              className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors max-w-[70px] truncate cursor-pointer"
                                              title={`Visualizar ${d.driveFileName || "boleto.pdf"}`}
                                            >
                                              <Eye className="w-3 h-3 shrink-0" />
                                              <span className="truncate">{d.driveFileName || "PDF"}</span>
                                            </button>
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
                                  <td className="px-5 py-3 text-right">
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
                                        onClick={() => void moverArquivo([d.id], true)}
                                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                                        title="Arquivar (sai da carteira ativa; dá para restaurar)"
                                        aria-label={`Arquivar ${d.client}`}
                                      >
                                        <Archive className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setExcluirConfirm({ tipo: "um", debtor: d })}
                                        className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title="Excluir devedor"
                                        aria-label={`Excluir ${d.client}`}
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

                  </>)}
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
                            <input aria-label="URL da Planilha *"
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
                            <input aria-label="Nome da Aba"
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
                {/* Mesmo padrão da Importar carteira: cantos retos, rótulos mono,
                    cor só no tipo do título. Campos na ordem do que importa:
                    cliente, valor e vencimento primeiro; o resto é opcional. */}
                {showAddDebtorModal && (() => {
                  const rotulo = "block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5";
                  const opcional = <span className="normal-case tracking-normal text-zinc-600"> · opcional</span>;
                  const campo = "w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors";
                  const tipos = [
                    { value: "vencidos",  label: "Vencidos",   cor: "#e11d48", description: "Multa e juros" },
                    { value: "a_vencer",  label: "A vencer",   cor: "#d97706", description: "Aviso preventivo" },
                    { value: "recompra",  label: "Recompra",   cor: "#0284c7", description: "Como vencido" },
                    { value: "liquidado", label: "Liquidação", cor: "#059669", description: "Sem cobrança" },
                  ] as const;
                  const match = contactsByKey.get(contactKeyFromName(addDebtorForm.client));
                  const sugerirTelefone = Boolean(
                    match?.phone && addDebtorForm.phone.replace(/\D/g, "").length < 10 && addDebtorForm.client.trim().length >= 3,
                  );
                  const fechar = () => setShowAddDebtorModal(false);

                  return (
                    <div
                      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
                      onMouseDown={e => e.target === e.currentTarget && fechar()}
                      onKeyDown={e => e.key === "Escape" && fechar()}
                    >
                      <div role="dialog" aria-modal="true" aria-labelledby="novo-devedor-titulo" className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
                        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
                          <div>
                            <h3 id="novo-devedor-titulo" className="text-sm font-bold text-white">Novo devedor</h3>
                            <p className="text-xs text-zinc-500 mt-0.5">Cadastro manual de um título na carteira</p>
                          </div>
                          <button type="button" onClick={fechar} aria-label="Fechar" className="p-1 -mr-1 text-zinc-500 hover:text-white transition-colors cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        </header>

                        <form onSubmit={(e) => void handleAddDebtorManually(e)}>
                          <div className="px-5 py-4 space-y-4">

                            {/* Tipo do título */}
                            <div>
                              <span className={rotulo}>Tipo do título</span>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo do título">
                                {tipos.map(cat => {
                                  const ativo = addDebtorForm.category === cat.value;
                                  return (
                                    <button
                                      key={cat.value}
                                      type="button"
                                      role="radio"
                                      aria-checked={ativo}
                                      onClick={() => setAddDebtorForm(f => ({ ...f, category: cat.value }))}
                                      className={`px-2.5 py-2 rounded-md border text-left transition-colors cursor-pointer ${ativo ? "" : "border-zinc-800 hover:border-zinc-700"}`}
                                      style={ativo ? { borderColor: `${cat.cor}99`, background: `${cat.cor}1f` } : undefined}
                                    >
                                      <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: cat.cor }} />
                                        {cat.label}
                                      </span>
                                      <span className="block mt-0.5 text-[10px] text-zinc-500 leading-snug">{cat.description}</span>
                                    </button>
                                  );
                                })}
                              </div>
                              {addDebtorForm.category === "liquidado" && (
                                <p className="mt-2 flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2">
                                  <HandCoins className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                                  O título entra como pago na carteira. Nenhuma cobrança é enviada.
                                </p>
                              )}
                            </div>

                            {/* Cliente */}
                            <div>
                              <label htmlFor="novo-cliente" className={rotulo}>Cliente</label>
                              <input
                                id="novo-cliente"
                                type="text"
                                required
                                autoFocus
                                autoComplete="off"
                                value={addDebtorForm.client}
                                onChange={e => setAddDebtorForm(f => ({ ...f, client: e.target.value }))}
                                placeholder="Nome ou razão social"
                                className={campo}
                              />
                            </div>

                            {/* Valor + Vencimento */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label htmlFor="novo-valor" className={rotulo}>Valor</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 pointer-events-none">R$</span>
                                  <input
                                    id="novo-valor"
                                    type="text"
                                    inputMode="decimal"
                                    required
                                    value={addDebtorForm.value}
                                    onChange={e => setAddDebtorForm(f => ({ ...f, value: e.target.value.replace(/[^\d.,]/g, "") }))}
                                    placeholder="0,00"
                                    className={`${campo} pl-9 font-mono tabular-nums`}
                                  />
                                </div>
                              </div>
                              <div>
                                <label htmlFor="novo-vencimento" className={rotulo}>Vencimento</label>
                                <input
                                  id="novo-vencimento"
                                  type="text"
                                  inputMode="numeric"
                                  required
                                  value={addDebtorForm.dueDate}
                                  onChange={e => setAddDebtorForm(f => ({ ...f, dueDate: mascaraData(e.target.value) }))}
                                  placeholder="DD/MM/AAAA"
                                  className={`${campo} font-mono tabular-nums`}
                                />
                              </div>
                            </div>

                            {/* Documento + WhatsApp */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label htmlFor="novo-documento" className={rotulo}>Documento{opcional}</label>
                                <input
                                  id="novo-documento"
                                  type="text"
                                  value={addDebtorForm.document}
                                  onChange={e => setAddDebtorForm(f => ({ ...f, document: e.target.value }))}
                                  placeholder="Nº do título ou boleto"
                                  className={`${campo} font-mono`}
                                />
                              </div>
                              <div>
                                <label htmlFor="novo-telefone" className={rotulo}>WhatsApp{opcional}</label>
                                <input
                                  id="novo-telefone"
                                  type="tel"
                                  inputMode="tel"
                                  value={addDebtorForm.phone}
                                  onChange={e => setAddDebtorForm(f => ({ ...f, phone: mascaraTelefone(e.target.value) }))}
                                  placeholder="(00) 00000-0000"
                                  className={`${campo} font-mono tabular-nums`}
                                />
                              </div>
                            </div>

                            {/* Cliente já cadastrado: oferece o telefone salvo */}
                            {sugerirTelefone && match && (
                              <div className="flex items-center justify-between gap-3 text-xs bg-emerald-500/5 border border-emerald-500/20 rounded-md px-3 py-2">
                                <span className="flex items-center gap-2 min-w-0 text-emerald-200">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                                  <span className="truncate"><strong className="font-semibold">{match.clientName}</strong> já tem telefone salvo</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setAddDebtorForm(f => ({ ...f, phone: mascaraTelefone(match.phone) }))}
                                  className="flex-shrink-0 font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                                >
                                  Usar {mascaraTelefone(match.phone)}
                                </button>
                              </div>
                            )}

                            {/* Fornecedor */}
                            <div>
                              <label htmlFor="novo-fornecedor" className={rotulo}>Fornecedor{opcional}</label>
                              <input
                                id="novo-fornecedor"
                                type="text"
                                value={addDebtorForm.supplier}
                                onChange={e => setAddDebtorForm(f => ({ ...f, supplier: e.target.value }))}
                                placeholder="Quem emitiu o título, se não for a sua empresa"
                                className={campo}
                              />
                            </div>

                            {addDebtorError && (
                              <p role="alert" className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
                                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                                {addDebtorError}
                              </p>
                            )}
                          </div>

                          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800/80">
                            <button
                              type="button"
                              onClick={fechar}
                              className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={addDebtorSaving}
                              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              {addDebtorSaving
                                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando…</>
                                : <><Plus className="w-4 h-4" /> Adicionar devedor</>}
                            </button>
                          </footer>
                        </form>
                      </div>
                    </div>
                  );
                })()}
                </>
              )}

              {currentTab === "cobranca" && (() => {
                // ── Preparar envios ────────────────────────────────────────
                // Padrão das telas novas: Drive numa barra, lista de devedores
                // com busca à esquerda e a mensagem à direita.
                const card = "bg-zinc-950 border border-zinc-800 rounded-xl";
                const cabecalho = "flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80";
                const rotulo = "text-[10px] font-mono uppercase tracking-widest text-zinc-500";
                const termo = buscaEnvio.trim().toLowerCase();
                const listaEnvio = termo
                  ? debtors.filter(d => d.client.toLowerCase().includes(termo) || (d.document || "").toLowerCase().includes(termo))
                  : debtors;
                const sel = selectedDebtorForMessage;

                return (
                <div className="space-y-4">

                  {/* ── Boletos do Google Drive ───────────────────────────────── */}
                  <div className={`${card} px-4 py-3 space-y-2.5`}>
                    {/* Sem status ainda (ou falha ao consultar) não é "sem pasta": antes a
                        tela pedia para conectar a pasta enquanto o status carregava. */}
                    {driveFolderStatus === null ? (
                      <p className="text-xs text-zinc-500 flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando a pasta do Drive…
                      </p>
                    ) : driveFolderStatus.loadError ? (
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                        <p className="text-xs text-zinc-400 flex items-center gap-2 min-w-0">
                          <HardDrive className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                          <span>{driveFolderStatus.loadError}</span>
                        </p>
                        {driveFolderStatus.loadErrorStatus !== "bloqueado_plano" && (
                          <button
                            type="button"
                            onClick={() => { setDriveFolderStatus(null); void loadDriveFolderStatus(); }}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" /> Tentar de novo
                          </button>
                        )}
                      </div>
                    ) : driveFolderStatus.configured && !editingDriveFolder ? (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="flex items-center gap-2 min-w-0 flex-1 text-xs text-zinc-400">
                          <HardDrive className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                          <DriveHelpPopover />
                          <span className="truncate">
                            Boletos do Drive: <span className="text-zinc-200">{driveFolderStatus.folderName || "Drive"}</span>
                            <span className="text-zinc-500"> · {driveFolderStatus.fileCount} arquivo(s)</span>
                            {driveFolderStatus.indexing
                              ? <span className="text-sky-300"> · lendo {driveFolderStatus.contentIndexed ?? 0}/{driveFolderStatus.fileCount}…</span>
                              : driveFolderStatus.lastIndexedAt && (
                                <span className="text-zinc-500" title="Última leitura da pasta">
                                  {" "}· lida em {new Date(driveFolderStatus.lastIndexedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </span>
                              )}
                            {driveFolderStatus.isAccessible === false && <span className="text-amber-300"> · sem acesso à pasta</span>}
                            {driveFolderStatus.unmatchedDebtors > 0 && <span className="text-zinc-500"> · {driveFolderStatus.unmatchedDebtors} sem boleto</span>}
                          </span>
                        </span>
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleSyncDriveFolder()}
                            disabled={isDriveSyncing}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-white disabled:opacity-50 inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Ler a pasta de novo e atualizar o índice"
                          >
                            <RefreshCw className={`w-3 h-3 ${isDriveSyncing ? "animate-spin" : ""}`} /> {isDriveSyncing ? "Lendo…" : "Reindexar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setDriveFolderUrl(""); setDriveSaveMsg(null); setEditingDriveFolder(true); }}
                            className="px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-400 hover:text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
                            title="Trocar a pasta do Google Drive"
                          >
                            <Pencil className="w-3 h-3" /> Trocar pasta
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleMatchDriveFiles()}
                            disabled={isDriveMatching}
                            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer"
                            title="Procurar no Drive o boleto de cada devedor"
                          >
                            {isDriveMatching ? <><RefreshCw className="w-3 h-3 animate-spin" /> Buscando…</> : <><Search className="w-3 h-3" /> Buscar boletos</>}
                          </button>
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-xs text-zinc-400 flex items-center gap-2">
                          <HardDrive className="w-3.5 h-3.5 text-zinc-500" />
                          {driveFolderStatus?.configured ? "Trocar a pasta de boletos do Drive" : "Conecte a pasta de boletos do Google Drive"}
                          <DriveHelpPopover />
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={driveFolderUrl}
                            onChange={(e) => setDriveFolderUrl(e.target.value)}
                            placeholder="Cole o link da pasta do Google Drive…"
                            aria-label="Link da pasta do Google Drive"
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveDriveFolder()}
                            disabled={isDriveSaving || !driveFolderUrl.trim()}
                            className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black text-xs font-bold transition-colors cursor-pointer inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                          >
                            {isDriveSaving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : (driveFolderStatus?.configured ? "Salvar nova pasta" : "Conectar pasta")}
                          </button>
                          {driveFolderStatus?.configured && (
                            <button
                              type="button"
                              onClick={() => { setEditingDriveFolder(false); setDriveFolderUrl(""); setDriveSaveMsg(null); }}
                              className="px-3.5 py-2 rounded-lg text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 text-xs transition-colors whitespace-nowrap cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                        {driveFolderStatus?.configured && (
                          <p className="text-[10px] text-zinc-500">
                            Pasta atual: <span className="text-zinc-400">{driveFolderStatus.folderName || "Drive"}</span>. A nova pasta substitui a atual e é lida de novo.
                          </p>
                        )}
                      </div>
                    )}

                    {driveSaveMsg && (
                      <p className={`text-[11px] rounded-lg px-3 py-2 border ${driveSaveMsg.ok ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-300 bg-rose-500/10 border-rose-500/20"}`}>
                        {driveSaveMsg.text}
                      </p>
                    )}
                    {driveMatchResult && !driveMatchResult.success && (
                      <p className="text-[11px] rounded-lg px-3 py-2 border text-rose-300 bg-rose-500/10 border-rose-500/20">
                        {driveMatchResult.error ?? DRIVE_STATUS_LABELS[driveMatchResult.status]}
                      </p>
                    )}
                    {driveMatchResult && driveMatchResult.success && (
                      <p className="text-[11px] rounded-lg px-3 py-2 border text-emerald-300 bg-emerald-500/10 border-emerald-500/20">
                        {driveMatchResult.debtorsMatched > 0
                          ? `Encontramos ${driveMatchResult.debtorsMatched} boleto(s) — confirme "Anexar" em cada devedor abaixo.`
                          : "Nenhum boleto correspondente encontrado na pasta."}
                      </p>
                    )}
                    {driveBoletoMsg && (
                      <p className={`text-[11px] rounded-lg px-3 py-2 border ${driveBoletoMsg.ok ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : "text-rose-300 bg-rose-500/10 border-rose-500/20"}`}>
                        {driveBoletoMsg.text}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* ── Devedores ───────────────────────────────────────────── */}
                    <section className={`${card} lg:col-span-5`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Devedores</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Escolha quem vai receber a mensagem</p>
                        </div>
                        <span className="text-[11px] text-zinc-500 font-mono flex-shrink-0">{listaEnvio.length}</span>
                      </header>
                      <div className="px-4 py-3 border-b border-zinc-900">
                        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 focus-within:border-zinc-600">
                          <Search className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                          <input
                            type="text"
                            value={buscaEnvio}
                            onChange={(e) => setBuscaEnvio(e.target.value)}
                            placeholder="Buscar cliente ou documento…"
                            aria-label="Buscar devedor"
                            className="w-full text-xs text-zinc-200 bg-transparent focus:outline-none placeholder:text-zinc-600"
                          />
                        </div>
                      </div>

                      <div className="max-h-[520px] overflow-y-auto p-2 space-y-1">
                        {listaEnvio.length === 0 && (
                          <p className="px-5 py-8 text-xs text-zinc-500 text-center">
                            {debtors.length === 0 ? "A carteira está vazia." : "Nenhum devedor encontrado."}
                          </p>
                        )}
                        {listaEnvio.map((d) => {
                          const isSelected = sel?.id === d.id;
                          const isEditingPhone = editingPhoneDebtorId === d.id;

                          return (
                            <div
                              key={d.id}
                              className={`rounded-lg border transition-colors ${isSelected ? "border-emerald-500/40 bg-emerald-500/10" : "border-transparent hover:bg-zinc-900/50"}`}
                            >
                              <button
                                type="button"
                                onClick={() => setSelectedDebtorForMessage(d)}
                                aria-pressed={isSelected}
                                className="w-full flex items-start justify-between gap-3 px-3 pt-2.5 pb-1.5 text-left cursor-pointer"
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold text-white truncate">{d.client}</span>
                                  <span className="block text-[10px] text-zinc-500 font-mono mt-0.5">{d.document} · {d.dueDate}</span>
                                </span>
                                <span className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <span className="text-xs font-mono text-white tabular-nums">{formatBRL(d.value)}</span>
                                  <span className="flex items-center gap-1.5">
                                    {d.status === "sent" && (
                                      <span className="text-[9px] text-emerald-400 flex items-center gap-0.5">
                                        <Check className="w-2.5 h-2.5" strokeWidth={3} /> Enviado
                                      </span>
                                    )}
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wide font-bold font-mono ${CATEGORY_TINT[d.category]}`}>
                                      {CATEGORY_LABEL[d.category]}
                                    </span>
                                  </span>
                                </span>
                              </button>

                              {/* Telefone e boleto */}
                              <div className="px-3 pb-2.5 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  {isEditingPhone ? (
                                    <>
                                      <input
                                        type="text"
                                        value={editingPhoneValue}
                                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") void saveCobrancaPhone(d.id); if (e.key === "Escape") setEditingPhoneDebtorId(null); }}
                                        autoFocus
                                        aria-label={`Telefone de ${d.client}`}
                                        className="flex-1 bg-zinc-900 border border-emerald-500/40 rounded px-2 py-1 text-[10px] font-mono text-white focus:outline-none"
                                        placeholder="5577999998888"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void saveCobrancaPhone(d.id)}
                                        className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                                      >
                                        OK
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPhoneDebtorId(null)}
                                        className="text-zinc-500 hover:text-zinc-300 px-1 transition-colors cursor-pointer"
                                        aria-label="Cancelar edição do telefone"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className={`text-[10px] font-mono flex-1 truncate ${d.phone ? "text-zinc-400" : "text-amber-400"}`}>
                                        {d.phone || "sem telefone"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setEditingPhoneValue(d.phone || ""); setEditingPhoneDebtorId(d.id); }}
                                        className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5 rounded cursor-pointer"
                                        title="Editar telefone"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 min-w-0">
                                  {uploadingPdfDebtorId === d.id ? (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-1">
                                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" /> Enviando PDF…
                                    </span>
                                  ) : importingBoletoId === d.id ? (
                                    <span className="text-[10px] text-zinc-400 flex items-center gap-1.5 flex-1">
                                      <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" /> Importando do Drive…
                                    </span>
                                  ) : (d.driveFileId && d.driveFileId !== "uploaded") ? (
                                    /* Sugerido: achado no Drive, aguardando confirmação */
                                    <div className="flex-1 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                      <span className="text-[10px] text-sky-300 flex items-center gap-1 truncate min-w-0" title={d.driveFileName || "boleto.pdf"}>
                                        <HardDrive className="w-3 h-3 flex-shrink-0" />
                                        No Drive{typeof d.driveMatchScore === "number" ? ` (${Math.round(d.driveMatchScore * 100)}%)` : ""}: {d.driveFileName || "boleto.pdf"}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); void handleAttachDriveBoleto(d.id); }}
                                        className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black text-[10px] font-bold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                      >
                                        <Check className="w-3 h-3" strokeWidth={3} /> Anexar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); void handleIgnoreDriveBoleto(d.id); }}
                                        className="px-2 py-0.5 rounded text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 text-[10px] transition-colors cursor-pointer"
                                      >
                                        Ignorar
                                      </button>
                                    </div>
                                  ) : d.driveFileId === "uploaded" ? (
                                    <>
                                      <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 flex-1 truncate" title={d.driveFileName || "boleto.pdf"}>
                                        📎 {d.driveFileName || "boleto.pdf"}
                                      </span>
                                      {d.driveFileUrl && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); openPdfPreview(d.driveFileUrl!, d.driveFileName || "boleto.pdf"); }}
                                          className="text-zinc-500 hover:text-zinc-200 transition-colors p-0.5 rounded cursor-pointer"
                                          title="Visualizar PDF"
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); void handlePdfRemove(d.id); }}
                                        className="text-zinc-600 hover:text-rose-400 transition-colors p-0.5 rounded cursor-pointer"
                                        title="Remover PDF"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-[10px] text-zinc-600 flex-1 truncate">Sem boleto</span>
                                      <label
                                        htmlFor={`pdf-upload-${d.id}`}
                                        className="text-[10px] text-zinc-500 hover:text-zinc-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                                        title="Anexar PDF do boleto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Upload className="w-3 h-3" /> Anexar
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
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* ── Mensagem ────────────────────────────────────────────── */}
                    <section className={`${card} lg:col-span-7 flex flex-col`}>
                      {sel ? (
                        <>
                          <header className={cabecalho}>
                            <div className="min-w-0">
                              <p className={rotulo}>Mensagem para</p>
                              <h4 className="mt-1 text-sm font-bold text-white truncate">{sel.client}</h4>
                              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                                {sel.document} · WhatsApp {sel.phone || <span className="text-amber-400 font-sans">não informado</span>}
                              </p>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide font-bold font-mono flex-shrink-0 ${CATEGORY_TINT[sel.category]}`}>
                              {CATEGORY_LABEL[sel.category]}
                            </span>
                          </header>

                          <div className="px-5 py-4 space-y-4 flex-1 flex flex-col">
                            <div>
                              <p className={`${rotulo} mb-2`}>Tom</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tom da mensagem">
                                {(["amigavel", "neutro", "firme", "juridico"] as const).map((tone) => {
                                  const ativo = selectedTone === tone;
                                  return (
                                    <button
                                      key={tone}
                                      type="button"
                                      role="radio"
                                      aria-checked={ativo}
                                      onClick={() => setSelectedTone(tone)}
                                      className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-colors border cursor-pointer ${
                                        ativo ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                                      }`}
                                    >
                                      {tone === "amigavel" ? "Amigável" : tone === "neutro" ? "Neutro" : tone === "firme" ? "Firme" : "Jurídico"}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="flex-1 flex flex-col">
                              <label htmlFor="mensagem-envio" className={`${rotulo} mb-2 block`}>Texto (pode editar)</label>
                              <textarea
                                id="mensagem-envio"
                                rows={12}
                                value={customMessageDraft}
                                onChange={(e) => setCustomMessageDraft(e.target.value)}
                                className="w-full flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 transition-colors leading-relaxed"
                              />
                              <p className="mt-1.5 text-[11px] text-zinc-500">
                                Valor na mensagem: <span className="font-mono text-zinc-300">{formatBRL(sel.value)}</span> — o valor original, sem multa e juros
                                {(sel.updatedValue || sel.value) !== sel.value && <> (corrigido: <span className="font-mono">{formatBRL(sel.updatedValue || sel.value)}</span>)</>}.
                              </p>
                            </div>

                            {messageFeedback && (
                              <p className={`px-3 py-2 border rounded-lg text-xs ${messageFeedback.success ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"}`}>
                                {messageFeedback.text}
                              </p>
                            )}
                          </div>

                          <footer className="px-5 py-3 border-t border-zinc-800/80 flex items-center justify-between gap-3">
                            <span className="text-[11px] text-zinc-500">
                              {!sel.phone ? "Informe o telefone na lista para enviar." : sel.status === "sent" ? "Já enviada antes para este devedor." : "Sai pelo seu WhatsApp."}
                            </span>
                            <button
                              onClick={handleSendMessage}
                              disabled={isSendingMessage || !sel.phone}
                              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              {isSendingMessage ? (
                                <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enviando…</>
                              ) : (
                                <><Send className="w-3.5 h-3.5" /> Enviar pelo WhatsApp</>
                              )}
                            </button>
                          </footer>
                        </>
                      ) : (
                        <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center px-8 py-12">
                          <SlidersHorizontal className="w-8 h-8 text-zinc-700 mb-3" />
                          <p className="text-xs font-semibold text-zinc-300">Escolha um devedor na lista</p>
                          <p className="text-[11px] text-zinc-500 mt-1 max-w-xs">A mensagem aparece aqui pronta para revisar, no tom que você escolher.</p>
                          {debtors.length === 0 && (
                            <button
                              type="button"
                              onClick={() => setCurrentTab("importar")}
                              className="mt-4 px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                              <Upload className="w-3.5 h-3.5" /> Importar carteira
                            </button>
                          )}
                        </div>
                      )}
                    </section>

                  </div>
                </div>
                );
              })()}

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
                      <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
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
                      <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
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
                          <History className="w-10 h-10 text-zinc-800 mx-auto" />
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
                                <th className="px-5 py-4 text-center">Canal / Tipo</th>
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
                                      {(() => {
                                        const enviado = log.dateSent ? new Date(log.dateSent) : null;
                                        return enviado && !Number.isNaN(enviado.getTime())
                                          ? enviado.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
                                          : "—";
                                      })()}
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
                                          <Check className="w-3 h-3" strokeWidth={3} /> Sucesso
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
                                          <X className="w-3 h-3" /> Erro
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setSelectedLogDetail(selectedLogDetail?.id === log.id ? null : log);
                                          }}
                                          className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-all text-[11px] font-semibold border border-zinc-800"
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
                                  {selectedLogDetail?.id === log.id && (() => {
                                    // Reconstrói a mensagem completa a partir do template (tom) + dados
                                    // do log. O banco guarda só um preview de 100 chars por privacidade
                                    // (LGPD); aqui remontamos localmente, sem armazenar o texto completo.
                                    const debtor = debtors.find(d => d.document === log.document);
                                    const rebuilt = fillMessageTemplate(getMessageTemplate(log.tone), {
                                      clientName:     log.client,
                                      documentNumber: log.document,
                                      dueDate:        debtor?.dueDate ?? "",
                                      amount:         Number(log.value) || 0,
                                      companyName:    empresaAssinatura,
                                    });
                                    // Oculta valor e nº do documento com * (mantém a estrutura visível).
                                    let fullMessage = rebuilt.replace(/R\$\s*[\d.,]+/g, (m) => m.replace(/\d/g, "*"));
                                    if (log.document) {
                                      fullMessage = fullMessage.split(log.document).join(log.document.replace(/[A-Za-z0-9]/g, "*"));
                                    }
                                    return (
                                    <tr className="bg-zinc-950/50">
                                      <td colSpan={6} className="px-6 py-4 border-t border-zinc-900">
                                        <div className="space-y-2 text-left">
                                          <div className="flex items-center justify-between text-[11px]">
                                            <span className="font-bold text-zinc-400">Conteúdo do Disparo (Tom: <span className="text-emerald-400 capitalize font-mono font-bold">{log.tone}</span>)</span>
                                            <button
                                              onClick={() => {
                                                navigator.clipboard.writeText(fullMessage);
                                                alert("Mensagem copiada para a área de transferência!");
                                              }}
                                              className="text-emerald-400 hover:underline cursor-pointer text-[10px]"
                                            >
                                              Copiar Mensagem Como Texto
                                            </button>
                                          </div>
                                          <pre className="p-4 rounded-xl bg-zinc-950 border border-zinc-900 text-zinc-300 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                                            {fullMessage}
                                          </pre>
                                          <p className="text-[10px] text-zinc-600">
                                            Mensagem reconstruída a partir do modelo e dos dados desta cobrança. Por privacidade, o valor e o documento aparecem ocultos (*) e o texto completo não é armazenado.
                                          </p>
                                        </div>
                                      </td>
                                    </tr>
                                    );
                                  })()}
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

              {currentTab === "automacoes" && (() => {
                // ── Automações ─────────────────────────────────────────────
                // Padrão das telas novas: regras numa seção (uma por linha),
                // formulário de nova regra em seção própria, execuções recentes.
                const card = "bg-zinc-950 border border-zinc-800 rounded-xl";
                const cabecalho = "flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80";
                const rotulo = "block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5";
                const campo = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors";
                const selecionavel = (ativo: boolean) =>
                  `px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    ativo ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`;
                const nomeTom = (t: string) => t === "amigavel" ? "Amigável" : t === "neutro" ? "Neutro" : t === "firme" ? "Firme" : "Jurídico";
                const execucoes = verTodasExecucoes ? automationRuns : automationRuns.slice(0, 7);
                const ativas = automationRules.filter(r => r.enabled).length;

                return (
                <div className="space-y-4">

                  {plan === "basic" && (
                    <div className={`${card} border-amber-700/40 px-5 py-4 flex flex-wrap items-center justify-between gap-3`}>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">Automação disponível nos planos Pro e Premium</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Com a automação o sistema cobra sozinho, todo dia. O Premium ainda permite janela de envio, limite diário e prioridade na fila.
                        </p>
                      </div>
                      <button
                        onClick={handleOpenBillingPortal}
                        className="flex-shrink-0 px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors cursor-pointer"
                      >
                        Trocar de plano
                      </button>
                    </div>
                  )}

                  {automationError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-xs text-rose-200 flex items-center justify-between gap-3">
                      <span>{automationError}</span>
                      <button onClick={() => setAutomationError("")} className="text-rose-400 hover:text-rose-200 cursor-pointer" aria-label="Fechar aviso"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  )}

                  {/* ── Barra ───────────────────────────────────────────────── */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      As regras ativas disparam todo dia às 8h (horário de Brasília).
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void loadAutomationData()}
                        disabled={isLoadingAutomation}
                        className="px-3 py-2 text-xs border border-zinc-800 text-zinc-300 hover:border-zinc-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 text-zinc-500 ${isLoadingAutomation ? "animate-spin" : ""}`} />
                        Atualizar
                      </button>
                      {plan !== "basic" && (
                        <button
                          onClick={abrirNovaRegra}
                          className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          Nova regra
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Nova regra ──────────────────────────────────────────── */}
                  {showCreateRuleForm && plan !== "basic" && (
                    <form id="form-regra" onSubmit={(e) => void handleCreateRule(e)} className={`${card} scroll-mt-20`}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">{editingRuleId ? "Editar regra" : "Nova regra"}</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Quem cobrar, com qual tom e em quais dias</p>
                        </div>
                        <button type="button" onClick={fecharFormRegra} className="p-1 text-zinc-500 hover:text-white cursor-pointer" aria-label="Fechar">
                          <X className="w-4 h-4" />
                        </button>
                      </header>

                      <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label htmlFor="regra-nome" className={rotulo}>Nome</label>
                          <input id="regra-nome"
                            type="text"
                            required
                            value={newRuleForm.name ?? ""}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Ex: Cobrar vencidos todo dia"
                            className={campo}
                          />
                        </div>

                        <div className={newRuleForm.ruleType === "due_in_days" ? "" : "sm:col-span-2"}>
                          <span className={rotulo}>Quem cobrar</span>
                          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de regra">
                            {([["overdue", "Vencidos"], ["due_today", "Vencem hoje"], ["due_in_days", "Vencem em X dias"]] as const).map(([val, txt]) => (
                              <button key={val} type="button" role="radio" aria-checked={(newRuleForm.ruleType ?? "overdue") === val}
                                onClick={() => setNewRuleForm((p) => ({ ...p, ruleType: val }))}
                                className={selecionavel((newRuleForm.ruleType ?? "overdue") === val)}>
                                {txt}
                              </button>
                            ))}
                          </div>
                        </div>

                        {newRuleForm.ruleType === "due_in_days" && (
                          <div>
                            <label htmlFor="regra-dias" className={rotulo}>Dias antes do vencimento</label>
                            <input id="regra-dias"
                              type="number"
                              min={1}
                              max={30}
                              value={newRuleForm.daysBefore ?? 3}
                              onChange={(e) => setNewRuleForm((p) => ({ ...p, daysBefore: Number(e.target.value) }))}
                              className={campo}
                            />
                          </div>
                        )}

                        <div className="sm:col-span-2">
                          <span className={rotulo}>Tom da mensagem</span>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tom da mensagem">
                            {(["amigavel", "neutro", "firme", "juridico"] as const).map((tone) => (
                              <button key={tone} type="button" role="radio" aria-checked={(newRuleForm.messageTone ?? "neutro") === tone}
                                onClick={() => setNewRuleForm((p) => ({ ...p, messageTone: tone, customMessage: getMessageTemplate(tone) }))}
                                className={selecionavel((newRuleForm.messageTone ?? "neutro") === tone)}>
                                {nomeTom(tone)}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <span className={rotulo}>Dias de envio</span>
                          <div className="flex flex-wrap gap-2">
                            {([["daily", "Todos os dias"], ["weekdays", "Só dias úteis (seg–sex)"]] as const).map(([val, txt]) => (
                              <button key={val} type="button" aria-pressed={(newRuleForm.scheduleMode ?? "daily") === val}
                                onClick={() => setNewRuleForm((p) => ({ ...p, scheduleMode: val }))}
                                className={selecionavel((newRuleForm.scheduleMode ?? "daily") === val)}>
                                {txt}
                              </button>
                            ))}
                            <button type="button" aria-pressed={newRuleForm.skipHolidays ?? false}
                              onClick={() => setNewRuleForm((p) => ({ ...p, skipHolidays: !(p.skipHolidays ?? false) }))}
                              className={`${selecionavel(newRuleForm.skipHolidays ?? false)} flex items-center gap-1.5`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${(newRuleForm.skipHolidays ?? false) ? "bg-emerald-400" : "bg-zinc-600"}`} />
                              Pular feriados nacionais
                            </button>
                          </div>
                          {isBrazilHoliday() && (
                            <p className="mt-1.5 text-[11px] text-amber-300/80">
                              Hoje é feriado nacional ({getBrazilHolidayName()}).
                              {(newRuleForm.skipHolidays ?? false) ? " Esta regra não dispara hoje." : " Esta regra dispara normalmente."}
                            </p>
                          )}
                          {!isBrazilHoliday() && (newRuleForm.scheduleMode ?? "daily") === "weekdays" && !isBusinessDay() && (
                            <p className="mt-1.5 text-[11px] text-zinc-500">Hoje é fim de semana — esta regra não dispara hoje.</p>
                          )}
                        </div>

                        {plan === "premium" && (
                          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div>
                              <label htmlFor="regra-janela-ini" className={rotulo}>Janela — início</label>
                              <input id="regra-janela-ini" type="time" value={newRuleForm.sendWindowStart ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, sendWindowStart: e.target.value || null }))}
                                className={campo} />
                            </div>
                            <div>
                              <label htmlFor="regra-janela-fim" className={rotulo}>Janela — fim</label>
                              <input id="regra-janela-fim" type="time" value={newRuleForm.sendWindowEnd ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, sendWindowEnd: e.target.value || null }))}
                                className={campo} />
                            </div>
                            <div>
                              <label htmlFor="regra-max" className={rotulo}>Máx. envios por dia</label>
                              <input id="regra-max" type="number" min={1} max={500} placeholder="Sem limite"
                                value={newRuleForm.maxDailySends ?? ""}
                                onChange={(e) => setNewRuleForm((p) => ({ ...p, maxDailySends: e.target.value ? Number(e.target.value) : null }))}
                                className={campo} />
                            </div>
                            <p className="sm:col-span-3 -mt-2 text-[10px] text-zinc-600">Recursos do plano Premium · horários de Brasília.</p>
                          </div>
                        )}

                        <div className="sm:col-span-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <label htmlFor="regra-mensagem" className={`${rotulo} mb-0`}>Mensagem</label>
                            <button
                              type="button"
                              onClick={() => setNewRuleForm((p) => ({ ...p, customMessage: getMessageTemplate(p.messageTone ?? "neutro") }))}
                              className="text-[11px] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                            >
                              Restaurar texto padrão
                            </button>
                          </div>
                          <textarea
                            id="regra-mensagem"
                            rows={7}
                            value={newRuleForm.customMessage ?? ""}
                            onChange={(e) => setNewRuleForm((p) => ({ ...p, customMessage: e.target.value || null }))}
                            placeholder="Olá {nome_cliente}, ..."
                            className={`${campo} resize-none text-xs leading-relaxed`}
                          />
                        </div>
                      </div>

                      <footer className="px-5 py-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[11px] text-zinc-500">
                          {(() => {
                            const ruleType = newRuleForm.ruleType ?? "overdue";
                            const daysBefore = newRuleForm.daysBefore ?? 3;
                            let matchCount = 0;
                            if (ruleType === "overdue") {
                              matchCount = debtors.filter(d => cobraComoVencido(d.category) && d.status !== "sent").length;
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
                              matchCount = debtors.filter(d => d.category === "a_vencer" && d.dueDate === todayStr).length;
                            }
                            return <><span className="font-mono text-zinc-200">{matchCount}</span> cliente{matchCount !== 1 ? "s" : ""} se encaixa{matchCount !== 1 ? "m" : ""} nesta regra hoje</>;
                          })()}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={fecharFormRegra}
                            className="px-3.5 py-2 text-xs border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 rounded-lg transition-colors cursor-pointer"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black rounded-lg transition-colors cursor-pointer"
                          >
                            {editingRuleId ? "Salvar alterações" : "Criar regra"}
                          </button>
                        </div>
                      </footer>
                    </form>
                  )}

                  {/* ── Regras ──────────────────────────────────────────────── */}
                  <section className={card}>
                    <header className={cabecalho}>
                      <div>
                        <h4 className="text-sm font-bold text-white">Regras</h4>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {automationRules.length === 0 ? "Nenhuma regra ainda" : `${ativas} de ${automationRules.length} ativa${automationRules.length !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </header>

                    {isLoadingAutomation ? (
                      <div className="px-5 py-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando regras…
                      </div>
                    ) : automationRules.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <p className="text-xs font-semibold text-zinc-300">Nenhuma regra configurada</p>
                        <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                          Crie uma regra e o sistema passa a cobrar sozinho, todo dia, quem se encaixar nela.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-900">
                        {automationRules.map((rule) => (
                          <div key={rule.id} className="flex items-center gap-4 px-5 py-3.5">
                            <button
                              onClick={() => void handleToggleRule(rule.id, !rule.enabled)}
                              title={rule.enabled ? "Pausar regra" : "Ativar regra"}
                              aria-label={`${rule.enabled ? "Pausar" : "Ativar"} a regra ${rule.name}`}
                              className="flex-shrink-0 cursor-pointer focus:outline-none group"
                              role="switch"
                              aria-checked={rule.enabled}
                            >
                              <span className={`relative block w-9 h-5 rounded-full transition-colors duration-200 ${rule.enabled ? "bg-emerald-500" : "bg-zinc-700 group-hover:bg-zinc-600"}`}>
                                <span className={`absolute top-[3px] left-[3px] w-3.5 h-3.5 bg-white rounded-full transition-transform duration-200 ${rule.enabled ? "translate-x-4" : "translate-x-0"}`} />
                              </span>
                            </button>

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className={`text-sm font-semibold truncate ${rule.enabled ? "text-white" : "text-zinc-400"}`}>{rule.name}</span>
                                {plan === "basic" && rule.enabled && (
                                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border text-amber-300 border-amber-500/30 bg-amber-500/10" title="Automações exigem plano Pro ou Premium. Esta regra não será executada.">
                                    Bloqueada no plano atual
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                {RULE_TYPE_LABELS[rule.ruleType]}
                                {rule.ruleType === "due_in_days" && rule.daysBefore != null && ` (${rule.daysBefore} dia${rule.daysBefore !== 1 ? "s" : ""})`}
                                {" · "}tom {nomeTom(rule.messageTone).toLowerCase()}
                                {" · "}{rule.scheduleMode === "weekdays" ? "seg–sex" : "todo dia"}
                                {rule.skipHolidays && " · pula feriados"}
                                {rule.sendWindowStart && rule.sendWindowEnd && ` · ${rule.sendWindowStart}–${rule.sendWindowEnd}`}
                                {rule.maxDailySends != null && ` · máx ${rule.maxDailySends}/dia`}
                              </p>
                            </div>

                            <button
                              onClick={() => abrirEdicaoRegra(rule)}
                              title="Editar regra"
                              aria-label={`Editar a regra ${rule.name}`}
                              className={`flex-shrink-0 p-1.5 rounded-lg transition-colors cursor-pointer ${
                                editingRuleId === rule.id ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                              }`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => void handleDeleteRule(rule.id)}
                              title="Excluir regra"
                              aria-label={`Excluir a regra ${rule.name}`}
                              className="flex-shrink-0 p-1.5 rounded-lg text-zinc-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <footer className="px-5 py-3 border-t border-zinc-800/80 text-[11px] text-zinc-500">
                      O mesmo cliente nunca recebe duas cobranças em menos de 20 horas, mesmo com a regra rodando todo dia.
                    </footer>
                  </section>

                  {/* ── Execuções ───────────────────────────────────────────── */}
                  {automationRuns.length > 0 && (
                    <section className={card}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Execuções</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">O que cada disparo diário fez</p>
                        </div>
                      </header>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-zinc-800 text-[10px] uppercase font-mono text-zinc-500 tracking-wider">
                              <th className="px-5 py-2.5 font-medium">Data</th>
                              <th className="px-3 py-2.5 font-medium">Status</th>
                              <th className="px-3 py-2.5 font-medium text-right" title="Devedores que se encaixavam nas regras">Elegíveis</th>
                              <th className="px-3 py-2.5 font-medium text-right">Criadas</th>
                              <th className="px-3 py-2.5 font-medium text-right" title="Puladas: cliente já cobrado nas últimas horas, título pago ou desabilitado, ou acima do limite diário">Puladas</th>
                              <th className="px-3 py-2.5 font-medium text-right">Enviadas</th>
                              <th className="px-5 py-2.5 font-medium text-right">Erros</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-900 text-zinc-300">
                            {execucoes.map((run) => (
                              <tr key={run.id} className="hover:bg-zinc-900/40 transition-colors">
                                <td className="px-5 py-2.5 font-mono text-zinc-400 text-[11px] whitespace-nowrap">
                                  {new Date(run.startedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${
                                    run.status === "success"
                                      ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
                                      : run.status === "running"
                                      ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                                      : "text-rose-300 border-rose-500/30 bg-rose-500/10"
                                  }`}>
                                    {run.status === "success" ? "Concluída" : run.status === "running" ? "Rodando" : run.status === "failed" ? "Falhou" : run.status}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{run.totalCandidates}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{run.jobsCreated}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-500">{run.jobsSkipped}</td>
                                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-white">{run.sent}</td>
                                <td className={`px-5 py-2.5 text-right font-mono tabular-nums ${run.failed > 0 ? "text-rose-300" : "text-zinc-600"}`}>{run.failed}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {automationRuns.length > 7 && (
                        <footer className="px-5 py-2.5 border-t border-zinc-800/80">
                          <button
                            type="button"
                            onClick={() => setVerTodasExecucoes(v => !v)}
                            className="text-[11px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {verTodasExecucoes ? "Mostrar só as 7 últimas" : `Ver todas (${automationRuns.length})`}
                          </button>
                        </footer>
                      )}
                    </section>
                  )}

                  {/* ── Como funciona: só enquanto não há regra ─────────────── */}
                  {automationRules.length === 0 && !isLoadingAutomation && (
                    <section className={card}>
                      <header className={cabecalho}>
                        <div>
                          <h4 className="text-sm font-bold text-white">Como funciona</h4>
                          <p className="text-xs text-zinc-500 mt-0.5">Configure uma vez e o sistema cobra sozinho</p>
                        </div>
                      </header>
                      <ol className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-zinc-900">
                        {[
                          { t: "Importe os devedores", d: "Em Importar carteira, envie o PDF ou a planilha." },
                          { t: "Crie uma regra", d: "Escolha quem cobrar (vencidos, a vencer), o tom e os dias." },
                          { t: "O sistema dispara", d: "Todo dia às 8h, pelo seu WhatsApp, para quem se encaixar." },
                          { t: "Acompanhe", d: "Cada envio aparece no Histórico de envios, com status e tom." },
                        ].map((p, i) => (
                          <li key={p.t} className="px-5 py-4">
                            <p className="text-[10px] font-mono text-emerald-400">{String(i + 1).padStart(2, "0")}</p>
                            <p className="mt-1.5 text-xs font-bold text-white">{p.t}</p>
                            <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">{p.d}</p>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                </div>
                );
              })()}

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
          {showGerenciarAssinatura && (
            <GerenciarAssinatura
              subscription={subscription}
              chargesSent={usage?.chargesSent ?? 0}
              onClose={() => setShowGerenciarAssinatura(false)}
              onAction={(action, planId) => subscriptionService.billingAction(action, planId)}
              onCheckout={(planId, cpfCnpj) => subscriptionService.createCheckoutSession(planId, cpfCnpj)}
              onChanged={syncSubscription}
            />
          )}

          {addDupModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <h3 className="text-sm font-bold text-white">
                  Já existe um boleto com o documento {addDupModal.novo.document}
                </h3>
                <div className="bg-zinc-950 rounded-xl p-3 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Cliente</span>
                    <span className="text-zinc-200 truncate">{addDupModal.existente.client}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Vencimento</span>
                    <span className="text-zinc-200 font-mono">{addDupModal.existente.dueDate}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-zinc-500">Valor</span>
                    <span className="text-zinc-200 font-mono">{formatBRL(addDupModal.existente.value)}</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Atualizar substitui os dados acima pelos que você acabou de preencher.
                  O boleto anterior deixa de existir.
                </p>
                <div className="grid grid-cols-1 gap-3 pt-1">
                  <button
                    onClick={() => {
                      const alvo = addDupModal.novo;
                      void salvarDevedorManual({ ...alvo, document: documentoLivre(alvo.document) });
                    }}
                    disabled={addDebtorSaving}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors cursor-pointer"
                  >
                    Criar como boleto separado
                    <span className="block text-[10px] font-normal opacity-80">
                      Salva com o documento {documentoLivre(addDupModal.novo.document)} e mantém o anterior
                    </span>
                  </button>
                  <button
                    onClick={() => void salvarDevedorManual(addDupModal.novo)}
                    disabled={addDebtorSaving}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-white transition-colors cursor-pointer"
                  >
                    Atualizar o existente
                    <span className="block text-[10px] font-normal opacity-80">Sobrescreve o boleto acima</span>
                  </button>
                </div>
                <button
                  onClick={() => setAddDupModal(null)}
                  disabled={addDebtorSaving}
                  className="w-full text-[10px] text-zinc-600 hover:text-zinc-400 disabled:opacity-50 transition-colors pt-1 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {excluirConfirm && (() => {
            const todos = excluirConfirm.tipo === "todos";
            const liberado = !todos || excluirTexto.trim().toUpperCase() === "EXCLUIR";
            const fechar = () => { setExcluirConfirm(null); setExcluirTexto(""); };
            const confirmar = () => {
              if (!liberado) return;
              if (excluirConfirm.tipo === "um") void deleteGeneralDebtor(excluirConfirm.debtor.id);
              else void clearOverviewVision();
              fechar();
            };
            return (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
                onMouseDown={e => e.target === e.currentTarget && fechar()}
                onKeyDown={e => e.key === "Escape" && fechar()}
              >
                <div role="alertdialog" aria-modal="true" aria-labelledby="excluir-titulo" className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl">
                  <div className="px-5 pt-5 pb-4 space-y-2">
                    <h3 id="excluir-titulo" className="text-sm font-bold text-white">
                      {todos ? `Apagar a carteira inteira (${excluirConfirm.total} clientes)?` : "Excluir este cliente?"}
                    </h3>
                    {excluirConfirm.tipo === "um" ? (
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        <strong className="text-zinc-200">{excluirConfirm.debtor.client}</strong>
                        {excluirConfirm.debtor.document ? ` · doc. ${excluirConfirm.debtor.document}` : ""}
                        {" · "}{excluirConfirm.debtor.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        {" "}sai da carteira de vez. Não dá para desfazer.
                        {!excluirConfirm.debtor.archivedAt && " Se só quer tirar da lista, arquive: dá para restaurar depois."}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                          Todos os clientes saem da carteira de vez. Não dá para desfazer.
                        </p>
                        <label htmlFor="excluir-confirmacao" className="block pt-1 text-[11px] text-zinc-500">
                          Para confirmar, digite <span className="font-mono text-zinc-300">EXCLUIR</span>
                        </label>
                        <input
                          id="excluir-confirmacao"
                          autoFocus
                          autoComplete="off"
                          value={excluirTexto}
                          onChange={e => setExcluirTexto(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && confirmar()}
                          className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-rose-500 transition-colors"
                        />
                      </>
                    )}
                  </div>
                  <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800/80">
                    {/* Quer só tirar da lista? Arquivar guarda o cliente e dá para restaurar. */}
                    {excluirConfirm.tipo === "um" && !excluirConfirm.debtor.archivedAt && (
                      <button
                        type="button"
                        onClick={() => { const id = excluirConfirm.debtor.id; fechar(); void moverArquivo([id], true); }}
                        className="mr-auto px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        <Archive className="w-3.5 h-3.5" /> Arquivar
                      </button>
                    )}
                    <button
                      type="button"
                      autoFocus={!todos}
                      onClick={fechar}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={confirmar}
                      disabled={!liberado}
                      className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {todos ? "Apagar tudo" : "Excluir"}
                    </button>
                  </footer>
                </div>
              </div>
            );
          })()}

          {revisaoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="bg-zinc-900 border border-amber-700/60 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <h3 className="text-sm font-bold text-white">
                  {revisaoModal.duvidosos} registro(s) precisam de revisão
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  A extração não conseguiu ler todos os campos desses registros — pode faltar
                  telefone, valor, vencimento ou documento. Eles estão marcados em âmbar na lista.
                </p>
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  Depois de importados eles viram cobranças normais, sem nenhuma marcação.
                  Revise antes de prosseguir.
                </p>
                <div className="grid grid-cols-1 gap-3 pt-1">
                  <button
                    onClick={() => setRevisaoModal(null)}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    Voltar e revisar
                    <span className="block text-[10px] font-normal opacity-80">Recomendado</span>
                  </button>
                  <button
                    onClick={() => { const p = revisaoModal.pending; setRevisaoModal(null); void doSendToOverview(p, true); }}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                  >
                    Importar assim mesmo
                    <span className="block text-[10px] font-normal opacity-80">Assumo o risco de cobrar com dado incompleto</span>
                  </button>
                </div>
              </div>
            </div>
          )}

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
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-zinc-800 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-zinc-500" />
                    <h3 className="text-sm font-bold text-white">Responsáveis</h3>
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
                      <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 gap-3">
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
                      <input aria-label="Nome *"
                        type="text"
                        value={repModalForm.name}
                        onChange={(e) => setRepModalForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Ex: João Silva"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-mono text-zinc-500 block mb-1">Cargo</label>
                      <input aria-label="Cargo"
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
                    <input aria-label="Telefone WhatsApp"
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
          {showDeleteAccount && (
            <DeleteAccountModal
              onClose={() => setShowDeleteAccount(false)}
              onDeleted={() => { setShowDeleteAccount(false); void handleSignOut(); }}
            />
          )}

          {/* Modal: visualização do PDF do boleto (revisão) — isolado, ver PdfPreviewModal */}
          <PdfPreviewModal />

          {/* Aviso de responsabilidade ao anexar boleto (1ª vez) */}
          <BoletoResponsibilityModal
            open={!!pendingBoletoPdf}
            onConfirm={confirmBoletoAck}
            onClose={() => setPendingBoletoPdf(null)}
          />
        </>
      )}
    </div>
  );
}











