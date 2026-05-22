/**
 * PilotDashboard — monitoring widget for the controlled pilot.
 *
 * Shows:
 *   - sent / delivered / failed / duplicate-blocked / invalid-phone counts
 *   - average delivery time
 *   - daily progress bar
 *   - last safe errors (no PII — client_name only)
 *
 * Security: receives PilotMetrics which contains NO raw phones,
 * NO message text, NO credentials.
 */

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2, XCircle, Ban, Phone as PhoneIcon,
  Clock, RefreshCw, AlertTriangle, TrendingUp,
} from "lucide-react";
import { pilotService } from "../services/pilotService";
import type { PilotMetrics, PilotConfig } from "../types";

interface PilotDashboardProps {
  config: PilotConfig;
}

export default function PilotDashboard({ config }: PilotDashboardProps) {
  const [metrics,    setMetrics]    = useState<PilotMetrics | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const m = await pilotService.getMetrics(config.dailySendLimit);
      setMetrics(m);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, [config.dailySendLimit]);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 60 s
  useEffect(() => {
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (!metrics) {
    return (
      <div className="animate-pulse rounded-xl border border-amber-200 bg-amber-50 p-4 h-32" />
    );
  }

  const pct = config.dailySendLimit > 0
    ? (metrics.totalSentToday / config.dailySendLimit) * 100
    : 0;

  return (
    <section
      aria-label="Monitoramento do piloto"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-amber-900 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" aria-hidden />
          Monitoramento do Piloto
        </h3>
        <button
          onClick={() => void load()}
          disabled={loading}
          title="Atualizar métricas"
          className="text-amber-700 hover:text-amber-900 disabled:opacity-40 transition-opacity"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
        </button>
      </div>

      {/* Daily progress */}
      <div>
        <div className="flex justify-between text-xs text-amber-700 mb-1">
          <span>Envios hoje: {metrics.totalSentToday}/{config.dailySendLimit}</span>
          <span>{metrics.remainingToday} restantes</span>
        </div>
        <div className="h-2 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-orange-400" : "bg-amber-400"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
            role="progressbar"
            aria-valuenow={metrics.totalSentToday}
            aria-valuemax={config.dailySendLimit}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <StatCard
          icon={<CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden />}
          label="Entregues"
          value={metrics.totalDeliveredToday}
          colorClass="text-green-700"
        />
        <StatCard
          icon={<XCircle className="w-4 h-4 text-red-500" aria-hidden />}
          label="Falhas"
          value={metrics.totalFailedToday}
          colorClass="text-red-600"
        />
        <StatCard
          icon={<Ban className="w-4 h-4 text-gray-500" aria-hidden />}
          label="Duplicados bloq."
          value={metrics.totalDuplicateBlocked}
          colorClass="text-gray-600"
        />
        <StatCard
          icon={<PhoneIcon className="w-4 h-4 text-orange-500" aria-hidden />}
          label="Tel. inválido"
          value={metrics.totalInvalidPhone}
          colorClass="text-orange-600"
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-blue-500" aria-hidden />}
          label="Tempo médio"
          value={metrics.avgDeliveryMinutes !== null ? `${metrics.avgDeliveryMinutes}min` : "—"}
          colorClass="text-blue-600"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4 text-amber-600" aria-hidden />}
          label="Enviados"
          value={metrics.totalSentToday}
          colorClass="text-amber-700"
        />
      </div>

      {/* Last errors */}
      {metrics.lastErrors.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-amber-800 mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            Últimos erros
          </h4>
          <ul className="space-y-1">
            {metrics.lastErrors.slice(0, 5).map(e => (
              <li key={e.id} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1">
                <span className="text-gray-700 truncate max-w-[160px]">{e.clientName || "—"}</span>
                <span className={`ml-2 font-mono ${statusColor(e.status)}`}>{e.status}</span>
                <span className="ml-auto text-gray-400 whitespace-nowrap pl-2">
                  {new Date(e.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Last refresh */}
      {lastRefresh && (
        <p className="text-xs text-amber-600 text-right">
          Atualizado: {lastRefresh.toLocaleTimeString("pt-BR")}
        </p>
      )}
    </section>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, colorClass,
}: {
  icon:       React.ReactNode;
  label:      string;
  value:      number | string;
  colorClass: string;
}) {
  return (
    <div className="bg-white/70 rounded-lg px-3 py-2 flex flex-col items-center text-center">
      {icon}
      <span className={`text-lg font-bold mt-1 ${colorClass}`}>{value}</span>
      <span className="text-[10px] text-gray-500 leading-tight">{label}</span>
    </div>
  );
}

function statusColor(status: string): string {
  if (status === "erro") return "text-red-600";
  if (status === "telefone_invalido") return "text-orange-600";
  if (status === "duplicado") return "text-gray-500";
  if (status.startsWith("pilot_") || status === "fora_horario" || status === "limite_diario") return "text-amber-700";
  return "text-gray-600";
}
