/**
 * ProtecaoNumeroCard — Configurações › Proteção do número.
 *
 * Aquecimento de número novo (opcional — só liga quem conectou um número novo)
 * e limite diário de mensagens da conta. Valem para todo envio (um por um, lote
 * e automação), em qualquer plano; o servidor aplica as mesmas regras
 * (_shared/protecaoNumero.ts).
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import {
  DIAS_DE_AQUECIMENTO, ETAPAS_AQUECIMENTO, diaDoAquecimento, hojeEmBrasilia, motivoDoLimite,
  type ProtecaoNumero, type SituacaoDoDia,
} from "../../supabase/functions/_shared/protecaoNumero.ts";
import { protecaoNumeroService } from "../services/protecaoNumeroService";

interface Props {
  userId: string;
  protecao: ProtecaoNumero | null;
  situacao: SituacaoDoDia | null;
  onSalvo: (p: ProtecaoNumero) => void;
}

const Rotulo = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{children}</p>
);

export default function ProtecaoNumeroCard({ userId, protecao, situacao, onSalvo }: Props) {
  const [limiteStr, setLimiteStr] = useState("");
  const [ativo, setAtivo] = useState(false);
  const [inicio, setInicio] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!protecao) return;
    setLimiteStr(protecao.limiteDiario ? String(protecao.limiteDiario) : "");
    setAtivo(protecao.aquecimentoAtivo);
    setInicio(protecao.aquecimentoInicio);
  }, [protecao]);

  const hoje = hojeEmBrasilia();
  const limiteNum = limiteStr.trim() ? Math.floor(Number(limiteStr)) : null;
  const limiteValido = limiteNum === null || (Number.isFinite(limiteNum) && limiteNum >= 1 && limiteNum <= 2000);
  const mudou = !!protecao && (
    limiteNum !== protecao.limiteDiario || ativo !== protecao.aquecimentoAtivo || inicio !== protecao.aquecimentoInicio
  );
  const dia = diaDoAquecimento(inicio, hoje);
  const concluido = !!inicio && dia > DIAS_DE_AQUECIMENTO;

  const salvar = async () => {
    if (!protecao || !limiteValido) return;
    setSalvando(true);
    setMsg(null);
    const novo: ProtecaoNumero = { limiteDiario: limiteNum, aquecimentoAtivo: ativo, aquecimentoInicio: inicio };
    try {
      await protecaoNumeroService.salvar(userId, novo);
      onSalvo(novo);
      setMsg({ ok: true, text: "Salvo. Vale já para os próximos envios." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setSalvando(false);
    }
  };

  const usoPct = situacao?.limite ? Math.min(100, (situacao.enviadasHoje / situacao.limite) * 100) : 0;
  const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors";

  return (
    <section className="bg-zinc-950 border border-zinc-800 rounded-xl">
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden /> Proteção do número
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">Quantas mensagens saem por dia do seu WhatsApp</p>
        </div>
      </header>

      <div className="px-5 py-4">
        {!protecao ? (
          <p className="text-sm text-zinc-500">Indisponível no momento. Tente de novo mais tarde.</p>
        ) : (
          <div className="space-y-5">

            {/* ── Hoje ──────────────────────────────────────────────────── */}
            <div>
              <div className="flex items-baseline justify-between">
                <Rotulo>Hoje</Rotulo>
                <span className="text-xs font-mono text-zinc-300">
                  {situacao?.enviadasHoje ?? 0}
                  {situacao?.limite != null
                    ? <span className="text-zinc-600"> / {situacao.limite} mensagens</span>
                    : <span className="text-zinc-600"> mensagens · sem limite</span>}
                </span>
              </div>
              {situacao?.limite != null && (
                <>
                  <div className="mt-2 h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${usoPct >= 90 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${usoPct}%` }} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-zinc-500">
                    Vale o {motivoDoLimite(situacao)}. O que passar disso fica para amanhã.
                  </p>
                </>
              )}
            </div>

            {/* ── Aquecimento ───────────────────────────────────────────── */}
            <div className="pt-4 border-t border-zinc-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-zinc-200">Meu número é novo (aquecimento)</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Ligue só se o WhatsApp conectado é novo ou quase não conversou com clientes. Por{" "}
                    {DIAS_DE_AQUECIMENTO} dias o limite sobe aos poucos: é quando o WhatsApp mais bloqueia
                    número novo que dispara muito de uma vez.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={ativo}
                  aria-label="Meu número é novo (aquecimento)"
                  onClick={() => {
                    // Ligar = número novo: o aquecimento recomeça no próximo envio.
                    if (!ativo) setInicio(null);
                    setAtivo((v) => !v);
                    setMsg(null);
                  }}
                  className={`relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${ativo ? "bg-emerald-500" : "bg-zinc-700"}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${ativo ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                </button>
              </div>

              {ativo ? (
                <>
                  <ol className="mt-3 grid grid-cols-5 gap-1.5 text-center">
                    {ETAPAS_AQUECIMENTO.map((e, i) => {
                      const de = i === 0 ? 1 : ETAPAS_AQUECIMENTO[i - 1].ateODia + 1;
                      const atual = !concluido && dia >= de && dia <= e.ateODia;
                      return (
                        <li
                          key={e.ateODia}
                          className={`rounded-md border px-1 py-1.5 ${atual ? "border-emerald-500/50 bg-emerald-500/10" : "border-zinc-800"}`}
                        >
                          <p className={`text-xs font-mono font-bold ${atual ? "text-emerald-300" : "text-zinc-300"}`}>{e.limite}</p>
                          <p className="text-[9px] text-zinc-500">dias {de}–{e.ateODia}</p>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-zinc-500">
                      {!inicio ? "Começa no próximo envio."
                        : concluido ? "Concluído: agora vale só o limite diário abaixo."
                        : `Dia ${dia} de ${DIAS_DE_AQUECIMENTO}.`}
                    </span>
                    {inicio && (
                      <button
                        type="button"
                        onClick={() => { setInicio(hoje); setMsg(null); }}
                        className="text-zinc-400 hover:text-white underline underline-offset-2 cursor-pointer flex-shrink-0"
                        title="Use quando trocar o número de WhatsApp da conta"
                      >
                        Trocou de número? Recomeçar
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            {/* ── Limite diário ─────────────────────────────────────────── */}
            <div className="pt-4 border-t border-zinc-900">
              <label htmlFor="pn-limite" className="block mb-1.5"><Rotulo>Limite diário de mensagens</Rotulo></label>
              <input
                id="pn-limite"
                type="number"
                inputMode="numeric"
                min={1}
                max={2000}
                value={limiteStr}
                onChange={(e) => { setLimiteStr(e.target.value); setMsg(null); }}
                placeholder="Sem limite"
                className={inputCls}
              />
              <p className="mt-1.5 text-[11px] text-zinc-500 leading-relaxed">
                Vale todo dia, em toda forma de envio: um por um, lote e automação. Com o aquecimento
                ligado, vale o menor dos dois. Sugestão: até 200 por dia.
              </p>
              {!limiteValido && <p className="mt-1 text-[11px] text-rose-400">Use um número de 1 a 2000, ou deixe vazio.</p>}
            </div>

            {msg && (
              <p className={`text-xs flex items-center gap-1.5 ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}>
                {msg.ok && <CheckCircle2 className="w-3.5 h-3.5" />}{msg.text}
              </p>
            )}
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={!mudou || !limiteValido || salvando}
              className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black text-xs font-bold transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              {salvando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : "Salvar proteção"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
