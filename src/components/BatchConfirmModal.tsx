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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 id="batch-confirm-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" aria-hidden />
            Confirmar Envio em Lote
          </h2>
          <button
            onClick={onCancel}
            aria-label="Cancelar"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* WhatsApp disconnected blocker */}
          {blockedByDisconnect && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-3"
            >
              <WifiOff className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <p className="font-semibold text-red-800">WhatsApp Desconectado</p>
                <p className="text-sm text-red-700 mt-0.5">
                  A instância Z-API não está conectada. Conecte antes de enviar.
                </p>
              </div>
            </div>
          )}

          {/* Pilot daily limit reached */}
          {blockedByPilotLimit && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg bg-orange-50 border border-orange-200 p-3"
            >
              <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" aria-hidden />
              <div>
                <p className="font-semibold text-orange-800">Limite Diário Atingido</p>
                <p className="text-sm text-orange-700 mt-0.5">
                  O limite de envios do piloto foi atingido para hoje. Tente novamente amanhã.
                </p>
              </div>
            </div>
          )}

          {/* Partial pilot limit warning */}
          {willExceedPilotLimit && !blockedByPilotLimit && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden />
              <p className="text-sm text-amber-800">
                Apenas <strong>{data.pilotRemaining}</strong> de{" "}
                <strong>{data.validPhoneCount}</strong> envios serão processados hoje
                (limite diário do piloto).
              </p>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">Resumo do lote</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <SummaryRow
                icon={<CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden />}
                label="Telefones válidos"
                value={data.validPhoneCount}
              />
              {data.invalidPhoneCount > 0 && (
                <SummaryRow
                  icon={<XCircle className="w-4 h-4 text-red-500" aria-hidden />}
                  label="Telefones inválidos"
                  value={data.invalidPhoneCount}
                  valueClass="text-red-600"
                />
              )}
              {data.pilotRemaining !== null && (
                <SummaryRow
                  icon={<CheckCircle2 className="w-4 h-4 text-amber-600" aria-hidden />}
                  label="Restante no piloto"
                  value={data.pilotRemaining}
                  valueClass={data.pilotRemaining <= 5 ? "text-orange-600" : "text-amber-700"}
                />
              )}
              <SummaryRow
                icon={<Send className="w-4 h-4 text-blue-600" aria-hidden />}
                label="Tom da mensagem"
                value={data.tone}
              />
            </div>
          </div>

          {/* Message preview */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
              <Eye className="w-4 h-4" aria-hidden />
              Preview da mensagem
            </h3>
            <div className="rounded-lg bg-[#dcf8c6] border border-green-200 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-28 overflow-y-auto font-sans shadow-inner">
              {data.messagePreview}
              {data.messagePreview.length >= 200 && (
                <span className="text-gray-400 italic">… (truncado)</span>
              )}
            </div>
          </div>

          {/* Acknowledgement checkbox */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-blue-600 cursor-pointer"
              aria-label="Confirmo que revisei o lote e autorizo o envio"
            />
            <span className="text-sm text-gray-700">
              Revisei o lote, confirmei a mensagem e{" "}
              <strong>autorizo o envio real</strong> via WhatsApp.
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`
              flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              font-semibold transition-colors
              ${canConfirm
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
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
  icon, label, value, valueClass = "text-gray-900",
}: {
  icon:        React.ReactNode;
  label:       string;
  value:       number | string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-gray-600">{label}:</span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
