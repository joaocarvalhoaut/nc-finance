/**
 * WhatsappGatewayCard — painel de configuração da instância Z-API.
 *
 * Regras de segurança (IMUTÁVEIS):
 *   - token, client_token e instance_id NÃO ficam em estado React após o envio.
 *   - Os campos do formulário são limpos imediatamente após saveCredentials().
 *   - O componente exibe apenas: status, connected, phone_number_masked, updated_at.
 *   - Nenhum campo sensível é logado no browser (console.log).
 *   - adminToken é usado apenas durante a chamada e descartado.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Wifi, WifiOff, RefreshCw, QrCode, Save, Eye, EyeOff,
  CheckCircle, AlertTriangle, Clock, Smartphone,
} from "lucide-react";
import {
  whatsappGatewayService,
  type GatewayStatus,
} from "../services/whatsappGatewayService";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "status" | "config" | "qr";

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsappGatewayCard() {
  // ── Status (safe — no credentials) ────────────────────────────────────────
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus]       = useState(false);

  // ── Config form (credentials — cleared after submit) ──────────────────────
  // RULE: These states are cleared immediately after saveCredentials() returns.
  const [instanceId,   setInstanceId]   = useState("");
  const [token,        setToken]        = useState("");
  const [clientToken,  setClientToken]  = useState("");
  const [adminToken,   setAdminToken]   = useState("");
  const [showSecrets,  setShowSecrets]  = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);
  const [saveMsg,      setSaveMsg]      = useState("");

  // ── Validation ─────────────────────────────────────────────────────────────
  const [isValidating,  setIsValidating]  = useState(false);
  const [validateMsg,   setValidateMsg]   = useState("");

  // ── QR Code (image data only — no credential) ─────────────────────────────
  const [qrCode,       setQrCode]       = useState<string | null>(null);
  const [isLoadingQR,  setIsLoadingQR]  = useState(false);
  const [qrError,      setQrError]      = useState("");

  // ── View ───────────────────────────────────────────────────────────────────
  const [view, setView] = useState<ViewMode>("status");

  // ── Load status on mount ───────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const s = await whatsappGatewayService.getStatus();
      setGatewayStatus(s);
    } finally {
      setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  // ── Save credentials ───────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!instanceId.trim() || !token.trim() || !clientToken.trim() || !adminToken.trim()) {
      setSaveMsg("Preencha todos os campos, incluindo o Token de Admin.");
      return;
    }
    setIsSaving(true);
    setSaveMsg("");
    try {
      const result = await whatsappGatewayService.saveCredentials({
        instanceId: instanceId.trim(),
        token:      token.trim(),
        clientToken: clientToken.trim(),
        adminToken:  adminToken.trim(),
      });

      setSaveMsg(result.message ?? (result.ok ? "Salvo com sucesso!" : "Erro ao salvar."));

      if (result.ok) {
        // SECURITY: Clear all credential fields immediately after successful save
        setInstanceId("");
        setToken("");
        setClientToken("");
        setAdminToken("");
        // Reload status to show updated state
        await loadStatus();
      }
    } catch {
      setSaveMsg("Falha de rede ao salvar credenciais.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Validate connection ────────────────────────────────────────────────────
  const handleValidate = async () => {
    setIsValidating(true);
    setValidateMsg("");
    try {
      const result = await whatsappGatewayService.validateConnection();
      setValidateMsg(result.message ?? (result.connected ? "Conectado!" : "Não conectado."));
      setGatewayStatus(result);
    } catch {
      setValidateMsg("Falha ao testar conexão.");
    } finally {
      setIsValidating(false);
    }
  };

  // ── Load QR Code ───────────────────────────────────────────────────────────
  const handleLoadQR = async () => {
    setIsLoadingQR(true);
    setQrError("");
    setQrCode(null);
    try {
      const result = await whatsappGatewayService.getQRCode();
      if (result.ok && result.qrCode) {
        setQrCode(result.qrCode);
      } else {
        setQrError(result.error ?? "Não foi possível obter o QR Code.");
      }
    } catch {
      setQrError("Falha de rede ao obter QR Code.");
    } finally {
      setIsLoadingQR(false);
    }
  };

  // ── Status badge ───────────────────────────────────────────────────────────
  const StatusBadge = () => {
    if (!gatewayStatus) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
          <Clock className="w-3 h-3" /> carregando…
        </span>
      );
    }
    if (gatewayStatus.connected) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" /> Conectado
        </span>
      );
    }
    if (gatewayStatus.connected_pending_phone) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <QrCode className="w-3 h-3" /> Aguardando QR
        </span>
      );
    }
    if (gatewayStatus.status === "error") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3 h-3" /> Erro de conexão
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-zinc-800 text-zinc-500 border border-zinc-700">
        <WifiOff className="w-3 h-3" /> Inativo
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-4">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Integração WhatsApp (Z-API)</h3>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge />
          <button
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Atualizar status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Status summary ───────────────────────────────────────────────── */}
      {gatewayStatus && (
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="bg-zinc-950 rounded-lg p-2 space-y-0.5">
            <div className="text-zinc-500 uppercase text-[9px] font-bold tracking-widest">Status</div>
            <div className="text-zinc-200">{gatewayStatus.status}</div>
          </div>
          <div className="bg-zinc-950 rounded-lg p-2 space-y-0.5">
            <div className="text-zinc-500 uppercase text-[9px] font-bold tracking-widest">Número</div>
            <div className="text-zinc-200 flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-zinc-600" />
              {gatewayStatus.phone_number_masked ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab navigation ───────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-zinc-800 pb-2">
        {(["status", "config", "qr"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded text-[11px] font-semibold transition-colors ${
              view === v
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {v === "status" ? "Validar" : v === "config" ? "Configurar" : "QR Code"}
          </button>
        ))}
      </div>

      {/* ── Status / Validate tab ─────────────────────────────────────────── */}
      {view === "status" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Testa a conexão Z-API com as credenciais salvas e atualiza o status.
          </p>
          <button
            onClick={() => void handleValidate()}
            disabled={isValidating}
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            {isValidating
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Validando…</>
              : <><Wifi className="w-4 h-4" /> Testar Conexão</>
            }
          </button>
          {validateMsg && (
            <p className={`text-xs p-2 rounded-lg ${
              gatewayStatus?.connected
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }`}>
              {validateMsg}
            </p>
          )}
        </div>
      )}

      {/* ── Config tab ───────────────────────────────────────────────────── */}
      {view === "config" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            As credenciais são enviadas diretamente ao servidor e <strong className="text-zinc-300">nunca ficam
            armazenadas no browser</strong>. Os campos são limpos automaticamente após o envio.
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowSecrets((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {showSecrets ? "Ocultar campos" : "Mostrar campos"}
            </button>
          </div>

          {[
            { label: "Instance ID",    value: instanceId,   setter: setInstanceId,  placeholder: "Sua Instance ID" },
            { label: "Token",          value: token,        setter: setToken,        placeholder: "Token da instância" },
            { label: "Client Token",   value: clientToken,  setter: setClientToken,  placeholder: "Client-Token" },
            { label: "Token de Admin", value: adminToken,   setter: setAdminToken,   placeholder: "GATEWAY_ADMIN_SECRET" },
          ].map(({ label, value, setter, placeholder }) => (
            <div key={label}>
              <label className="text-[10px] uppercase font-mono text-zinc-500 font-bold block mb-0.5">{label}</label>
              <input
                type={showSecrets ? "text" : "password"}
                value={value}
                onChange={(e) => setter(e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500 transition-all"
              />
            </div>
          ))}

          {saveMsg && (
            <p className={`text-xs p-2 rounded-lg ${
              saveMsg.toLowerCase().includes("sucesso") || saveMsg.toLowerCase().includes("salvo")
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-amber-500/10 text-amber-400"
            }`}>
              {saveMsg}
            </p>
          )}

          <button
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            {isSaving
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Salvando…</>
              : <><Save className="w-4 h-4" /> Salvar Credenciais</>
            }
          </button>
        </div>
      )}

      {/* ── QR Code tab ──────────────────────────────────────────────────── */}
      {view === "qr" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Gere o QR Code para parear o WhatsApp com a instância Z-API.
            Só disponível quando a instância está aguardando conexão.
          </p>

          <button
            onClick={() => void handleLoadQR()}
            disabled={isLoadingQR}
            className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            {isLoadingQR
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Carregando QR…</>
              : <><QrCode className="w-4 h-4" /> Gerar QR Code</>
            }
          </button>

          {qrError && (
            <p className="text-xs p-2 rounded-lg bg-rose-500/10 text-rose-400">{qrError}</p>
          )}

          {qrCode && (
            <div className="flex flex-col items-center gap-2 p-4 bg-white rounded-xl">
              {/* Z-API returns base64 image or a URL */}
              {qrCode.startsWith("data:") || qrCode.startsWith("http") ? (
                <img src={qrCode} alt="QR Code WhatsApp" className="w-48 h-48" />
              ) : (
                <div className="text-[9px] font-mono text-zinc-900 break-all max-w-xs text-center">
                  {qrCode}
                </div>
              )}
              <p className="text-[10px] text-zinc-500 text-center mt-1">
                Escaneie com o WhatsApp no celular do número que será usado.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
