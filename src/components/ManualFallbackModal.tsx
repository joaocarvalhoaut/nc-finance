/**
 * ManualFallbackModal — operator UI for manually resolving failed WhatsApp sends.
 *
 * Features:
 *   - "Copy message" button (uses the pre-built message, never raw phone)
 *   - Resolution selector (resolvido_manualmente | reenviado | ignorado | contato_direto)
 *   - Observation text area
 *   - Saves a pilot_fallback_note with masked phone only
 *   - Updates the log status to "resolver_manualmente" (display only — not persisted)
 *
 * Security:
 *   - Phone is displayed MASKED only.
 *   - Full message text from logs is truncated to preview for display.
 *   - createFallbackNote() receives masked phone — never raw.
 */

import React, { useState } from "react";
import {
  Copy, CheckCircle2, X, AlertCircle,
  MessageSquare, ClipboardList,
} from "lucide-react";
import { pilotService } from "../services/pilotService";
import type { PilotFallbackNote } from "../types";

export interface FallbackTarget {
  logId?:          string;
  clientName:      string;
  documentNumber?: string;
  phoneMasked:     string;   // MUST be already masked — e.g. "5577*****867"
  messagePreview:  string;   // first 200 chars
}

interface ManualFallbackModalProps {
  target:   FallbackTarget;
  onSaved:  (note: PilotFallbackNote) => void;
  onCancel: () => void;
}

const RESOLUTION_LABELS: Record<PilotFallbackNote["resolution"], string> = {
  resolvido_manualmente: "Resolvido manualmente (contato por outro meio)",
  reenviado:             "Reenviado via WhatsApp",
  ignorado:              "Ignorado (cliente não precisa ser notificado)",
  contato_direto:        "Contato direto (ligação / e-mail)",
};

export default function ManualFallbackModal({
  target,
  onSaved,
  onCancel,
}: ManualFallbackModalProps) {
  const [resolution, setResolution] = useState<PilotFallbackNote["resolution"]>("resolvido_manualmente");
  const [observation, setObservation] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [error,      setError]      = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(target.messagePreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const note = await pilotService.createFallbackNote({
        logId:          target.logId,
        clientName:     target.clientName,
        documentNumber: target.documentNumber,
        phoneMasked:    target.phoneMasked,   // already masked
        resolution,
        observation:    observation.trim() || undefined,
      });

      if (!note) {
        setError("Falha ao registrar resolução. Tente novamente.");
        return;
      }

      onSaved(note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fallback-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 id="fallback-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-orange-600" aria-hidden />
            Resolver Manualmente
          </h2>
          <button
            onClick={onCancel}
            aria-label="Fechar"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Target info */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente:</span>
              <span className="font-medium text-gray-900">{target.clientName}</span>
            </div>
            {target.documentNumber && (
              <div className="flex justify-between">
                <span className="text-gray-500">Documento:</span>
                <span className="text-gray-800">{target.documentNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Telefone:</span>
              {/* Masked phone — never raw */}
              <span className="font-mono text-gray-700">{target.phoneMasked}</span>
            </div>
          </div>

          {/* Message preview + copy */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" aria-hidden />
                Mensagem (preview)
              </h3>
              <button
                onClick={() => void handleCopy()}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                  copied
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
              >
                {copied
                  ? <><CheckCircle2 className="w-3 h-3" aria-hidden /> Copiado!</>
                  : <><Copy className="w-3 h-3" aria-hidden /> Copiar mensagem</>
                }
              </button>
            </div>
            <div className="rounded-lg bg-[#dcf8c6] border border-green-200 px-3 py-2 text-sm text-gray-800 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
              {target.messagePreview}
              {target.messagePreview.length >= 200 && (
                <span className="text-gray-400 italic">…</span>
              )}
            </div>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Como foi resolvido?
            </label>
            <div className="space-y-1.5">
              {(Object.entries(RESOLUTION_LABELS) as [PilotFallbackNote["resolution"], string][]).map(
                ([value, label]) => (
                  <label key={value} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="resolution"
                      value={value}
                      checked={resolution === value}
                      onChange={() => setResolution(value)}
                      className="w-4 h-4 accent-orange-500"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ),
              )}
            </div>
          </div>

          {/* Observation */}
          <div>
            <label
              htmlFor="fallback-obs"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Observação interna <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <textarea
              id="fallback-obs"
              value={observation}
              onChange={e => setObservation(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Registre aqui o que foi feito (não inclua dados sensíveis)…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <p className="text-xs text-gray-400 text-right mt-0.5">{observation.length}/1000</p>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2 border border-red-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" aria-hidden />
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-60 text-white font-semibold transition-colors"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden />
                Salvando…
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" aria-hidden />
                Registrar resolução
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
