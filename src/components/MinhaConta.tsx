import { useEffect, useState } from "react";
import { Download, Trash2, Loader2, CheckCircle2, Lock } from "lucide-react";
import type { PlanId, UserSubscription } from "../types";
import { getPlanDefinition } from "../config/plans";
import { subscriptionBadge } from "../config/subscriptionBadge";
import { getMyProfile, exportMyData, type UserProfileData } from "../services/accountService";
import { updatePassword } from "../services/authService";
import { getConsent, grantAnalyticsConsent, declineAnalyticsConsent } from "../lib/analytics";
import PasswordInput from "./PasswordInput";
import WhatsappGatewayCard from "./WhatsappGatewayCard";

interface Props {
  userId: string;
  email: string;
  displayName: string;
  plan: PlanId;
  /** Assinatura completa: selo (inclui cortesia), datas e provedor. */
  subscription?: UserSubscription | null;
  chargesSent?: number;
  onManageSubscription: () => void;
  onDeleteAccount: () => void;
}

const maskCpf = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "";
  return `${d.slice(0, 3)}.***.**${d.slice(9)}`;
};

const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "NC";

const Rotulo = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{children}</p>
);

/** Moldura de seção: mesmo padrão da janela Gerenciar assinatura. */
const Secao = ({ titulo, sub, acao, children }: {
  titulo: string; sub?: string; acao?: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-zinc-950 border border-zinc-800 rounded-xl">
    <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-white">{titulo}</h3>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
      {acao}
    </header>
    <div className="px-5 py-4">{children}</div>
  </section>
);

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2.5 border-b border-zinc-900 last:border-0">
      <Rotulo>{label}</Rotulo>
      <p className={`mt-0.5 text-sm break-words ${value ? "text-zinc-200" : "text-zinc-600"}`}>
        {value || "Não informado"}
      </p>
    </div>
  );
}

export default function MinhaConta({
  userId, email, displayName, plan, subscription, chargesSent = 0,
  onManageSubscription, onDeleteAccount,
}: Props) {
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [exporting, setExporting] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(() => getConsent()?.analytics === true);

  const toggleAnalytics = () => {
    if (analyticsOn) { declineAnalyticsConsent(); setAnalyticsOn(false); }
    else { grantAnalyticsConsent(); setAnalyticsOn(true); }
  };

  useEffect(() => {
    let alive = true;
    getMyProfile(userId).then((p) => { if (alive) { setProfile(p); setLoadingProfile(false); } });
    return () => { alive = false; };
  }, [userId]);

  const planDef = getPlanDefinition(plan);
  const selo = subscriptionBadge(subscription);
  const cortesia = subscription?.billingProvider === "cortesia";
  const nome = profile?.full_name || displayName;
  const limite = planDef.monthlyChargeLimit || 1;
  const usoPct = Math.min(100, (chargesSent / limite) * 100);

  // A data que importa no estado atual da assinatura.
  const fim = subscription?.currentPeriodEnd ?? null;
  const dataAssinatura: { rotulo: string; valor: string } | null =
    !subscription || cortesia || !subscription.asaasSubscriptionId || !fim ? null
    : subscription.cancelAtPeriodEnd ? { rotulo: "Acesso até", valor: formatDate(fim) }
    : subscription.status === "trialing" ? { rotulo: "Teste grátis até", valor: formatDate(fim) }
    : subscription.status === "past_due" ? { rotulo: "Fatura vencida em", valor: formatDate(fim) }
    : subscription.status === "active" ? { rotulo: "Próxima fatura", valor: formatDate(fim) }
    : null;

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (pw.length < 8) { setPwMsg({ ok: false, text: "A senha deve ter ao menos 8 caracteres." }); return; }
    if (pw !== pw2) { setPwMsg({ ok: false, text: "As senhas não coincidem." }); return; }
    setPwLoading(true);
    try {
      await updatePassword(pw);
      setPw(""); setPw2("");
      setPwMsg({ ok: true, text: "Senha atualizada com sucesso." });
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao atualizar a senha." });
    } finally {
      setPwLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try { await exportMyData(); }
    catch (e) { window.alert(e instanceof Error ? e.message : "Falha ao exportar."); }
    finally { setExporting(false); }
  };

  const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors";

  return (
    <div className="max-w-6xl w-full mx-auto space-y-6">

      {/* ── Identificação ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 font-black flex items-center justify-center">
          {iniciais(nome)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-white tracking-tight truncate">{nome}</h2>
          <p className="text-sm text-zinc-500 truncate">{email}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 items-start">

        {/* ── Coluna principal: assinatura, WhatsApp e senha ──────────── */}
        <div className="lg:col-span-3 space-y-6">

          <Secao
            titulo="Assinatura"
            sub="Seu plano e o uso do mês"
            acao={
              <button
                type="button"
                onClick={onManageSubscription}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Gerenciar
              </button>
            }
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-2xl font-black text-white tracking-tight">{planDef.name}</p>
              <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded border ${selo.cls}`}>{selo.txt}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {cortesia ? "Sem cobrança" : `R$ ${planDef.priceBRL.toLocaleString("pt-BR")}/mês`}
              {" · "}{planDef.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças/mês
            </p>

            <div className={`mt-5 grid gap-4 ${dataAssinatura ? "sm:grid-cols-2" : ""}`}>
              <div>
                <div className="flex items-baseline justify-between">
                  <Rotulo>Uso do mês</Rotulo>
                  <span className="text-xs font-mono text-zinc-300">
                    {chargesSent.toLocaleString("pt-BR")} <span className="text-zinc-600">/ {planDef.monthlyChargeLimit.toLocaleString("pt-BR")}</span>
                  </span>
                </div>
                <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${usoPct >= 90 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${usoPct}%` }} />
                </div>
              </div>
              {dataAssinatura && (
                <div className="flex items-baseline justify-between sm:block">
                  <Rotulo>{dataAssinatura.rotulo}</Rotulo>
                  <p className="text-sm font-mono text-white sm:mt-1">{dataAssinatura.valor}</p>
                </div>
              )}
            </div>
          </Secao>

          {/* Número de WhatsApp da conta — o cartão traz a própria moldura */}
          <WhatsappGatewayCard />

          <Secao titulo="Segurança" sub="Senha de acesso">
            <div className="space-y-3">
              <div>
                <label className="block mb-1.5"><Rotulo>Nova senha</Rotulo></label>
                <PasswordInput aria-label="Nova senha" value={pw} onChange={(e) => { setPw(e.target.value); setPwMsg(null); }} className={inputCls} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
              </div>
              <div>
                <label className="block mb-1.5"><Rotulo>Confirmar nova senha</Rotulo></label>
                <PasswordInput aria-label="Confirmar nova senha" value={pw2} onChange={(e) => { setPw2(e.target.value); setPwMsg(null); }} className={inputCls} placeholder="Repita a senha" autoComplete="new-password" />
              </div>
              {pwMsg && (
                <p className={`text-xs flex items-center gap-1.5 ${pwMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>
                  {pwMsg.ok && <CheckCircle2 className="w-3.5 h-3.5" />}{pwMsg.text}
                </p>
              )}
              <button
                type="button"
                onClick={handleChangePassword}
                disabled={pwLoading || !pw || !pw2}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                {pwLoading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : <><Lock className="w-3.5 h-3.5" /> Atualizar senha</>}
              </button>
            </div>
          </Secao>
        </div>

        {/* ── Coluna lateral: dados da conta e privacidade ────────────── */}
        <div className="lg:col-span-2 space-y-6">

          <Secao titulo="Dados cadastrais" sub="Informados no cadastro">
            {loadingProfile ? (
              <div className="flex items-center gap-2 text-zinc-500 text-sm py-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
            ) : (
              <div className="-my-2.5">
                <Campo label="Nome" value={nome} />
                <Campo label="E-mail" value={email} />
                <Campo label="CPF" value={profile ? maskCpf(profile.cpf) : ""} />
                <Campo label="Telefone" value={profile?.phone || ""} />
                <Campo label="Endereço" value={[profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ")} />
                <Campo label="CEP" value={profile?.cep || ""} />
              </div>
            )}
          </Secao>

          <Secao titulo="Privacidade" sub="Seus dados, seus direitos (LGPD)">
            {/* Métricas anônimas — opt-in */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-200">Métricas de uso anônimas</p>
                <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                  Sem telefone, CPF, valor ou mensagem. Desligar não tira nenhuma função.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analyticsOn}
                aria-label="Métricas de uso anônimas"
                onClick={toggleAnalytics}
                className={`relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${analyticsOn ? "bg-emerald-500" : "bg-zinc-700"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${analyticsOn ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-zinc-900 space-y-3">
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="w-full py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Exportar meus dados
              </button>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                Baixa um arquivo com todos os seus dados. Excluir a conta é permanente: apaga banco,
                arquivos e o acesso, e cancela a assinatura.
              </p>
              <button
                type="button"
                onClick={onDeleteAccount}
                className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" /> Excluir minha conta
              </button>
            </div>
          </Secao>
        </div>
      </div>
    </div>
  );
}
