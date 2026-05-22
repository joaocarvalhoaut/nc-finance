/**
 * ClientDashboard — fluxo de cobrança em 3 passos para o cliente final.
 *
 * Fluxo: Upload → Prévia → Envio
 *
 * Intencionalmente OCULTA toda a complexidade técnica de WhatsApp/Z-API.
 * O cliente vê apenas:
 *   - Indicador simples "WhatsApp ativo" (ponto verde) ou "Desconectado"
 *   - Upload de arquivo (drag-and-drop ou clique)
 *   - Tabela de prévia dos devedores extraídos
 *   - Seletor de tom de mensagem
 *   - Botão "Enviar cobranças" com modal de confirmação
 *   - Resumo do resultado
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
  FolderOpen,
  Paperclip,
} from "lucide-react";
import { whatsappGatewayService } from "../services/whatsappGatewayService";
import { whatsappBatchService, type BatchChargeResult } from "../services/whatsappBatchService";
import { financeService } from "../services/financeService";
import { billingLogsService } from "../services/billingLogsService";
import { pilotService } from "../services/pilotService";
import { parseImportFile } from "../utils/importFileParser";
import { extractDocumentLocally } from "../services/localDocumentExtraction";
import { driveFolderService, isValidDriveUrl } from "../services/driveMatching";
import type { DriveFolderStatus } from "../services/driveMatching";
import BatchConfirmModal, { type BatchConfirmData } from "./BatchConfirmModal";
import type { Debtor, MessageTone } from "../types";

// ─── Tone options ─────────────────────────────────────────────────────────────

const TONE_OPTIONS: { value: MessageTone; label: string; description: string }[] = [
  { value: "amigavel",  label: "Amigável",    description: "Abordagem leve e cordial, ideal para lembrete preventivo" },
  { value: "neutro",    label: "Neutro",       description: "Mensagem direta e profissional, foco na informação" },
  { value: "firme",     label: "Firme",        description: "Tom assertivo com aviso de escalonamento" },
  { value: "juridico",  label: "Jurídico",     description: "Notificação formal para casos mais críticos" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface ClientDashboardProps {
  userId:            string;
  globalFinePct:     number;
  globalInterestDayPct: number;
  /** Called after a successful batch send so App.tsx can refresh billing logs */
  onBatchSent?: (result: BatchChargeResult) => void;
}

// ─── Step type ────────────────────────────────────────────────────────────────

type Step = "upload" | "preview" | "sending" | "done";

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDashboard({
  userId,
  globalFinePct,
  globalInterestDayPct,
  onBatchSent,
}: ClientDashboardProps) {
  // ── WhatsApp status ──────────────────────────────────────────────────────────
  const [waConnected, setWaConnected]   = useState<boolean | null>(null);
  const [waChecking,  setWaChecking]    = useState(false);

  // ── Pilot mode remaining sends ───────────────────────────────────────────────
  // null = not in pilot (no limit shown), 0+ = in pilot mode
  const [pilotRemaining, setPilotRemaining] = useState<number | null>(null);

  // ── Today's sent count ───────────────────────────────────────────────────────
  const [sentToday, setSentToday] = useState<number>(0);

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

  // ── Drive folder state ───────────────────────────────────────────────────────
  const [driveFolderUrl,   setDriveFolderUrl]   = useState("");
  const [driveSaving,      setDriveSaving]       = useState(false);
  const [driveSaveMsg,     setDriveSaveMsg]       = useState("");
  const [driveSaveError,   setDriveSaveError]     = useState("");
  const [driveStatus,      setDriveStatus]        = useState<DriveFolderStatus | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Init: check WhatsApp + today's count ────────────────────────────────────
  const refreshWaStatus = useCallback(async () => {
    setWaChecking(true);
    try {
      const s = await whatsappGatewayService.getStatus();
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
        return d === today && l.status === "sent";
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
      // non-critical — pilot status is best-effort
    }
  }, []);

  // ── Drive folder status refresh ──────────────────────────────────────────────
  const refreshDriveStatus = useCallback(async () => {
    try {
      const status = await driveFolderService.getStatus();
      setDriveStatus(status);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void refreshWaStatus();
    void refreshTodayCount();
    void refreshPilotStatus();
    void refreshDriveStatus();
  }, [refreshWaStatus, refreshTodayCount, refreshPilotStatus, refreshDriveStatus]);

  // ── Drive folder save handler ─────────────────────────────────────────────────
  const handleDriveSave = useCallback(async () => {
    const url = driveFolderUrl.trim();
    if (!url) return;
    if (!isValidDriveUrl(url)) {
      setDriveSaveError("Cole o link de uma pasta do Google Drive (ex: drive.google.com/drive/folders/...).");
      return;
    }
    setDriveSaving(true);
    setDriveSaveMsg("");
    setDriveSaveError("");
    try {
      const result = await driveFolderService.saveFolder(url);
      if (result.success) {
        setDriveSaveMsg(result.message ?? `Pasta "${result.folderName ?? "Drive"}" salva. Indexando em segundo plano…`);
        setDriveFolderUrl("");
        void refreshDriveStatus();
      } else if (result.status === "drive_sem_acesso") {
        const hint = result.serviceAccountHint
          ? ` Compartilhe com: ${result.serviceAccountHint}`
          : "";
        setDriveSaveError(`Sem acesso à pasta.${hint}`);
      } else {
        setDriveSaveError(result.error ?? result.message ?? "Não foi possível salvar a pasta.");
      }
    } catch {
      setDriveSaveError("Erro ao salvar pasta. Tente novamente.");
    } finally {
      setDriveSaving(false);
    }
  }, [driveFolderUrl, refreshDriveStatus]);

  // ── File handling ────────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file) return;
    setExtractError("");
    setIsProcessing(true);
    setProcessingMsg("Lendo arquivo…");

    try {
      // 1. Parse file → raw text
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

      // 2. Extract debtors locally
      setProcessingMsg("Identificando devedores…");
      const extraction = await extractDocumentLocally(rawText, undefined, file);

      const extracted: Debtor[] = extraction.records.map((d) => ({
        id: crypto.randomUUID(),
        client: d.client,
        supplier: d.supplier,
        document: d.document,
        dueDate: d.dueDate,
        value: d.value,
        phone: d.phone,
        category: "vencidos",
        status: "pending",
        interestApplied: globalInterestDayPct,
        fineApplied: globalFinePct,
        updatedValue: Math.round(d.value * (1 + globalFinePct / 100) * 100) / 100,
      }));

      if (extracted.length === 0) {
        // Surface the most specific warning from the extraction pipeline
        const detail = extraction.warnings.length > 0
          ? extraction.warnings[0]
          : "Verifique se o arquivo contém dados de cobrança legíveis.";
        setExtractError(`Nenhum devedor identificado. ${detail}`);
        setIsProcessing(false);
        return;
      }

      // Pre-select all by default
      setDebtors(extracted);
      setSelectedIds(new Set(extracted.map(d => d.id)));
      setStep("preview");
    } catch (err) {
      setExtractError(
        err instanceof Error
          ? err.message
          : "Falha ao processar o arquivo. Tente novamente."
      );
    } finally {
      setIsProcessing(false);
      setProcessingMsg("");
    }
  }, [globalFinePct, globalInterestDayPct]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void processFile(file);
    // reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [processFile]);

  // ── Selection helpers ────────────────────────────────────────────────────────

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

  // ── Send flow ────────────────────────────────────────────────────────────────

  const handleSendClick = () => {
    if (selectedIds.size === 0) return;

    const selected = debtors.filter(d => selectedIds.has(d.id));
    const validPhone  = selected.filter(d => d.phone && d.phone.replace(/\D/g, "").length >= 10).length;
    const invalidPhone = selected.length - validPhone;

    const preview = `Olá {nome_cliente}, identificamos uma pendência financeira em seu CPF/CNPJ. Por favor, entre em contato para regularização.`;

    setConfirmData({
      debtorCount:       selected.length,
      validPhoneCount:   validPhone,
      invalidPhoneCount: invalidPhone,
      messagePreview:    preview.slice(0, 200),
      tone:              TONE_OPTIONS.find(t => t.value === selectedTone)?.label ?? selectedTone,
      pilotRemaining,   // null = not in pilot (no cap shown); 0+ = pilot limit
      whatsappConnected: waConnected ?? false,
    });
  };

  const handleConfirmSend = async () => {
    if (!confirmData) return;
    setConfirmData(null);
    setIsSending(true);
    setStep("sending");

    try {
      // Persist extracted debtors to DB so IDs are valid for the batch edge function.
      // If persistence fails entirely, abort with a clear message (do not send with invalid IDs).
      const selectedDebtors = debtors.filter(d => selectedIds.has(d.id));
      let persisted: typeof selectedDebtors;
      try {
        persisted = await financeService.createMany(userId, selectedDebtors);
      } catch (persistErr) {
        throw new Error(
          "Falha ao salvar devedores antes do envio: " +
          (persistErr instanceof Error ? persistErr.message : "erro de rede") +
          ". Verifique sua conexão e tente novamente."
        );
      }
      const validIds = persisted.map(d => d.id).filter(Boolean) as string[];

      // Trigger Drive matching automatically (fire-and-forget — does not block send)
      // Matches each persisted debtor against the user's Drive index before sending.
      // If Drive folder is configured, this attaches the correct PDF to each debtor record.
      if (driveStatus?.configured) {
        void driveFolderService.syncFolder().catch(() => {/* non-critical */});
      }

      const result = await whatsappBatchService.sendBatchCharges({
        debtorIds:    validIds,
        tone:         selectedTone,
        dryRun:       false,
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
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const formatBRL = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">

      {/* ── Top status bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* WhatsApp status indicator */}
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

        {/* Quick stats */}
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

      {/* ── Drive folder section (always visible on upload step) ──────────── */}
      {step === "upload" && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">Pasta dos boletos</span>
            {driveStatus?.configured && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 ml-auto">
                <Paperclip className="w-3 h-3" />
                {driveStatus.fileCount} boleto{driveStatus.fileCount !== 1 ? "s" : ""} indexado{driveStatus.fileCount !== 1 ? "s" : ""}
                {driveStatus.unmatchedDebtors > 0 && (
                  <span className="text-zinc-500 ml-1">· {driveStatus.unmatchedDebtors} sem boleto</span>
                )}
              </span>
            )}
          </div>

          {driveStatus?.configured ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-zinc-400 truncate">
                {driveStatus.folderName ?? "Pasta configurada"}
                {driveStatus.lastIndexedAt && (
                  <span className="text-zinc-600 ml-2">
                    · atualizado {new Date(driveStatus.lastIndexedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </p>
              <button
                onClick={() => setDriveStatus(null)}
                className="text-xs text-zinc-500 hover:text-zinc-300 flex-shrink-0 transition-colors"
              >
                Alterar
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={driveFolderUrl}
                  onChange={e => { setDriveFolderUrl(e.target.value); setDriveSaveError(""); }}
                  onKeyDown={e => e.key === "Enter" && void handleDriveSave()}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 bg-zinc-800/60 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 transition-colors"
                />
                <button
                  onClick={() => void handleDriveSave()}
                  disabled={driveSaving || !driveFolderUrl.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors flex-shrink-0"
                >
                  {driveSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
                </button>
              </div>
              {driveSaveError && (
                <p className="text-xs text-rose-400 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {driveSaveError}
                </p>
              )}
              {driveSaveMsg && !driveSaveError && (
                <p className="text-xs text-emerald-400">{driveSaveMsg}</p>
              )}
              <p className="text-xs text-zinc-600">
                Cole o link da pasta do Google Drive com os PDFs dos boletos. O sistema vincula automaticamente.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step: Upload ───────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
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
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-lg font-semibold text-white">
                    Arraste o arquivo aqui ou clique para selecionar
                  </p>
                  <p className="text-sm text-zinc-400">
                    Planilha Excel, CSV, PDF ou TXT com os dados dos devedores
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

          {/* Extraction error */}
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
          {/* Tone selector */}
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

          {/* Debtors table */}
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
                  Todos ({debtors.length})
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
                    {/* Checkbox */}
                    <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors
                      ${isSelected ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}
                    >
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{d.client}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        Doc: {d.document} · Venc: {d.dueDate}
                      </p>
                    </div>

                    {/* Value */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-white font-mono">
                        {formatBRL(d.updatedValue ?? d.value)}
                      </p>
                      {!hasPhone && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1 justify-end">
                          <AlertTriangle className="w-3 h-3" /> sem telefone
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 text-sm font-medium transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Importar outro arquivo
            </button>

            <button
              onClick={handleSendClick}
              disabled={selectedIds.size === 0 || waConnected === false}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-base transition-colors shadow-lg shadow-emerald-900/40"
            >
              <Send className="w-5 h-5" />
              Enviar cobranças
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {waConnected === false && (
            <p className="text-sm text-rose-400 flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              Canal de envio indisponível no momento. Contate o suporte para reativar.
            </p>
          )}
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
          {/* Result card */}
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

          {/* Failed items (client names only — no PII) */}
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

          {/* Actions */}
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
