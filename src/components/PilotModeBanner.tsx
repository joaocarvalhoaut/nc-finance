/**
 * PilotModeBanner — sticky top bar shown when pilot mode is active.
 *
 * Displays:
 *   - "Modo Piloto Ativo" badge
 *   - today's sent / daily-limit counter
 *   - WhatsApp number label
 *   - responsible name
 *   - remaining sends counter (orange when < 5)
 *
 * Security: receives only safe fields from PilotConfig — no credentials.
 */

import React from "react";
import { FlaskConical, Phone, User, AlertTriangle } from "lucide-react";
import type { PilotConfig, PilotDailySends } from "../types";

interface PilotModeBannerProps {
  config:   PilotConfig;
  counter:  PilotDailySends | null;
}

export default function PilotModeBanner({ config, counter }: PilotModeBannerProps) {
  if (!config.pilotEnabled) return null;

  const sent      = counter?.sentCount ?? 0;
  const remaining = Math.max(0, config.dailySendLimit - sent);
  const pct       = config.dailySendLimit > 0 ? (sent / config.dailySendLimit) * 100 : 0;
  const isLow     = remaining <= 5;
  const isFull    = remaining === 0;

  return (
    <div
      role="status"
      aria-label="Modo piloto ativo"
      className={`
        w-full px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1
        text-sm font-medium border-b
        ${isFull
          ? "bg-red-50 border-red-200 text-red-800"
          : isLow
            ? "bg-orange-50 border-orange-200 text-orange-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }
      `}
    >
      {/* Badge */}
      <span className="flex items-center gap-1.5 font-semibold">
        <FlaskConical className="w-4 h-4" aria-hidden />
        Modo Piloto Ativo
      </span>

      {/* Send counter */}
      <span className="flex items-center gap-1.5" title="Envios hoje / limite diário">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isFull ? "bg-red-500" : isLow ? "bg-orange-400" : "bg-amber-400"
          }`}
          aria-hidden
        />
        {sent}/{config.dailySendLimit} envios hoje
        {remaining > 0 && (
          <span className="text-xs opacity-75">({remaining} restantes)</span>
        )}
        {isFull && (
          <span className="flex items-center gap-0.5 text-red-700 font-semibold text-xs">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            Limite atingido
          </span>
        )}
      </span>

      {/* Progress bar */}
      <span className="flex items-center gap-1.5 min-w-[100px]" aria-hidden>
        <div className="h-1.5 w-24 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isFull ? "bg-red-500" : isLow ? "bg-orange-400" : "bg-amber-400"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </span>

      {/* Allowed window */}
      <span className="text-xs opacity-75">
        Janela: {config.allowedSendStart}–{config.allowedSendEnd} UTC
      </span>

      {/* WhatsApp number */}
      {config.whatsappNumberLabel && (
        <span className="flex items-center gap-1 text-xs opacity-75">
          <Phone className="w-3 h-3" aria-hidden />
          {config.whatsappNumberLabel}
        </span>
      )}

      {/* Responsible */}
      {config.responsibleName && (
        <span className="flex items-center gap-1 text-xs opacity-75">
          <User className="w-3 h-3" aria-hidden />
          {config.responsibleName}
        </span>
      )}
    </div>
  );
}
