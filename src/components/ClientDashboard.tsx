/**
 * ClientDashboard — fluxo de cobrança em 3 passos para o cliente final.
 *
 * Fluxo: Upload → Prévia → Envio
 *
 * Categorias de importação:
 *  - vencidos   → cobráveis com juros/multa, seguem para WhatsApp
 *  - a_vencer   → acompanhamento preventivo, seguem para WhatsApp com tom amigável
 *  - liquidação → APENAS reconciliação (marcar como pago); NÃO geram cobrança
 *
 * Internamente usa o mesmo pipeline de:
 *  financeService.createMany → salva na base consolidada (Visão Geral)
 *  financeService.reconcileLiquidations → reconcilia liquidações
 *  whatsappBatchService.sendBatchCharges → envia via Z-API (apenas vencidos/a_vencer)
 *  driveFolderService.syncFolder → matching Drive automático antes do envio
 *
 * Sem: QR Code, instância Z-API, tokens, webhooks, status técnicos.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Send,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  Loader2,
  MessageSquare,
  Users,
  RotateCcw,
  BadgeCheck,
  Wifi,
  WifiOff,
  CheckCircle,
  Clock,
  HandCoins,
  Pencil,
  Check,
  UserCheck,
} from "lucide-react";
import { whatsappGatewayService } from "../services/whatsappGatewayService";
import { whatsappBatchService, type BatchChargeResult } from "../services/whatsappBatchService";
import { financeService } from "../services/financeService";
import { contactsService, contactKeyFromName, type Contact } from "../services/contactsService";
import { billingLogsService } from "../services/billingLogsService";
import { pilotService } from "../services/pilotService";
import { parseImportFile } from "../utils/importFileParser";
import { extractDocumentLocally } from "../services/localDocumentExtraction";
import { getMessageTemplate, fillMessageTemplate } from "../utils/messageTemplates";
import BatchConfirmModal, { type BatchConfirmData } from "./BatchConfirmModal";
import BoletoResponsibilityModal from "./BoletoResponsibilityModal";
import type { Debtor, MessageTone } from "../types";

// ─── Tone options ─────────────────────────────────────────────────────────────

const TONE_OPTIONS: { value: MessageTone; label: string; description: string }[] = [
  { value: "amigavel",  label: "Amigável",    description: "Abordagem leve e cordial, ideal para lembrete preventivo" },
  { value: "neutro",    label: "Neutro",       description: "Mensagem direta e profissional, foco na informação" },
  { value: "firme",     label: "Firme",        description: "Tom assertivo com aviso de escalonamento" },
  { value: "juridico",  label: "Jurídico",     description: "Notificação formal para casos mais críticos" },
];

// ─── Import category ──────────────────────────────────────────────────────────

type ImportCategory = "vencidos" | "a_vencer" | "recompra" | "liquidado";

// Cor só no marcador ao lado do nome (paleta validada para fundo escuro, a
// mesma do Dashboard e da Importação); o selecionado se destaca pela borda.
const CATEGORY_OPTIONS: { value: ImportCategory; label: string; description: string; cor: string }[] = [
  { value: "vencidos",  label: "Vencidos",   description: "Cobrados com multa e juros",     cor: "#e11d48" },
  { value: "a_vencer",  label: "A vencer",   description: "Aviso preventivo, tom amigável", cor: "#d97706" },
  { value: "recompra",  label: "Recompra",   description: "Cobrados como vencidos",         cor: "#0284c7" },
  { value: "liquidado", label: "Liquidação", description: "Marca como pago, sem cobrança",  cor: "#059669" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientDashboardProps {
  userId:               string;
  globalFinePct:        number;
  globalInterestDayPct: number;
  /** Cadastro de contatos (telefone salvo) por chave de cliente normalizada */
  knownContacts?: Map<string, Contact>;
  /** Aprende contatos (telefone) a partir de devedores persistidos */
  onLearnContacts?: (debtors: Debtor[]) => void | Promise<void>;
  /** Chamado após envio de lote (sucesso ou falha) — atualiza logs no pai */
  onBatchSent?: (result: BatchChargeResult) => void;
  /**
   * Chamado após salvar devedores na base consolidada (import + liquidação).
   * O pai deve recarregar os devedores do DB ao receber esta chamada.
   */
  onDebtorsImported?: () => void;
  /** Abre Configurações, onde o cliente conecta o próprio WhatsApp. */
  onGoToSettings?: () => void;
  /** Nome da empresa — assina as mensagens ({empresa}) */
  companyName?: string | null;
}

// ─── Step type ────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "sending" | "done" | "reconciling" | "reconciled";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDashboard({
  userId,
  globalFinePct,
  globalInterestDayPct,
  knownContacts,
  onLearnContacts,
  onBatchSent,
  onDebtorsImported,
  onGoToSettings,
  companyName = null,
}: ClientDashboardProps) {
  // ── WhatsApp status ──────────────────────────────────────────────────────────
  const [waConnected, setWaConnected]   = useState<boolean | null>(null);
  const [waChecking,  setWaChecking]    = useState(false);

  // ── Pilot mode ───────────────────────────────────────────────────────────────
  const [pilotRemaining, setPilotRemaining] = useState<number | null>(null);

  // ── Today's sent count ───────────────────────────────────────────────────────
  const [sentToday, setSentToday] = useState<number>(0);

  // ── Inline phone editing on debtor cards ─────────────────────────────────────
  const [editingPhoneId,    setEditingPhoneId]    = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState("");

  // ── Sugestão de preenchimento via cadastro de contatos ───────────────────────
  // Devedores importados sem telefone, mas cujo cliente já está cadastrado.
  const [phoneSuggestIds, setPhoneSuggestIds] = useState<Set<string>>(new Set());
  const [phoneSuggestDismissed, setPhoneSuggestDismissed] = useState(false);

  // ── PDF attachments (keyed by debtor document number) ────────────────────────
  // Stored locally before send; uploaded to Storage after createMany
  const [attachedPdfs,    setAttachedPdfs]    = useState<Map<string, File>>(new Map());
  // Boleto aguardando confirmação de responsabilidade (1ª vez que anexa).
  const [pendingBoletoAttach, setPendingBoletoAttach] = useState<{ docKey: string; file: File } | null>(null);

  // Aplica o anexo depois de garantido o aviso de responsabilidade.
  const attachBoleto = (docKey: string, file: File) => {
    const acked = (() => { try { return localStorage.getItem("ncf-boleto-ack-v1") === "1"; } catch { return false; } })();
    if (!acked) { setPendingBoletoAttach({ docKey, file }); return; }
    setAttachedPdfs(prev => new Map(prev).set(docKey, file));
  };
  const confirmBoletoAck = () => {
    try { localStorage.setItem("ncf-boleto-ack-v1", "1"); } catch { /* ignore */ }
    const pending = pendingBoletoAttach;
    setPendingBoletoAttach(null);
    if (pending) setAttachedPdfs(prev => new Map(prev).set(pending.docKey, pending.file));
  };
  const [uploadingPdfDoc, setUploadingPdfDoc] = useState<string | null>(null);

  // ── Import category ──────────────────────────────────────────────────────────
  const [importCategory, setImportCategory] = useState<ImportCategory>("vencidos");

  // ── Flow state ───────────────────────────────────────────────────────────────
  const [step,            setStep]           = useState<Step>("upload");
  const [isDragging,      setIsDragging]     = useState(false);
  const [isProcessing,    setIsProcessing]   = useState(false);
  const [processingMsg,   setProcessingMsg]  = useState("");
  const [extractError,    setExtractError]   = useState("");
  const [debtors,         setDebtors]        = useState<Debtor[]>([]);
  const [selectedIds,     setSelectedIds]    = useState<Set<string>>(new Set());
  const [selectedTone,    setSelectedTone]   = useState<MessageTone>("amigavel");
  const [confirmData,     setConfirmData]    = useState<BatchConfirmData | null>(null);
  const [isSending,       setIsSending]      = useState(false);
  const [sendResult,      setSendResult]     = useState<BatchChargeResult | null>(null);

  // ── Liquidação reconciliation state ─────────────────────────────────────────
  const [isReconciling,      setIsReconciling]      = useState(false);
  const [reconciledCount,    setReconciledCount]    = useState(0);
  const [reconcileError,     setReconcileError]     = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Init ─────────────────────────────────────────────────────────────────────
  const refreshWaStatus = useCallback(async () => {
    setWaChecking(true);
    try {
      // Use validateConnection (live Z-API check) so the status is always
      // current — getStatus() reads a potentially-stale cached DB value and
      // would show "Canal indisponível" even when the channel is active.
      const s = await whatsappGatewayService.validateConnection();
      setWaConnected(s.connected);
    } catch {
      setWaConnected(false);
    } finally {
      setWaChecking(false);
    }
  }, []);

  const refreshTodayCount = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const logs = await billingLogsService.listByUser(userId);
      const count = logs.filter(l => {
        const d = l.dateSent?.slice(0, 10) ?? "";
        return d === today && (l.status === "sent" || l.status === "sucesso");
      }).length;
      setSentToday(count);
    } catch {
      // non-critical
    }
  }, [userId]);

  const refreshPilotStatus = useCallback(async () => {
    try {
      const config = await pilotService.getConfig();
      if (config?.pilotEnabled) {
        const counter = await pilotService.getTodayCounter();
        const sent = counter?.sentCount ?? 0;
        setPilotRemaining(Math.max(0, config.dailySendLimit - sent));
      } else {
        setPilotRemaining(null);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void refreshWaStatus();
    void refreshTodayCount();
    void refreshPilotStatus();
  }, [refreshWaStatus, refreshTodayCount, refreshPilotStatus]);

  // ── Inline phone save ─────────────────────────────────────────────────────────

  const savePhone = useCallback((debtorId: string) => {
    const phone = editingPhoneValue.trim();
    if (!phone) return;
    // Atualiza só o estado local — será persistido junto com createMany ao enviar
    setDebtors(prev => prev.map(d => d.id === debtorId ? { ...d, phone } : d));
    setEditingPhoneId(null);
    setEditingPhoneValue("");
  }, [editingPhoneValue]);

  // ── File handling ─────────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file) return;
    setExtractError("");
    setIsProcessing(true);
    setProcessingMsg("Lendo arquivo…");

    try {
      setProcessingMsg("Extraindo dados do arquivo…");
      let rawText: string;
      try {
        rawText = await parseImportFile(file);
      } catch (parseErr) {
        setExtractError(
          parseErr instanceof Error
            ? parseErr.message
            : "Não foi possível ler o arquivo. Verifique o formato e tente novamente."
        );
        setIsProcessing(false);
        return;
      }

      setProcessingMsg("Identificando registros…");
      const extraction = await extractDocumentLocally(rawText, importCategory, file);

      const extracted: Debtor[] = extraction.records.map((d) => ({
        id: crypto.randomUUID(),
        client: d.client,
        supplier: d.supplier,
        document: d.document,
        dueDate: d.dueDate,
        value: d.value,
        phone: d.phone,
        // ── Usa a categoria selecionada pelo usuário ──────────────────────────
        category: importCategory,
        status: "pending",
        interestApplied: importCategory === "liquidado" ? 0 : globalInterestDayPct,
        fineApplied:     importCategory === "liquidado" ? 0 : globalFinePct,
        updatedValue:
          importCategory === "liquidado"
            ? d.value
            : Math.round(d.value * (1 + globalFinePct / 100) * 100) / 100,
      }));

      if (extracted.length === 0) {
        const detail = extraction.warnings.length > 0
          ? extraction.warnings[0]
          : "Verifique se o arquivo contém dados de cobrança legíveis.";
        setExtractError(`Nenhum registro identificado. ${detail}`);
        setIsProcessing(false);
        return;
      }

      setDebtors(extracted);
      setSelectedIds(new Set(extracted.map(d => d.id)));

      // Detecta registros sem telefone cujo cliente já está cadastrado
      const suggestIds = new Set<string>();
      if (knownContacts && knownContacts.size > 0) {
        for (const d of extracted) {
          const missingPhone = !d.phone || d.phone.replace(/\D/g, "").length < 10;
          if (!missingPhone) continue;
          const match = knownContacts.get(contactKeyFromName(d.client));
          if (match && match.phone) suggestIds.add(d.id);
        }
      }
      setPhoneSuggestIds(suggestIds);
      setPhoneSuggestDismissed(false);

      // Liquidação → preview com botão de reconciliação (sem envio WhatsApp)
      setStep("preview");
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Falha ao processar o arquivo. Tente novamente."
      );
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  }, [globalFinePct, globalInterestDayPct, importCategory, knownContacts]);

  // Preenche os telefones sugeridos a partir do cadastro de contatos
  const applyPhoneSuggestions = useCallback(() => {
    if (!knownContacts) return;
    setDebtors(prev => prev.map(d => {
      if (!phoneSuggestIds.has(d.id)) return d;
      const match = knownContacts.get(contactKeyFromName(d.client));
      return match && match.phone ? { ...d, phone: match.phone } : d;
    }));
    setPhoneSuggestIds(new Set());
    setPhoneSuggestDismissed(true);
  }, [knownContacts, phoneSuggestIds]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processFile]);

  // ── Selection helpers ─────────────────────────────────────────────────────────

  const toggleAll = () => {
    if (selectedIds.size === debtors.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(debtors.map(d => d.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Liquidação: reconciliar pagamentos ────────────────────────────────────────

  const handleReconcile = async () => {
    const selected = debtors.filter(d => selectedIds.has(d.id));
    if (!selected.length) return;

    setIsReconciling(true);
    setReconcileError("");
    setStep("reconciling");

    try {
      // 1. Salva na base consolidada como "liquidado"
      await financeService.createMany(userId, selected);

      // Aprende contatos (telefone) dos registros salvos
      void onLearnContacts?.(selected);

      // 2. Marca devedores existentes com mesmo documento como liquidados
      const docs = selected.map(d => d.document).filter(Boolean);
      const count = await financeService.reconcileLiquidations(userId, docs);
      setReconciledCount(count);

      // 3. Notifica o pai para recarregar Visão Geral
      onDebtorsImported?.();

      setStep("reconciled");
    } catch (err) {
      setReconcileError(
        err instanceof Error ? err.message : "Falha na reconciliação. Tente novamente."
      );
      setStep("preview");
    } finally {
      setIsReconciling(false);
    }
  };

  // ── Send flow ─────────────────────────────────────────────────────────────────

  const handleSendClick = () => {
    if (selectedIds.size === 0) return;

    // Liquidações NÃO devem ir para cobrança
    const selected = debtors.filter(d => selectedIds.has(d.id));
    const liquidados = selected.filter(d => d.category === "liquidado");
    if (liquidados.length > 0) {
      // Redireciona automaticamente para o fluxo de reconciliação
      void handleReconcile();
      return;
    }

    const validPhone  = selected.filter(d => d.phone && d.phone.replace(/\D/g, "").length >= 10).length;
    const invalidPhone = selected.length - validPhone;

    const template = getMessageTemplate(selectedTone);

    // Build a filled example using the first valid-phone debtor (for preview display)
    const sampleDebtor = selected.find(d => d.phone && d.phone.replace(/\D/g, "").length >= 10) ?? selected[0];
    const filledPreview = sampleDebtor
      ? fillMessageTemplate(template, {
          clientName:     sampleDebtor.client,
          documentNumber: sampleDebtor.document,
          dueDate:        sampleDebtor.dueDate,
          amount:         sampleDebtor.value,
          companyName,
        })
      : template;

    setConfirmData({
      debtorCount:          selected.length,
      validPhoneCount:      validPhone,
      invalidPhoneCount:    invalidPhone,
      messagePreview:       template,
      messagePreviewFilled: filledPreview,
      sampleDebtorName:     sampleDebtor?.client ?? undefined,
      tone:                 TONE_OPTIONS.find(t => t.value === selectedTone)?.label ?? selectedTone,
      toneValue:            selectedTone,
      pilotRemaining,
      whatsappConnected:    waConnected ?? false,
    });
  };

  const handleConfirmSend = async (customMessage?: string | null) => {
    if (!confirmData) return;
    setConfirmData(null);
    setIsSending(true);
    setStep("sending");

    try {
      const selectedDebtors = debtors.filter(d => selectedIds.has(d.id));

      // Garante que nenhum liquidado entre no envio
      const cobráveis = selectedDebtors.filter(d => d.category !== "liquidado");

      let persisted: typeof cobráveis;
      try {
        persisted = await financeService.createMany(userId, cobráveis);
      } catch (persistErr) {
        throw new Error(
          "Falha ao salvar devedores antes do envio: " +
          (persistErr instanceof Error ? persistErr.message : "erro de rede") +
          ". Verifique sua conexão e tente novamente."
        );
      }

      // Notifica Visão Geral para recarregar
      onDebtorsImported?.();

      // Aprende contatos (telefone) dos registros enviados
      void onLearnContacts?.(persisted);

      // Upload de PDFs anexados — faz após createMany pois agora temos IDs reais.
      // Monta mapa debtorId → { path, name } para passar direto à Edge Function,
      // eliminando dependência de RLS no updatePdfAttachment.
      const debtorPdfPaths: Record<string, { path: string; name: string }> = {};
      const pdfUploadFailures: string[] = [];

      if (attachedPdfs.size > 0) {
        for (const saved of persisted) {
          const file = attachedPdfs.get(saved.document ?? "");
          if (file && saved.id) {
            try {
              setUploadingPdfDoc(saved.document ?? "");
              const ext  = file.name.split(".").pop() ?? "pdf";
              const path = `${userId}/${saved.id}/boleto.${ext}`;
              await financeService.uploadChargePdf(userId, saved.id, file);
              debtorPdfPaths[saved.id] = { path, name: file.name };
              // Also persist to DB (best-effort — not critical for current send)
              void financeService.updatePdfAttachment(userId, saved.id, {
                url: `${saved.id}`, // placeholder — real URL built in Edge Function
                name: file.name,
              }).catch(() => { /* non-fatal */ });
            } catch (e) {
              console.warn("[ClientDashboard] PDF upload failed for", saved.document, e);
              pdfUploadFailures.push(saved.document ?? saved.id ?? "?");
            }
          }
        }
        setUploadingPdfDoc(null);

        if (pdfUploadFailures.length > 0) {
          console.warn(
            `[ClientDashboard] ${pdfUploadFailures.length} PDF(s) não enviados para o servidor:`,
            pdfUploadFailures,
          );
          // Armazena aviso não-bloqueante — cobranças ainda serão enviadas sem PDF
          // (alert() removido para não bloquear fluxo em navegadores com popup bloqueado)
        }
      }

      const validIds = persisted.map(d => d.id).filter(Boolean) as string[];

      const result = await whatsappBatchService.sendBatchCharges({
        debtorIds:      validIds,
        tone:           selectedTone,
        customMessage:  customMessage ?? undefined,
        dryRun:         false,
        debtorPdfPaths: Object.keys(debtorPdfPaths).length > 0 ? debtorPdfPaths : undefined,
      });

      setSendResult(result);
      setStep("done");
      void refreshTodayCount();
      onBatchSent?.(result);
    } catch (err) {
      setSendResult({
        success:        false,
        status:         "erro_rede",
        dryRun:         false,
        totalRequested: selectedIds.size,
        totalProcessed: 0,
        sent:           0,
        failed:         selectedIds.size,
        duplicated:     0,
        invalidPhone:   0,
        blockedLimit:   0,
        blockedPlan:    0,
        usageAfter:     0,
        usageLimit:     0,
        error:          err instanceof Error ? err.message : "Erro inesperado.",
        results:        [],
      });
      setStep("done");
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = () => {
    setStep("upload");
    setDebtors([]);
    setSelectedIds(new Set());
    setSendResult(null);
    setExtractError("");
    setReconcileError("");
    setReconciledCount(0);
  };

  // ─── Render helpers ───────────────────────────────────────────────────────────
  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const isLiquidacao = importCategory === "liquidado";
  const catOption    = CATEGORY_OPTIONS.find(c => c.value === importCategory)!;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* ── Etapas + status do WhatsApp ───────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol aria-label="Etapas da cobrança" className="flex flex-wrap items-center gap-1 text-xs">
          {([["upload", "Importar"], ["preview", "Revisar"], ["sending", "Enviar"], ["done", "Acompanhar"]] as const).map(([id, label], i) => {
            const atual = step === id || (id === "sending" && step === "reconciling") || (id === "done" && step === "reconciled");
            return (
              <li key={id} aria-current={atual ? "step" : undefined}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md ${atual ? "bg-emerald-500/10 text-emerald-300" : "text-zinc-500"}`}>
                <span className={`font-mono text-[10px] ${atual ? "text-emerald-400" : "text-zinc-600"}`}>{String(i + 1).padStart(2, "0")}</span>
                {label}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center gap-2">
          {debtors.length > 0 && step === "preview" && (
            <span className="text-xs text-zinc-500 mr-1">
              <span className="font-mono text-white">{selectedIds.size}</span> selecionado{selectedIds.size !== 1 ? "s" : ""}
            </span>
          )}
          {waChecking ? (
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-zinc-400 border-zinc-700 bg-zinc-900 inline-flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Verificando
            </span>
          ) : waConnected === true ? (
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-emerald-300 border-emerald-500/30 bg-emerald-500/10 inline-flex items-center gap-1.5">
              <Wifi className="w-3 h-3" /> WhatsApp conectado
            </span>
          ) : waConnected === false ? (
            <span className="inline-flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border text-rose-300 border-rose-500/30 bg-rose-500/10 inline-flex items-center gap-1.5">
                <WifiOff className="w-3 h-3" /> WhatsApp não conectado
              </span>
              {onGoToSettings && (
                <button type="button" onClick={onGoToSettings} className="text-xs text-zinc-300 hover:text-white underline underline-offset-2 cursor-pointer">
                  Conectar
                </button>
              )}
            </span>
          ) : null}
          <button
            onClick={() => void refreshWaStatus()}
            disabled={waChecking}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer"
            title="Verificar status"
            aria-label="Verificar status do WhatsApp"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Step: Upload ───────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <section className="bg-zinc-950 border border-zinc-800 rounded-xl">
            <div className="px-5 py-4 border-b border-zinc-800/80">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">O que tem no arquivo</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tipo de arquivo">
                {CATEGORY_OPTIONS.map(cat => {
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

              {isLiquidacao && (
                <p className="mt-3 flex items-start gap-2 text-[11px] text-emerald-300 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <HandCoins className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                  <span>Os títulos encontrados serão marcados como pagos na carteira. Nenhuma cobrança é enviada.</span>
                </p>
              )}
            </div>

            <div className="p-5">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border border-dashed rounded-lg px-6 py-12 cursor-pointer transition-colors select-none ${
                  isDragging ? "border-emerald-400 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.txt"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                {isProcessing ? (
                  <>
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <p className="text-sm font-semibold text-white">{processingMsg}</p>
                    <p className="text-xs text-zinc-500">Aguarde um momento…</p>
                  </>
                ) : (
                  <>
                    <div className="w-11 h-11 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                      <Upload className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-sm font-semibold text-white">
                        {isLiquidacao ? "Arquivo com os pagamentos recebidos" : "Arraste o arquivo ou clique para escolher"}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {isLiquidacao
                          ? "Planilha ou PDF com os títulos pagos — conferido com a carteira"
                          : "Planilha Excel, CSV, PDF ou TXT com os dados dos devedores"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 font-mono">
                      {[".xlsx", ".xls", ".csv", ".pdf", ".txt"].map(ext => (
                        <span key={ext} className="px-1.5 py-0.5 border border-zinc-800 rounded">{ext}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {extractError && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
              <span>{extractError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Step: Preview ──────────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-5">

          {/* Tipo do arquivo importado */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-950 text-xs">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: catOption.cor }} />
            <span className="font-semibold text-white">{catOption.label}</span>
            <span className="text-zinc-500">· {catOption.description}</span>
            {isLiquidacao && (
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-emerald-300">Sem envio de cobrança</span>
            )}
          </div>

          {/* Sugestão: clientes já cadastrados com telefone salvo */}
          {phoneSuggestIds.size > 0 && !phoneSuggestDismissed && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5">
              <UserCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <p className="text-sm text-emerald-100 flex-1">
                {phoneSuggestIds.size === 1
                  ? "1 cliente já está cadastrado no sistema com telefone salvo."
                  : `${phoneSuggestIds.size} clientes já estão cadastrados no sistema com telefone salvo.`}{" "}
                Deseja preencher os dados automaticamente?
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPhoneSuggestDismissed(true)}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
                >
                  Agora não
                </button>
                <button
                  type="button"
                  onClick={applyPhoneSuggestions}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" strokeWidth={3} /> Preencher automaticamente
                </button>
              </div>
            </div>
          )}

          {/* Tone selector — apenas para cobráveis */}
          {!isLiquidacao && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
              <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-2">Tom da mensagem</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTone(t.value)}
                    aria-pressed={selectedTone === t.value}
                    className={`text-left px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedTone === t.value ? "border-emerald-500/40 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`block text-xs font-semibold ${selectedTone === t.value ? "text-emerald-300" : "text-zinc-300"}`}>{t.label}</span>
                    <span className="block mt-0.5 text-[10px] text-zinc-500 leading-snug">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Records table */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors
                    ${selectedIds.size === debtors.length
                      ? "bg-emerald-500 border-emerald-500"
                      : selectedIds.size > 0
                      ? "bg-emerald-500/40 border-emerald-500"
                      : "border-zinc-600"
                    }`}
                  >
                    {selectedIds.size > 0 && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  {isLiquidacao ? `Liquidações (${debtors.length})` : `Todos (${debtors.length})`}
                </button>
              </div>
              <span className="text-xs text-zinc-500">
                {selectedIds.size} de {debtors.length} selecionados
              </span>
            </div>

            <div className="divide-y divide-zinc-800/60 max-h-[360px] overflow-y-auto">
              {debtors.map(d => {
                const isSelected = selectedIds.has(d.id);
                const hasPhone   = d.phone && d.phone.replace(/\D/g, "").length >= 10;

                return (
                  <div
                    key={d.id}
                    onClick={() => toggleOne(d.id)}
                    className={`
                      flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                      ${isSelected ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-zinc-800/40"}
                    `}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                      ${isSelected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}
                    >
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.client}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        Doc: {d.document} · Venc: {d.dueDate}
                      </p>
                      {/* PDF attachment inline */}
                      {!isLiquidacao && (() => {
                        const docKey = d.document ?? "";
                        const file = attachedPdfs.get(docKey);
                        const isUploading = uploadingPdfDoc === docKey;
                        return (
                          <div className="flex items-center gap-1.5 mt-1" onClick={e => e.stopPropagation()}>
                            {isUploading ? (
                              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                                <RefreshCw className="w-2.5 h-2.5 animate-spin text-emerald-400" /> enviando PDF…
                              </span>
                            ) : file ? (
                              <>
                                <span className="text-[10px] text-emerald-400 font-mono truncate max-w-[120px]" title={file.name}>
                                  📎 {file.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setAttachedPdfs(prev => { const m = new Map(prev); m.delete(docKey); return m; })}
                                  className="text-zinc-600 hover:text-rose-400 transition-colors"
                                  title="Remover PDF"
                                >
                                  <XCircle className="w-3 h-3" />
                                </button>
                              </>
                            ) : (
                              <>
                                <label
                                  htmlFor={`pdf-cb-${d.id}`}
                                  className="text-[10px] text-zinc-500 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Anexar PDF do boleto"
                                >
                                  <Upload className="w-2.5 h-2.5" /> boleto PDF
                                </label>
                                <input
                                  id={`pdf-cb-${d.id}`}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="hidden"
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) attachBoleto(docKey, f);
                                    e.target.value = "";
                                  }}
                                />
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white font-mono">
                        {formatBRL(d.updatedValue ?? d.value)}
                      </p>
                      {!isLiquidacao && !hasPhone && (
                        editingPhoneId === d.id ? (
                          <div
                            className="flex items-center gap-1 mt-1"
                            onClick={e => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingPhoneValue}
                              onChange={e => setEditingPhoneValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") savePhone(d.id);
                                if (e.key === "Escape") { setEditingPhoneId(null); setEditingPhoneValue(""); }
                              }}
                              autoFocus
                              placeholder="5577999998888"
                              className="w-28 bg-zinc-800 border border-emerald-500/40 rounded px-1.5 py-0.5 text-[10px] font-mono text-white focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => savePhone(d.id)}
                              className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 px-1 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingPhoneId(null); setEditingPhoneValue(""); }}
                              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setEditingPhoneValue(d.phone || ""); setEditingPhoneId(d.id); }}
                            className="text-[10px] text-amber-400 hover:text-amber-300 flex items-center gap-1 justify-end mt-0.5 transition-colors cursor-pointer"
                          >
                            <AlertTriangle className="w-3 h-3" /> sem telefone
                            <Pencil className="w-2.5 h-2.5 opacity-70" />
                          </button>
                        )
                      )}
                      {isLiquidacao && (
                        <p className="text-[10px] text-emerald-400">liquidado</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reconcile error */}
          {reconcileError && (
            <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-lg px-4 py-3 text-xs text-rose-300">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{reconcileError}</span>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600 text-xs font-semibold transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Importar outro arquivo
            </button>

            {isLiquidacao ? (
              /* Liquidação: botão de reconciliação (NÃO envia WhatsApp) */
              <button
                onClick={() => void handleReconcile()}
                disabled={selectedIds.size === 0 || isReconciling}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer"
              >
                {isReconciling
                  ? <><Loader2 className="w-5 h-5 animate-spin" /> Reconciliando…</>
                  : <><CheckCircle className="w-5 h-5" /> Marcar como liquidado<ChevronRight className="w-4 h-4" /></>
                }
              </button>
            ) : (
              /* Cobráveis: botão de envio */
              <button
                onClick={handleSendClick}
                disabled={selectedIds.size === 0 || waConnected === false}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-sm transition-colors cursor-pointer"
              >
                <Send className="w-5 h-5" />
                Enviar cobranças
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {!isLiquidacao && waConnected === false && (
            <p className="text-xs text-rose-300 flex flex-wrap items-center gap-2">
              <WifiOff className="w-3.5 h-3.5" />
              Seu WhatsApp não está conectado — conecte o número para enviar.
              {onGoToSettings && (
                <button type="button" onClick={onGoToSettings} className="text-zinc-200 hover:text-white underline underline-offset-2 cursor-pointer">
                  Ir para Configurações
                </button>
              )}
            </p>
          )}
        </div>
      )}

      {/* ── Step: Reconciling ─────────────────────────────────────────────────── */}
      {step === "reconciling" && (
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-white">Reconciliando liquidações…</p>
            <p className="text-sm text-zinc-400">
              Atualizando status dos títulos na base consolidada.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: Reconciled ──────────────────────────────────────────────────── */}
      {step === "reconciled" && (
        <div className="space-y-5">
          <div className="rounded-xl border bg-zinc-950 border-emerald-500/30 p-6">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
              <div>
                <h3 className="text-lg font-bold text-white">Liquidações reconciliadas!</h3>
                <p className="text-sm text-zinc-400">
                  {reconciledCount > 0
                    ? `${reconciledCount} título${reconciledCount !== 1 ? "s" : ""} marcado${reconciledCount !== 1 ? "s" : ""} como liquidado na base consolidada.`
                    : "Registros salvos. Nenhum título anterior correspondente encontrado para atualização automática."
                  }
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center bg-zinc-900/60 rounded-xl p-3">
                <p className="text-2xl font-bold font-mono text-emerald-400">{debtors.filter(d => selectedIds.has(d.id)).length}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Registros importados</p>
              </div>
              <div className="text-center bg-zinc-900/60 rounded-xl p-3">
                <p className="text-2xl font-bold font-mono text-emerald-300">{reconciledCount}</p>
                <p className="text-xs text-zinc-500 mt-0.5">Títulos reconciliados</p>
              </div>
            </div>

            <p className="text-xs text-zinc-500 mt-4">
              Nenhuma mensagem de cobrança foi enviada. Confira na Carteira.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Nova importação
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Sending ──────────────────────────────────────────────────── */}
      {step === "sending" && (
        <div className="flex flex-col items-center justify-center gap-6 py-20">
          <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-lg font-semibold text-white">Enviando cobranças…</p>
            <p className="text-sm text-zinc-400">
              Aguarde enquanto as mensagens são processadas.
            </p>
          </div>
        </div>
      )}

      {/* ── Step: Done ─────────────────────────────────────────────────────── */}
      {step === "done" && sendResult && (
        <div className="space-y-5">
          <div className={`rounded-xl border bg-zinc-950 p-6 ${
            sendResult.success ? "border-emerald-500/30" : "border-rose-500/30"
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {sendResult.success
                ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                : <XCircle className="w-8 h-8 text-red-400" />
              }
              <div>
                <h3 className="text-lg font-bold text-white">
                  {sendResult.success
                    ? (sendResult.sent > 0 ? "Cobranças enviadas!" : "Lote processado")
                    : "Falha no envio"}
                </h3>
                <p className="text-sm text-zinc-400">
                  {sendResult.error
                    ?? (sendResult.sent === 0 && sendResult.duplicated > 0
                      ? `${sendResult.duplicated} mensagem(ns) bloqueada(s) por anti-duplicata (aguarde 5 min antes de reenviar as mesmas cobranças).`
                      : "Lote processado com sucesso.")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Enviadas",       value: sendResult.sent,         color: "text-emerald-400" },
                { label: "Com falha",      value: sendResult.failed,       color: "text-red-400" },
                { label: "Duplicadas",     value: sendResult.duplicated,   color: "text-amber-400" },
                { label: "Sem telefone",   value: sendResult.invalidPhone, color: "text-zinc-400" },
              ].map(stat => (
                <div key={stat.label} className="text-center bg-zinc-900/60 rounded-lg p-3">
                  <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Enviados com sucesso (debug info) ──────────────────────────── */}
          {sendResult.results.filter(r => r.status === "sucesso").length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  Mensagens enviadas
                </p>
              </div>
              <div className="divide-y divide-zinc-800/60 max-h-48 overflow-y-auto">
                {sendResult.results
                  .filter(r => r.status === "sucesso")
                  .map(r => (
                    <div key={r.debtorId} className="flex items-center justify-between px-4 py-2.5 text-sm gap-2">
                      <span className="text-zinc-300 truncate flex-1">{r.clientName}</span>
                      <span className="text-xs text-zinc-500 font-mono flex-shrink-0">+{r.phone}</span>
                      {r.sentWithPdf
                        ? <span className="text-xs text-emerald-400 flex-shrink-0">📎 PDF</span>
                        : <span className="text-xs text-zinc-500 flex-shrink-0">sem PDF</span>
                      }
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ── Itens com pendência ─────────────────────────────────────────── */}
          {sendResult.results.filter(r => r.status !== "sucesso").length > 0 && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <p className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Itens com pendência
                </p>
              </div>
              <div className="divide-y divide-zinc-800/60 max-h-48 overflow-y-auto">
                {sendResult.results
                  .filter(r => r.status !== "sucesso")
                  .map(r => (
                    <div key={r.debtorId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span className="text-zinc-300 truncate">{r.clientName}</span>
                      <span className="text-xs text-amber-400 flex-shrink-0 ml-2">
                        {r.status === "telefone_invalido"  ? "sem telefone válido"
                          : r.status === "duplicado"       ? "⏱ aguarde 5 min (anti-spam)"
                          : r.status === "bloqueado_limite" ? "limite atingido"
                          : r.status === "devedor_nao_encontrado" ? "devedor não encontrado"
                          : r.error ?? "falha no envio"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              Nova cobrança
            </button>
          </div>
        </div>
      )}

      {/* ── BatchConfirmModal ──────────────────────────────────────────────── */}
      {confirmData && (
        <BatchConfirmModal
          data={confirmData}
          onConfirm={(msg) => void handleConfirmSend(msg)}
          onCancel={() => setConfirmData(null)}
        />
      )}

      {/* Aviso de responsabilidade ao anexar boleto (1ª vez) */}
      <BoletoResponsibilityModal
        open={!!pendingBoletoAttach}
        onConfirm={confirmBoletoAck}
        onClose={() => setPendingBoletoAttach(null)}
      />
    </div>
  );
}
