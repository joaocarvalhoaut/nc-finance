import { useEffect, useState } from "react";
import {
  User as UserIcon, Mail, Phone, MapPin, FileText, CreditCard,
  Lock, Download, Trash2, Loader2, CheckCircle2, ExternalLink,
} from "lucide-react";
import type { PlanId } from "../types";
import { getPlanDefinition } from "../config/plans";
import { getMyProfile, exportMyData, type UserProfileData } from "../services/accountService";
import { updatePassword } from "../services/authService";
import { getConsent, grantAnalyticsConsent, declineAnalyticsConsent } from "../lib/analytics";

interface Props {
  userId: string;
  email: string;
  displayName: string;
  plan: PlanId;
  subscriptionStatus?: string | null;
  chargesSent?: number;
  onManageSubscription: () => void;
  onDeleteAccount: () => void;
}

const maskCpf = (cpf: string) => {
  const d = (cpf || "").replace(/\D/g, "");
  if (d.length !== 11) return cpf || "—";
  return `${d.slice(0, 3)}.***.**${d.slice(9)}`;
};

const STATUS_LABEL: Record<string, { txt: string; cls: string }> = {
  active:    { txt: "Ativa",       cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  trialing:  { txt: "Em teste",    cls: "text-sky-400 border-sky-500/30 bg-sky-500/10" },
  past_due:  { txt: "Pagamento pendente", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  canceled:  { txt: "Cancelada",   cls: "text-rose-400 border-rose-500/30 bg-rose-500/10" },
};

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-zinc-900 last:border-0">
      <div className="text-zinc-500 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-200 break-words">{value || "—"}</div>
      </div>
    </div>
  );
}

const Card = ({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) => (
  <div className="bg-zinc-900/40 border border-zinc-900 rounded-3xl p-6 shadow-xl">
    <div className="mb-4">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
    </div>
    {children}
  </div>
);

export default function MinhaConta({
  userId, email, displayName, plan, subscriptionStatus, chargesSent = 0,
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
  const status = subscriptionStatus ? STATUS_LABEL[subscriptionStatus] : null;

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

  const inputCls = "w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all";

  return (
    <div className="max-w-4xl w-full mx-auto space-y-6">

      {/* Dados cadastrais */}
      <Card title="Dados cadastrais" sub="Informações da sua conta">
        {loadingProfile ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-x-8">
            <Row icon={<UserIcon className="w-4 h-4" />} label="Nome" value={profile?.full_name || displayName} />
            <Row icon={<Mail className="w-4 h-4" />} label="E-mail" value={email} />
            <Row icon={<FileText className="w-4 h-4" />} label="CPF" value={profile ? maskCpf(profile.cpf) : "—"} />
            <Row icon={<Phone className="w-4 h-4" />} label="Telefone" value={profile?.phone || "—"} />
            <Row icon={<MapPin className="w-4 h-4" />} label="Endereço" value={[profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ")} />
            <Row icon={<MapPin className="w-4 h-4" />} label="CEP" value={profile?.cep || "—"} />
          </div>
        )}
      </Card>

      {/* Assinatura */}
      <Card title="Assinatura" sub="Seu plano e uso do mês">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <span className="text-lg font-bold text-white">{planDef.name}</span>
              {status && <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.cls}`}>{status.txt}</span>}
            </div>
            <div className="text-xs text-zinc-500 mt-1.5 font-mono">
              {chargesSent.toLocaleString("pt-BR")} / {planDef.monthlyChargeLimit.toLocaleString("pt-BR")} cobranças este mês
            </div>
            {/* barra de uso */}
            <div className="mt-2 h-1.5 w-56 max-w-full bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(100, (chargesSent / (planDef.monthlyChargeLimit || 1)) * 100)}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={onManageSubscription}
            className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            Gerenciar assinatura <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </Card>

      {/* Segurança — trocar senha */}
      <Card title="Segurança" sub="Altere sua senha de acesso">
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">Nova senha</label>
            <input type="password" value={pw} onChange={(e) => { setPw(e.target.value); setPwMsg(null); }} className={inputCls} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-1.5">Confirmar nova senha</label>
            <input type="password" value={pw2} onChange={(e) => { setPw2(e.target.value); setPwMsg(null); }} className={inputCls} placeholder="Repita a senha" autoComplete="new-password" />
          </div>
          {pwMsg && (
            <p className={`text-sm flex items-center gap-1.5 ${pwMsg.ok ? "text-emerald-400" : "text-rose-400"}`}>
              {pwMsg.ok && <CheckCircle2 className="w-4 h-4" />}{pwMsg.text}
            </p>
          )}
          <button
            type="button"
            onClick={handleChangePassword}
            disabled={pwLoading || !pw || !pw2}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-sm font-bold transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            {pwLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><Lock className="w-4 h-4" /> Atualizar senha</>}
          </button>
        </div>
      </Card>

      {/* Privacidade / LGPD */}
      <Card title="Dados e privacidade" sub="Direitos garantidos pela LGPD">
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex-1 px-4 py-3 rounded-xl border border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-500/5 text-zinc-200 text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Exportar meus dados
          </button>
          <button
            type="button"
            onClick={onDeleteAccount}
            className="flex-1 px-4 py-3 rounded-xl border border-rose-500/30 hover:border-rose-500/60 hover:bg-rose-500/5 text-rose-400 text-sm font-semibold transition-all inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" /> Excluir minha conta
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          A exportação baixa um arquivo com todos os seus dados. A exclusão é permanente e apaga banco, arquivos e a conta de acesso.
        </p>
      </Card>

      {/* Analytics — consentimento */}
      <Card title="Métricas de uso" sub="Analytics de produto, anônimo e opcional">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-400 max-w-md">
            Ajuda a melhorar o app com métricas de uso <strong className="text-zinc-300">anônimas</strong> —
            sem telefone, CPF, valor ou mensagem. Você pode desligar a qualquer momento sem perder nenhuma função.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={analyticsOn}
            onClick={toggleAnalytics}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${analyticsOn ? "bg-emerald-500" : "bg-zinc-700"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${analyticsOn ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        <p className="text-xs text-zinc-600 mt-3">
          {analyticsOn ? "Ativado — coletando apenas métricas anônimas de uso." : "Desativado — nenhuma métrica de uso é coletada."}
        </p>
      </Card>

    </div>
  );
}
