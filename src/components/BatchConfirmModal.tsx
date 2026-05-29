/**
 * BatchConfirmModal — mandatory confirmation + preview before any batch send.
 *
 * Safeguards enforced here:
 *   1. Message preview shown based on the selected tone (with variables visible).
 *   2. Option to edit the message template before sending.
 *   3. Recipient count and any invalid-phone warnings shown.
 *   4. WhatsApp connection status check — blocks if disconnected.
 *   5. Pilot remaining-sends check — warns if count would exceed daily limit.
 *   6. Explicit checkbox acknowledgement required.
 *   7. Confirm button disabled until all checks pass.
 *
 * Security: this component receives only safe data.
 * It never displays raw phone numbers — only masked or count.
 */

import React, { useState } from "react";
import {
  Send, AlertTriangle, CheckCircle2, XCircle,
  WifiOff, Eye, X, Pencil, RotateCcw, Check,
} from "lucide-react";

export interface BatchConfirmData {
  debtorCount:        number;
  validPhoneCount:    number;
  invalidPhoneCount:  number;
  messagePreview:     string;          // template with {variables} — used for editing
  messagePreviewFilled?: string;       // example with first debtor's real data — used for display
  sampleDebtorName?:  string;          // name shown in preview hint
  tone:               string;          // display label (e.g. "Amigável")
  toneValue:          string;          // raw value (e.g. "amigavel")
  pilotRemaining:     number | null;   // null = not in pilot mode
  whatsappConnected:  boolean;
}

interface BatchConfirmModalProps {
  data:      BatchConfirmData;
  onConfirm: (customMessage?: string | null) => void;
  onCancel:  () => void;
}

export default function BatchConfirmModal({
  data,
  onConfirm,
  onCancel,
}: BatchConfirmModalProps) {
  const [acknowledged,   setAcknowledged]   = useState(false);
  const [isEditing,      setIsEditing]      = useState(false);
  const [editedMessage,  setEditedMessage]  = useState(data.messagePreview);
  const isModified = editedMessage.trim() !== data.messagePreview.trim();

  // Filled preview: if user edited the template, re-fill with the sample debtor; otherwise use pre-filled
  // For display we show the filled version; for editing we show the raw template with {variables}
  const displayPreview = data.messagePreviewFilled ?? data.messagePreview;

  const willExceedPilotLimit =
    data.pilotRemaining !== null &&
    data.validPhoneCount > data.pilotRemaining;

  const blockedByDisconnect = !data.whatsappConnected;
  const blockedByPilotLimit =
    data.pilotRemaining !== null && data.pilotRemaining === 0;

  const canConfirm =
    acknowledged &&
    !blockedByDisconnect &&
    !blockedByPilotLimit &&
    data.validPhoneCount > 0;

  const handleConfirm = () => {
    onConfirm(isModified ? editedMessage.trim() : null);
  };

  const handleReset = () => {
    setEditedMessage(data.messagePreview);
    setIsEditing(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-zinc-800 flex-shrink-0">
          <h2 id="batch-confirm-title" className="text-lg font-semibold text-white flex items-center gap-2">
            <Eye className="w-5 h-5 text-emerald-400" aria-hidden />
            Confirmar Envio em Lote
          </h2>
          <button
            onClick={onCancel}
            aria-label="Cancelar"
            className="text-zinc-500 hover:text-zinc-200 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">

          {/* WhatsApp disconnected blocker */}
          {blockedByDisconnect && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl bg-rose-500/10 border border-rose-500/30 p-3"
            >
              <WifiOff className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <p className="font-semibold text-rose-300">WhatsApp Desconectado</p>
                <p className="text-sm text-rose-400/80 mt-0.5">
                  A instância Z-API não está conectada. Contate o suporte para reativar.
                </p>
              </div>
            </div>
          )}

          {/* Pilot daily limit reached */}
          {blockedByPilotLimit && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3"
            >
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <p className="font-semibold text-amber-300">Limite Diário Atingido</p>
                <p className="text-sm text-amber-400/80 mt-0.5">
                  O limite de envios do piloto foi atingido para hoje. Tente novamente amanhã.
                </p>
              </div>
            </div>
          )}

          {/* Partial pilot limit warning */}
          {willExceedPilotLimit && !blockedByPilotLimit && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" aria-hidden />
              <p className="text-sm text-amber-300">
                Apenas <strong>{data.pilotRemaining}</strong> de{" "}
                <strong>{data.validPhoneCount}</strong> envios serão processados hoje
                (limite diário do piloto).
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 space-y-2">
            <h3 className="text-sm font-medium text-zinc-400">Resumo do lote</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryRow
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden />}
                label="Telefones válidos"
                value={data.validPhoneCount}
                valueClass="text-emerald-300"
              />
              {data.invalidPhoneCount > 0 && (
                <SummaryRow
                  icon={<XCircle className="w-4 h-4 text-rose-400" aria-hidden />}
                  label="Sem telefone"
                  value={data.invalidPhoneCount}
                  valueClass="text-rose-400"
                />
              )}
              {data.pilotRemaining !== null && (
                <SummaryRow
                  icon={<CheckCircle2 className="w-4 h-4 text-amber-400" aria-hidden />}
                  label="Restante no piloto"
                  value={data.pilotRemaining}
                  valueClass={data.pilotRemaining <= 5 ? "text-amber-400" : "text-amber-300"}
                />
              )}
              <SummaryRow
                icon={<Send className="w-4 h-4 text-emerald-400" aria-hidden />}
                label="Tom"
                value={data.tone}
                valueClass="text-zinc-200"
              />
            </div>
          </div>

          {/* Message preview / edit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" aria-hidden />
                {isEditing ? "Editar mensagem" : "Preview da mensagem"}
                {isModified && !isEditing && (
                  <span className="text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 ml-1">
                    Personalizada
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-1.5">
                {isModified && (
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
                    title="Restaurar template original"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restaurar
                  </button>
                )}
                <button
                  onClick={() => setIsEditing(e => !e)}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                    isEditing
                      ? "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {isEditing ? (
                    <><Check className="w-3 h-3" /> Pronto</>
                  ) : (
                    <><Pencil className="w-3 h-3" /> Editar</>
                  )}
                </button>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-1.5">
                <textarea
                  value={editedMessage}
                  onChange={e => setEditedMessage(e.target.value)}
                  rows={9}
                  spellCheck={false}
                  className="w-full rounded-xl bg-zinc-900 border border-emerald-500/40 focus:border-emerald-500 focus:outline-none px-3 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap font-mono leading-relaxed resize-none transition-colors"
                  aria-label="Editar mensagem"
                />
                <p className="text-[10px] text-zinc-600 leading-snug">
                  Variáveis disponíveis:{" "}
                  <code className="text-zinc-500">{"{nome_cliente}"}</code>{" "}
                  <code className="text-zinc-500">{"{documento}"}</code>{" "}
                  <code className="text-zinc-500">{"{vencimento}"}</code>{" "}
                  <code className="text-zinc-500">{"{valor_atualizado}"}</code>
                </p>
              </div>
            ) : (
              <div>
                <div className="rounded-xl bg-[#1a2e22] border border-emerald-500/20 px-3 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap break-words max-h-44 overflow-y-auto font-sans">
                  {displayPreview}
                </div>
                {data.sampleDebtorName && (
                  <p className="text-[10px] text-zinc-600 mt-1 pl-1">
                    Exemplo com dados de{" "}
                    <span className="text-zinc-500 font-medium">{data.sampleDebtorName}</span>
                    {data.debtorCount > 1 && ` (+${data.debtorCount - 1} outros)`}
                    . Cada devedor receberá sua própria mensagem.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Acknowledgement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-600 accent-emerald-500 cursor-pointer"
              aria-label="Confirmo que revisei o lote e autorizo o envio"
            />
            <span className="text-sm text-zinc-400 group-hover:text-zinc-300 transition-colors">
              Revisei o lote, confirmei a mensagem e{" "}
              <strong className="text-zinc-200">autorizo o envio real</strong> via WhatsApp.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-5 flex-shrink-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium hover:bg-zinc-800 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
              font-semibold transition-colors
              ${canConfirm
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.2)]"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700"
              }
            `}
          >
            <Send className="w-4 h-4" aria-hidden />
            Enviar {data.validPhoneCount} mensagens
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  icon, label, value, valueClass = "text-zinc-200",
}: {
  icon:        React.ReactNode;
  label:       string;
  value:       number | string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-zinc-500">{label}:</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
