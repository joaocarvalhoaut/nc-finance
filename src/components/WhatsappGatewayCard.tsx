/**
 * WhatsappGatewayCard — conexão do número de WhatsApp da conta (instância Z-API).
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

// Pareamento por QR (recomendação da Z-API: novo QR a cada 10–20 s, parar após 3).
const QR_RENOVAR_MS     = 15_000;
const QR_MAX_TENTATIVAS = 3;
const QR_POLL_MS        = 4_000;
// Instância recém-criada: espera ela subir (até ~40 s) antes de mostrar erro.
const PREPARO_ESPERA_MS      = 5_000;
const PREPARO_MAX_TENTATIVAS = 8;

// Prazo prometido ao cliente para o suporte ligar a instância (enquanto a
// criação automática pelo programa Partner da Z-API não está ativa).
const PRAZO_ATIVACAO_HORAS = 24;
const prazoAtivacao = (requestedAt: string) =>
  new Date(Date.parse(requestedAt) + PRAZO_ATIVACAO_HORAS * 60 * 60 * 1000);
const formatarPrazo = (d: Date) =>
  d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).replace(", ", " às ");

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
  // Conta do cliente que vai usar a instância (vazio = a própria conta).
  const [clienteEmail, setClienteEmail] = useState("");
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
  /** Quantos QR já foram mostrados nesta sessão de pareamento (0 = nenhum na tela). */
  const [qrTentativa,  setQrTentativa]  = useState(0);
  /** true logo depois que o celular escaneou — mostra a confirmação. */
  const [qrConectado,  setQrConectado]  = useState(false);
  /** Instância nova subindo — mostra "Preparando seu número". */
  const [preparando,   setPreparando]   = useState(false);
  /** Conta sem instância: quando o pedido foi enviado ao suporte. */
  const [pedidoAt,     setPedidoAt]     = useState<string | null>(null);

  // ── Desconectar ────────────────────────────────────────────────────────────
  const [confirmarDesconexao, setConfirmarDesconexao] = useState(false);
  const [isDisconnecting,     setIsDisconnecting]     = useState(false);
  const [disconnectMsg,       setDisconnectMsg]       = useState("");

  // ── View ───────────────────────────────────────────────────────────────────
  // Começa em "Conectar": é o que o cliente veio fazer aqui.
  const [view, setView] = useState<ViewMode>("qr");

  // ── Load status on mount ───────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      const s = await whatsappGatewayService.getStatus();
      setGatewayStatus(s);
      // Cliente que já pediu e voltou: mostra o prazo sem precisar clicar de novo.
      setPedidoAt(s.connected ? null : s.my_request_at ?? null);
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
        targetEmail: clienteEmail.trim() || undefined,
      });

      setSaveMsg(result.message ?? (result.ok ? "Salvo com sucesso!" : "Erro ao salvar."));

      if (result.ok) {
        // SECURITY: Clear all credential fields immediately after successful save
        setInstanceId("");
        setToken("");
        setClientToken("");
        setAdminToken("");
        setClienteEmail("");
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
  // O WhatsApp invalida o QR a cada 20 s. A Z-API recomenda buscar um novo a
  // cada 10–20 s e, depois de 3 sem leitura, parar e oferecer um botão — é o
  // que o efeito abaixo faz. Antes o QR era buscado uma vez só: quem demorava
  // mais de 20 s para escanear recebia "QR inválido" no celular.
  //
  // `preparo` > 0: a conta acabou de ganhar uma instância nova (criada pela API
  // de parceiro da Z-API), que leva alguns segundos para subir. Nesse intervalo
  // a Z-API ainda não entrega o QR — tenta de novo sozinho em vez de mostrar erro.
  const handleLoadQR = async (tentativa = 1, preparo = 0) => {
    setIsLoadingQR(true);
    setQrError("");
    if (tentativa === 1) setQrCode(null);
    try {
      const result = await whatsappGatewayService.getQRCode();
      if (result.ok && result.connected) {
        setQrCode(null);
        setQrTentativa(0);
        setPreparando(false);
        setQrConectado(true);
        await loadStatus();
      } else if (result.ok && result.qrCode) {
        setQrCode(result.qrCode);
        setQrTentativa(tentativa);
        setPreparando(false);
      } else if (result.ok && result.requested) {
        setQrCode(null);
        setQrTentativa(0);
        setPreparando(false);
        setPedidoAt(result.requested_at ?? new Date().toISOString());
      } else if ((result.ok && result.preparing) || (preparo > 0 && preparo < PREPARO_MAX_TENTATIVAS)) {
        setPreparando(true);
        setTimeout(() => void handleLoadQR(1, preparo + 1), PREPARO_ESPERA_MS);
      } else {
        setQrCode(null);
        setQrTentativa(0);
        setPreparando(false);
        setQrError(result.error ?? "Não foi possível obter o QR Code.");
      }
    } catch {
      setQrCode(null);
      setQrTentativa(0);
      setPreparando(false);
      setQrError("Falha de rede ao obter QR Code.");
    } finally {
      setIsLoadingQR(false);
    }
  };

  // Desconecta o celular. A instância continua da conta; para voltar é só
  // "Conectar WhatsApp" de novo — com o mesmo número ou outro.
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    setDisconnectMsg("");
    try {
      const result = await whatsappGatewayService.disconnect();
      if (result.ok) {
        setConfirmarDesconexao(false);
        setQrConectado(false);
        setDisconnectMsg("Número desconectado. As cobranças só voltam a sair depois de conectar um número de novo.");
        await loadStatus();
      } else {
        setDisconnectMsg(result.error ?? "Não foi possível desconectar.");
      }
    } catch {
      setDisconnectMsg("Falha de rede ao desconectar.");
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Enquanto o QR está na tela: confere a conexão a cada 4 s (para trocar o QR
  // por "Conectado" assim que o celular escanear) e renova o QR a cada 15 s,
  // até 3 vezes.
  useEffect(() => {
    if (view !== "qr" || !qrCode || qrTentativa === 0) return;

    let ativo = true;
    const poll = setInterval(async () => {
      try {
        const r = await whatsappGatewayService.validateConnection();
        if (ativo && r.connected) {
          setGatewayStatus(r);
          setQrCode(null);
          setQrTentativa(0);
          setQrConectado(true);
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, QR_POLL_MS);

    const renovar = setTimeout(() => {
      if (!ativo) return;
      if (qrTentativa < QR_MAX_TENTATIVAS) {
        void handleLoadQR(qrTentativa + 1);
      } else {
        setQrCode(null);
        setQrTentativa(0);
        setQrError("O QR Code expirou. Clique em \"Gerar QR Code\" para tentar de novo.");
      }
    }, QR_RENOVAR_MS);

    return () => {
      ativo = false;
      clearInterval(poll);
      clearTimeout(renovar);
    };
    // handleLoadQR muda a cada render; o ciclo depende só do QR atual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, qrCode, qrTentativa]);

  // ── Selo de status ─────────────────────────────────────────────────────────
  const selo =
    !gatewayStatus ? { txt: "…", cls: "text-zinc-400 border-zinc-700 bg-zinc-900" }
    : gatewayStatus.connected ? { txt: "Conectado", cls: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" }
    : gatewayStatus.status === "error" ? { txt: "Sem resposta", cls: "text-rose-300 border-rose-500/30 bg-rose-500/10" }
    : { txt: "Não conectado", cls: "text-zinc-300 border-zinc-600 bg-zinc-800" };

  const Rotulo = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{children}</p>
  );
  const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500 transition-colors";
  const btnPrimario = "w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer";
  const btnSecundario = "px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold disabled:opacity-50 transition-colors cursor-pointer";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="bg-zinc-950 border border-zinc-800 rounded-xl">

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">WhatsApp</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Número que envia as suas cobranças</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border ${selo.cls}`}>{selo.txt}</span>
          <button
            onClick={() => void loadStatus()}
            disabled={isLoadingStatus}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title="Atualizar status"
            aria-label="Atualizar status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">

        {/* ── Credenciais à mão (só suporte) ───────────────────────────── */}
        {view === "config" && gatewayStatus?.can_manage_instances ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Rotulo>Configuração manual (suporte)</Rotulo>
              <button onClick={() => setView("qr")} className="text-[11px] text-zinc-500 hover:text-zinc-300 cursor-pointer">Voltar</button>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              As credenciais vão direto ao servidor e <strong className="text-zinc-300">nunca ficam no navegador</strong>.
              Os campos são limpos depois de salvar.
            </p>

            <div className="flex justify-end">
              <button
                onClick={() => setShowSecrets((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showSecrets ? "Ocultar campos" : "Mostrar campos"}
              </button>
            </div>

            {[
              { label: "Instance ID",    value: instanceId,   setter: setInstanceId,  placeholder: "ID da instância na Z-API" },
              { label: "Token",          value: token,        setter: setToken,        placeholder: "Token da instância" },
              { label: "Client Token",   value: clientToken,  setter: setClientToken,  placeholder: "Token de segurança da conta Z-API" },
              { label: "Token de Admin", value: adminToken,   setter: setAdminToken,   placeholder: "GATEWAY_ADMIN_SECRET" },
            ].map(({ label, value, setter, placeholder }) => (
              <div key={label}>
                <label className="block mb-1"><Rotulo>{label}</Rotulo></label>
                <input
                  type={showSecrets ? "text" : "password"}
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  className={inputCls}
                />
              </div>
            ))}

            <div>
              <label className="block mb-1"><Rotulo>E-mail da conta do cliente (opcional)</Rotulo></label>
              <input
                type="email"
                value={clienteEmail}
                onChange={(e) => setClienteEmail(e.target.value)}
                placeholder="vazio = esta conta"
                autoComplete="off"
                className={inputCls}
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                Liga uma instância comprada à mão na Z-API à conta do cliente. Ele depois conecta o
                número sozinho, pelo &quot;Conectar WhatsApp&quot;.
              </p>
            </div>

            {saveMsg && (
              <p className={`text-xs p-2 rounded-lg ${
                saveMsg.toLowerCase().includes("sucesso") || saveMsg.toLowerCase().includes("salvo")
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-amber-500/10 text-amber-400"
              }`}>
                {saveMsg}
              </p>
            )}

            <button onClick={() => void handleSave()} disabled={isSaving} className={btnPrimario}>
              {isSaving
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando…</>
                : <><Save className="w-3.5 h-3.5" /> Salvar credenciais</>}
            </button>
          </div>
        ) : (
          <>
            {/* ── Número ─────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Rotulo>Número</Rotulo>
                <p className={`mt-0.5 text-sm font-mono ${gatewayStatus?.connected ? "text-white" : "text-zinc-600"}`}>
                  {gatewayStatus?.connected
                    ? gatewayStatus.phone_number_masked ?? "Conectado"
                    : "Nenhum número conectado"}
                </p>
              </div>
              {gatewayStatus?.connected && !qrCode && (
                <button onClick={() => void handleValidate()} disabled={isValidating} className={`${btnSecundario} flex-shrink-0`}>
                  {isValidating ? "Testando…" : "Testar conexão"}
                </button>
              )}
            </div>

            {validateMsg && (
              <p className={`text-xs p-2 rounded-lg ${
                gatewayStatus?.connected ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
              }`}>
                {validateMsg}
              </p>
            )}

            {/* ── Conectar ───────────────────────────────────────────────── */}
            {!gatewayStatus?.connected && !qrCode && (
              <>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Conecte o WhatsApp do número que vai enviar as cobranças: clique no botão e escaneie
                  o código com o celular. Leva menos de um minuto.
                </p>
                <button
                  onClick={() => { setQrConectado(false); setValidateMsg(""); void handleLoadQR(); }}
                  disabled={isLoadingQR || preparando}
                  className={btnPrimario}
                >
                  {isLoadingQR
                    ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando…</>
                    : <><QrCode className="w-3.5 h-3.5" /> Conectar WhatsApp</>}
                </button>
              </>
            )}

            {preparando && !qrCode && (
              <p className="text-xs p-2.5 rounded-lg bg-zinc-900 text-zinc-300 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Preparando seu número… isso leva alguns segundos.
              </p>
            )}

            {qrConectado && (
              <p className="text-xs p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> WhatsApp conectado. Já dá para enviar cobranças por este número.
              </p>
            )}

            {pedidoAt && !gatewayStatus?.connected && (
              <div className="text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 space-y-1">
                <p className="font-semibold">Recebemos seu pedido!</p>
                <p>
                  Seu número de WhatsApp fica pronto em <strong>até {PRAZO_ATIVACAO_HORAS} horas</strong> — até{" "}
                  <strong>{formatarPrazo(prazoAtivacao(pedidoAt))}</strong>. Muitas vezes fica pronto bem antes disso.
                </p>
                <p className="text-amber-300/80">
                  Quando estiver pronto, volte aqui e clique em &quot;Conectar WhatsApp&quot; para escanear o código.
                </p>
              </div>
            )}

            {disconnectMsg && (
              <p className="text-xs p-2.5 rounded-lg bg-zinc-900 text-zinc-300">{disconnectMsg}</p>
            )}

            {qrError && (
              <p className="text-xs p-2.5 rounded-lg bg-rose-500/10 text-rose-400">{qrError}</p>
            )}

            {/* ── QR Code ────────────────────────────────────────────────── */}
            {qrCode && (
              <div className="rounded-lg border border-zinc-800 overflow-hidden">
                <div className="flex justify-center p-5 bg-white">
                  {/* Z-API devolve imagem base64 ou URL */}
                  {qrCode.startsWith("data:") || qrCode.startsWith("http") ? (
                    <img src={qrCode} alt="QR Code para conectar o WhatsApp" className="w-48 h-48" />
                  ) : (
                    <div className="text-[9px] font-mono text-zinc-900 break-all max-w-xs text-center">{qrCode}</div>
                  )}
                </div>
                <div className="px-4 py-3 space-y-1.5 bg-zinc-900/60">
                  <p className="text-xs text-zinc-300">
                    No celular: <strong className="text-white">WhatsApp › Aparelhos conectados › Conectar um aparelho</strong>
                  </p>
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Aguardando leitura — o código se renova sozinho ({qrTentativa}/{QR_MAX_TENTATIVAS})
                  </p>
                </div>
              </div>
            )}

            {/* ── Desconectar ────────────────────────────────────────────── */}
            {gatewayStatus?.connected && !qrCode && (
              confirmarDesconexao ? (
                <div className="border-t border-zinc-900 pt-4 space-y-2.5">
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Desconectar o número {gatewayStatus.phone_number_masked ?? ""}? Nenhuma cobrança sai até
                    você conectar um número de novo — inclusive as automações agendadas.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void handleDisconnect()}
                      disabled={isDisconnecting}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white transition-colors cursor-pointer"
                    >
                      {isDisconnecting ? "Desconectando…" : "Desconectar"}
                    </button>
                    <button onClick={() => setConfirmarDesconexao(false)} disabled={isDisconnecting} className={btnSecundario}>
                      Manter conectado
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-zinc-900 pt-3">
                  <button
                    onClick={() => { setConfirmarDesconexao(true); setDisconnectMsg(""); setValidateMsg(""); }}
                    className="text-[11px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    Desconectar número
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* ── Suporte: pedidos pendentes e acesso à configuração manual ────── */}
      {gatewayStatus?.can_manage_instances && view !== "config" && (
        <footer className="border-t border-zinc-800/80 px-5 py-3 space-y-3">
          {(gatewayStatus.pending_requests?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                Clientes aguardando número ({gatewayStatus.pending_requests!.length})
              </p>
              {gatewayStatus.pending_requests!.map((p) => {
                const vencido = prazoAtivacao(p.requested_at).getTime() < Date.now();
                return (
                  <div key={(p.email ?? "") + p.requested_at} className="flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="text-zinc-200 truncate">{p.email ?? "(sem e-mail)"}</div>
                      {/* Prazo prometido ao cliente; em vermelho quando já passou. */}
                      <div className={`text-[10px] ${vencido ? "text-rose-400 font-semibold" : "text-zinc-500"}`}>
                        {vencido ? "prazo vencido em " : "prazo até "}{formatarPrazo(prazoAtivacao(p.requested_at))}
                      </div>
                    </div>
                    <button
                      onClick={() => { setClienteEmail(p.email ?? ""); setSaveMsg(""); setView("config"); }}
                      className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors cursor-pointer"
                    >
                      Ligar instância
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Credenciais à mão: só contas do suporte (ADMIN_EMAILS no servidor),
              que ainda precisam do Token de Admin. */}
          <button
            onClick={() => setView("config")}
            className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors cursor-pointer"
          >
            Configuração manual (suporte)
          </button>
        </footer>
      )}
    </section>
  );
}
