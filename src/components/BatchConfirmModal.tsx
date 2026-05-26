/**
 * BatchConfirmModal — mandatory confirmation + preview before any batch send.
 *
 * Safeguards enforced here:
 *   1. Message preview (first 200 chars) shown before confirming.
 *   2. Recipient count and any invalid-phone warnings shown.
 *   3. WhatsApp connection status check — blocks if disconnected.
 *   4. Pilot remaining-sends check — warns if count would exceed daily limit.
 *   5. Explicit checkbox acknowledgement required.
 *   6. Confirm button disabled until all checks pass.
 *
 * Security: this component receives only safe data.
 * It never displays raw phone numbers — only masked or count.
 */

import React, { useState } from "react";
import {
  Send, AlertTriangle, CheckCircle2, XCircle,
  WifiOff, Eye, X,
} from "lucide-react";

export interface BatchConfirmData {
  debtorCount:     number;
  validPhoneCount: number;
  invalidPhoneCount: number;
  messagePreview:  string;  // first 200 chars of the template
  tone:            string;
  pilotRemaining:  number | null;   // null = not in pilot mode
  whatsappConnected: boolean;
}

interface BatchConfirmModalProps {
  data:       BatchConfirmData;
  onConfirm:  () => void;
  onCancel:   () => void;
}

export default function BatchConfirmModal({
  data,
  onConfirm,
  onCancel,
}: BatchConfirmModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-zinc-800">
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

        <div className="px-6 py-4 space-y-4">

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

          {/* Message preview */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Eye className="w-4 h-4" aria-hidden />
              Preview da mensagem
            </h3>
            <div className="rounded-xl bg-[#1a2e22] border border-emerald-500/20 px-3 py-2.5 text-sm text-zinc-200 whitespace-pre-wrap break-words max-h-28 overflow-y-auto font-sans">
              {data.messagePreview}
              {data.messagePreview.length >= 200 && (
                <span className="text-zinc-500 italic">… (truncado)</span>
              )}
            </div>
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
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-zinc-700 text-zinc-300 font-medium hover:bg-zinc-800 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
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
