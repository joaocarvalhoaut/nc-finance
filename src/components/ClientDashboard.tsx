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
} from "lucide-react";
import { whatsappGatewayService } from "../services/whatsappGatewayService";
import { whatsappBatchService, type BatchChargeResult } from "../services/whatsappBatchService";
import { financeService } from "../services/financeService";
import { billingLogsService } from "../services/billingLogsService";
import { pilotService } from "../services/pilotService";
import { parseImportFile } from "../utils/importFileParser";
import { extractDocumentLocally } from "../services/localDocumentExtraction";
import BatchConfirmModal, { type BatchConfirmData } from "./BatchConfirmModal";
import type { Debtor, MessageTone } from "../types";

// ─── Tone options ─────────────────────────────────────────────────────────────

const TONE_OPTIONS: { value: MessageTone; label: string; description: string }[] = [
  { value: "amigavel",  label: "Amigável",    description: "Abordagem leve e cordial, ideal para lembrete preventivo" },
  { value: "neutro",    label: "Neutro",       description: "Mensagem direta e profissional, foco na informação" },
  { value: "firme",     label: "Firme",        description: "Tom assertivo com aviso de escalonamento" },
  { value: "juridico",  label: "Jurídico",     description: "Notificação formal para casos mais críticos" },
];

// ─── Import category ──────────────────────────────────────────────────────────

type ImportCategory = "vencidos" | "a_vencer" | "liquidado";

const CATEGORY_OPTIONS: {
  value: ImportCategory;
  label: string;
  description: string;
  color: string;
  activeColor: string;
}[] = [
  {
    value: "vencidos",
    label: "Vencidos",
    description: "Títulos já vencidos — cobráveis com juros e multa",
    color: "border-zinc-700 text-zinc-400 hover:border-rose-500/50 hover:text-rose-300",
    activeColor: "border-rose-500 bg-rose-500/10 text-rose-300 font-semibold",
  },
  {
    value: "a_vencer",
    label: "A vencer",
    description: "Títulos a vencer — aviso preventivo amigável",
    color: "border-zinc-700 text-zinc-400 hover:border-amber-500/50 hover:text-amber-300",
    activeColor: "border-amber-500 bg-amber-500/10 text-amber-300 font-semibold",
  },
  {
    value: "liquidado",
    label: "Liquidação",
    description: "Títulos pagos — reconciliação, SEM cobrança",
    color: "border-zinc-700 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-300",
    activeColor: "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-semibold",
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientDashboardProps {
  userId:               string;
  globalFinePct:        number;
  globalInterestDayPct: number;
  /** Chamado após envio de lote (sucesso ou falha) — atualiza logs no pai */
  onBatchSent?: (result: BatchChargeResult) => void;
  /**
   * Chamado após salvar devedores na base consolidada (import + liquidação).
   * O pai deve recarregar os devedores do DB ao receber esta chamada.
   */
  onDebtorsImported?: () => void;
}

// ─── Step type ────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "sending" | "done" | "reconciling" | "reconciled";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDashboard({
  userId,
  globalFinePct,
  globalInterestDayPct,
  onBatchSent,
  onDebtorsImported,
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

  // ── PDF attachments (keyed by debtor document number) ────────────────────────
  // Stored locally before send; uploaded to Storage after createMany
  const [attachedPdfs,    setAttachedPdfs]    = useState<Map<string, File>>(new Map());
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
  }, [globalFinePct, globalInterestDayPct, importCategory]);

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

    const preview = `Olá {nome_cliente}, identificamos uma pendência financeira. Por favor, entre em contato para regularização.`;

    setConfirmData({
      debtorCount:       selected.length,
      validPhoneCount:   validPhone,
      invalidPhoneCount: invalidPhone,
      messagePreview:    preview.slice(0, 200),
      tone:              TONE_OPTIONS.find(t => t.value === selectedTone)?.label ?? selectedTone,
      pilotRemaining,
      whatsappConnected: waConnected ?? false,
    });
  };

  const handleConfirmSend = async () => {
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

      // Upload de PDFs anexados — faz após createMany pois agora temos IDs reais
      if (attachedPdfs.size > 0) {
        for (const saved of persisted) {
          const file = attachedPdfs.get(saved.document ?? "");
          if (file && saved.id) {
            try {
              setUploadingPdfDoc(saved.document ?? "");
              const url = await financeService.uploadChargePdf(userId, saved.id, file);
              await financeService.updatePdfAttachment(userId, saved.id, { url, name: file.name });
            } catch (e) {
              console.warn("[ClientDashboard] PDF upload failed for", saved.document, e);
            }
          }
        }
        setUploadingPdfDoc(null);
      }

      const validIds = persisted.map(d => d.id).filter(Boolean) as string[];

      const result = await whatsappBatchService.sendBatchCharges({
        debtorIds: validIds,
        tone:      selectedTone,
        dryRun:    false,
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

      {/* ── Top status bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {waChecking ? (
            <span className="flex items-center gap-1.5 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verificando…
            </span>
          ) : waConnected === true ? (
            <span className="flex items-center gap-1.5 text-sm text-emerald-400 font-medium">
              <Wifi className="w-4 h-4" />
              WhatsApp ativo
            </span>
          ) : waConnected === false ? (
            <span className="flex items-center gap-1.5 text-sm text-rose-400 font-medium">
              <WifiOff className="w-4 h-4" />
              Canal indisponível — contate o suporte
            </span>
          ) : null}

          <button
            onClick={() => void refreshWaStatus()}
            disabled={waChecking}
            className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            title="Verificar status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-4 text-sm text-zinc-400">
          {debtors.length > 0 && step === "preview" && (
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-zinc-500" />
              <span className="font-semibold text-white">{selectedIds.size}</span> selecionados
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <BadgeCheck className="w-4 h-4 text-emerald-500" />
            <span className="font-semibold text-white">{sentToday}</span> enviadas hoje
          </span>
        </div>
      </div>


      {/* ── Step: Upload ───────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">

          {/* Category selector */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
            <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-zinc-400" />
              Tipo de arquivo
            </p>
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_OPTIONS.map(cat => (
                <button
                  key={cat.value}
                  onClick={() => setImportCategory(cat.value)}
                  className={`px-3 py-3 rounded-xl border text-sm transition-all text-left
                    ${importCategory === cat.value ? cat.activeColor : cat.color}
                  `}
                >
                  <div className="font-semibold text-sm">{cat.label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5 leading-tight">{cat.description}</div>
                </button>
              ))}
            </div>

            {/* Liquidação warning */}
            {isLiquidacao && (
              <div className="mt-3 flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
                <HandCoins className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Arquivo de <strong>liquidação</strong>: os registros identificados serão marcados como
                  pagos na base consolidada. <strong>Nenhuma cobrança será enviada.</strong>
                </span>
              </div>
            )}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-4
              border-2 border-dashed rounded-3xl p-12 cursor-pointer
              transition-all duration-200 select-none
              ${isDragging
                ? "border-emerald-400 bg-emerald-500/10 scale-[1.01]"
                : "border-zinc-700 bg-zinc-900/40 hover:border-emerald-500/60 hover:bg-zinc-900/60"
              }
            `}
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
                <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
                <p className="text-base font-medium text-white">{processingMsg}</p>
                <p className="text-sm text-zinc-400">Aguarde um momento…</p>
              </>
            ) : (
              <>
                <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center
                  ${isLiquidacao
                    ? "bg-emerald-500/10 border-emerald-500/20"
                    : "bg-zinc-800/60 border-zinc-700"
                  }`}
                >
                  <Upload className={`w-8 h-8 ${isLiquidacao ? "text-emerald-400" : "text-zinc-400"}`} />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-white">
                    {isLiquidacao
                      ? "Arquivo de liquidação (pagamentos realizados)"
                      : "Arraste o arquivo aqui ou clique para selecionar"
                    }
                  </p>
                  <p className="text-sm text-zinc-400">
                    {isLiquidacao
                      ? "Planilha ou PDF com títulos liquidados — será reconciliado com a base"
                      : "Planilha Excel, CSV, PDF ou TXT com os dados dos devedores"
                    }
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono">
                  {[".xlsx", ".xls", ".csv", ".pdf", ".txt"].map(ext => (
                    <span key={ext} className="px-2 py-0.5 bg-zinc-800 rounded-md">{ext}</span>
                  ))}
                </div>
              </>
            )}
          </div>

          {extractError && (
            <div className="flex items-start gap-3 bg-red-950/40 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{extractError}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Step: Preview ──────────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-5">

          {/* Category badge */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm
            ${catOption.activeColor}`}
          >
            {isLiquidacao
              ? <CheckCircle className="w-4 h-4" />
              : importCategory === "vencidos"
              ? <AlertTriangle className="w-4 h-4" />
              : <Clock className="w-4 h-4" />
            }
            <span className="font-semibold">{catOption.label}</span>
            <span className="opacity-70 text-xs">— {catOption.description}</span>
            {isLiquidacao && (
              <span className="ml-auto text-xs font-bold text-emerald-400">
                SEM envio de cobrança
              </span>
            )}
          </div>

          {/* Tone selector — apenas para cobráveis */}
          {!isLiquidacao && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-4">
              <p className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                Tom da mensagem
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TONE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setSelectedTone(t.value)}
                    className={`
                      text-left px-3 py-2.5 rounded-xl border text-sm transition-all
                      ${selectedTone === t.value
                        ? "border-emerald-500 bg-emerald-500/10 text-emerald-300 font-semibold"
                        : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      }
                    `}
                    title={t.description}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Records table */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
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
                                    if (f) setAttachedPdfs(prev => new Map(prev).set(docKey, f));
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
            <div className="flex items-start gap-3 bg-red-950/40 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{reconcileError}</span>
            </div>
          )}

          {/* Action bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Importar outro arquivo
            </button>

            {isLiquidacao ? (
              /* Liquidação: botão de reconciliação (NÃO envia WhatsApp) */
              <button
                onClick={() => void handleReconcile()}
                disabled={selectedIds.size === 0 || isReconciling}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors shadow-lg shadow-emerald-900/40"
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
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors shadow-lg shadow-emerald-900/40"
              >
                <Send className="w-5 h-5" />
                Enviar cobranças
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>

          {!isLiquidacao && waConnected === false && (
            <p className="text-sm text-rose-400 flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              Canal de envio indisponível no momento. Contate o suporte para reativar.
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
          <div className="rounded-2xl border bg-emerald-950/30 border-emerald-500/30 p-6">
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
              Nenhuma mensagem de cobrança foi enviada. Verifique a Visão Geral para confirmar as atualizações.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
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
          <div className={`rounded-2xl border p-6 ${
            sendResult.success
              ? "bg-emerald-950/30 border-emerald-500/30"
              : "bg-red-950/30 border-red-500/30"
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {sendResult.success
                ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                : <XCircle className="w-8 h-8 text-red-400" />
              }
              <div>
                <h3 className="text-lg font-bold text-white">
                  {sendResult.success ? "Cobranças enviadas!" : "Falha no envio"}
                </h3>
                <p className="text-sm text-zinc-400">
                  {sendResult.error ?? "Lote processado com sucesso."}
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
                <div key={stat.label} className="text-center bg-zinc-900/60 rounded-xl p-3">
                  <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {sendResult.results.filter(r => r.status !== "sucesso").length > 0 && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
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
                        {r.status === "telefone_invalido" ? "sem telefone válido"
                          : r.status === "duplicado"       ? "já enviado hoje"
                          : r.status === "bloqueado_limite" ? "limite atingido"
                          : "falha no envio"}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors"
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
          onConfirm={() => void handleConfirmSend()}
          onCancel={() => setConfirmData(null)}
        />
      )}
    </div>
  );
}
