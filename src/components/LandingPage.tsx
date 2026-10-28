import React, { lazy, Suspense, useEffect, useState } from "react";
import PasswordInput from "./PasswordInput";
import TermosDeUso from "./TermosDeUso";
import PoliticaPrivacidade from "./PoliticaPrivacidade";
import AcordoTratamentoDados from "./AcordoTratamentoDados";
import PhoneDispatchSimulation from "./PhoneDispatchSimulation";
import {
  ArrowRight,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderSearch,
  QrCode,
  X,
} from "lucide-react";
import type { AuthCredentials, SignUpPayload } from "../types";
import { PLAN_LIST } from "../config/plans";
import { CONTATO_EMAIL, DEFINICAO, DIAS_TESTE, DIFERENCIAIS, PASSOS, PERGUNTAS } from "../content/landing";
const Suporte = lazy(() => import("./Suporte"));

/**
 * Landing pública.
 *
 * Pré-renderizada no build (tools/prerender-landing.mjs): o HTML vai pronto no
 * index.html para buscadores e IAs que não executam JavaScript. Por isso nada
 * aqui pode tocar em window/document fora de efeitos e handlers.
 *
 * Os textos de conteúdo (passos, diferenciais, perguntas) vêm de
 * src/content/landing.ts e os planos de src/config/plans.ts — a mesma fonte do
 * JSON-LD e do /llms.txt.
 */

interface LandingPageProps {
  onLogin: (credentials: AuthCredentials) => Promise<void>;
  onSignUp: (payload: SignUpPayload) => Promise<{ needsEmailConfirmation: boolean; message: string }>;
  onForgotPassword: (email: string) => Promise<void>;
  isAuthLoading: boolean;
  authConfigError?: string;
}

type ModoAcesso = "entrar" | "cadastro" | "senha";
type Tom = "amigavel" | "neutro" | "firme" | "juridico";

const TONS: Array<{ id: Tom; nome: string }> = [
  { id: "amigavel", nome: "Amigável" },
  { id: "neutro", nome: "Neutro" },
  { id: "firme", nome: "Firme" },
  { id: "juridico", nome: "Jurídico" },
];

// Exemplo fictício para o simulador.
const EXEMPLO = { cliente: "Carlos", empresa: "Móveis Silva", documento: "1082-3", vencimento: "20/10/2026", valor: "1.849,90", dias: 7 };

/**
 * Mensagens padrão de cada tom — espelha DEFAULT_PATTERNS (App.tsx), com a
 * assinatura {empresa} preenchida pelo nome da empresa do exemplo.
 */
const mensagemDoTom = (tom: Tom): string => {
  const dados = `Documento: ${EXEMPLO.documento}\nVencimento: ${EXEMPLO.vencimento}\nValor: R$ ${EXEMPLO.valor}`;
  switch (tom) {
    case "amigavel":
      return `Olá ${EXEMPLO.cliente}, tudo bem?\nPassando para lembrar de forma tranquila sobre o boleto abaixo, que segue em nosso acompanhamento.\n\n${dados}\n\nSe precisar, posso reenviar os dados do boleto ou te ajudar a localizar as informações.\n\nFico à disposição. Equipe financeira ${EXEMPLO.empresa}.`;
    case "neutro":
      return `Olá ${EXEMPLO.cliente},\nSegue o acompanhamento do título abaixo para sua verificação.\n\n${dados}\n\nO título consta em aberto em nosso acompanhamento. Solicitamos a confirmação do pagamento ou o envio do comprovante para atualização do status.\n\nAtenciosamente, equipe financeira ${EXEMPLO.empresa}.`;
    case "firme":
      return `Olá ${EXEMPLO.cliente},\nPrecisamos tratar com prioridade a pendência financeira abaixo.\n\n${dados}\n\nO título acumula ${EXEMPLO.dias} dia(s) de atraso e exige uma definição imediata. Pedimos regularização ainda hoje ou retorno com a previsão de pagamento.\n\nEquipe de cobrança ${EXEMPLO.empresa}.`;
    case "juridico":
      return `Prezado(a) ${EXEMPLO.cliente},\nComunicamos, para fins de registro administrativo, a permanência da pendência descrita abaixo.\n\n${dados}\n\nConsta em sistema atraso de ${EXEMPLO.dias} dia(s), sem regularização identificada até o momento. Solicitamos manifestação formal e a regularização com a maior brevidade possível.\n\nAtenciosamente, departamento administrativo ${EXEMPLO.empresa}.`;
  }
};

const ICONES_DIFERENCIAIS = [QrCode, FolderSearch, CalendarClock];

const rotulo = "text-[10px] font-mono uppercase tracking-widest text-zinc-500";
const botaoPrimario = "inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors cursor-pointer";
const botaoSecundario = "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white font-semibold transition-colors cursor-pointer";

export default function LandingPage({
  onLogin,
  onSignUp,
  onForgotPassword,
  isAuthLoading,
  authConfigError = "",
}: LandingPageProps) {
  const [acesso, setAcesso] = useState<ModoAcesso | null>(null);
  const [tom, setTom] = useState<Tom>("amigavel");
  const [showTermos, setShowTermos] = useState(false);
  const [showPrivacidade, setShowPrivacidade] = useState(false);
  const [showAcordo, setShowAcordo] = useState(false);
  const [showSuporte, setShowSuporte] = useState(false);

  // Barra de CTA fixa (celular): só depois de rolar além do hero.
  const [showStickyCta, setShowStickyCta] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowStickyCta(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Links antigos (#auth-panel) e diretos (#entrar, #cadastro) abrem o acesso —
  // ao carregar a página e quando a âncora muda sem recarregar.
  useEffect(() => {
    const abrirPelaAncora = () => {
      const h = window.location.hash;
      if (h === "#entrar" || h === "#auth-panel") setAcesso("entrar");
      else if (h === "#cadastro") setAcesso("cadastro");
    };
    abrirPelaAncora();
    window.addEventListener("hashchange", abrirPelaAncora);
    return () => window.removeEventListener("hashchange", abrirPelaAncora);
  }, []);

  const abrirCadastro = () => setAcesso("cadastro");
  const abrirEntrar = () => setAcesso("entrar");
  const documentoLegalAberto = showTermos || showPrivacidade || showAcordo;

  return (
    <div className="bg-zinc-950 text-zinc-100 min-h-screen font-sans overflow-x-clip selection:bg-emerald-500 selection:text-black">
      {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-zinc-950/85 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href="#inicio" className="font-display font-black text-lg tracking-tight text-white">
            NC <span className="text-emerald-400">Finance</span>
          </a>
          <nav aria-label="Seções" className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
            <a href="#como-funciona" className="hover:text-white transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-white transition-colors">Planos</a>
            <a href="#perguntas" className="hover:text-white transition-colors">Perguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={abrirEntrar} className="px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer">
              Entrar
            </button>
            <button type="button" onClick={abrirCadastro} className={`${botaoPrimario} px-4 py-2 text-sm`}>
              Testar grátis
            </button>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-16 sm:pb-20 grid lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            <p className={`${rotulo} text-emerald-400`}>Software de cobrança pelo WhatsApp</p>
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] tracking-tight">
              Cobre seus clientes pelo WhatsApp, no automático.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Importe a lista de quem está em atraso, revise e envie do seu próprio número de WhatsApp, com o boleto anexado.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button type="button" onClick={abrirCadastro} className={`${botaoPrimario} px-6 py-3.5 text-base`}>
                Testar {DIAS_TESTE} dias grátis <ArrowRight className="w-4 h-4" />
              </button>
              <a href="#mensagem" className={`${botaoSecundario} px-6 py-3.5 text-base`}>
                Ver como a mensagem chega
              </a>
            </div>
            <p className="mt-4 text-xs text-zinc-500">Sem cartão de crédito · Cancele quando quiser</p>
          </div>
          <div className="lg:col-span-5 flex justify-center">
            <PhoneDispatchSimulation />
          </div>
        </section>

        {/* Faixa de confiança (uma só) */}
        <div className="border-y border-zinc-900">
          <ul className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-zinc-400">
            <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Conforme a LGPD</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Sem fidelidade</li>
            <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Envio pelo seu número</li>
          </ul>
        </div>

        {/* ── Como funciona ───────────────────────────────────────────────── */}
        <section id="como-funciona" aria-labelledby="titulo-como-funciona" className="scroll-mt-20 max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="max-w-2xl">
            <h2 id="titulo-como-funciona" className="text-3xl sm:text-4xl font-black text-white tracking-tight">Como funciona</h2>
            <p className="mt-4 text-zinc-400 leading-relaxed">{DEFINICAO}</p>
          </div>
          <ol className="mt-12 grid md:grid-cols-3 gap-4">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
                <span className="font-mono text-xs text-emerald-400">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-lg font-bold text-white">{p.titulo}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Como a mensagem chega ───────────────────────────────────────── */}
        <section id="mensagem" aria-labelledby="titulo-mensagem" className="scroll-mt-20 border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 id="titulo-mensagem" className="text-3xl sm:text-4xl font-black text-white tracking-tight">Veja como a mensagem chega</h2>
              <p className="mt-4 text-zinc-400 leading-relaxed">
                O cliente recebe do seu número, assinada com o nome da sua empresa, com os dados do título e o boleto em PDF. Escolha o tom de acordo com o atraso e o relacionamento — o texto pode ser ajustado antes de cada envio.
              </p>
              <p className={`${rotulo} mt-8 mb-2`}>Tom da mensagem</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Tom da mensagem">
                {TONS.map((t) => {
                  const ativo = tom === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => setTom(t.id)}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        ativo ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {t.nome}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-zinc-500">Exemplo com dados fictícios: título vencido há {EXEMPLO.dias} dias.</p>
            </div>

            {/* Conversa como o cliente vê */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm rounded-[2.5rem] bg-black p-2 border border-zinc-800">
                <div className="rounded-[2rem] overflow-hidden bg-[#0b141a]">
                  <div className="flex items-center gap-3 px-4 pt-5 pb-3 bg-[#1f2c34]">
                    <div className="w-9 h-9 rounded-full bg-zinc-600 text-white text-xs font-bold flex items-center justify-center">MS</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{EXEMPLO.empresa}</p>
                      <p className="text-[11px] text-zinc-400">conta comercial</p>
                    </div>
                  </div>
                  <div className="px-3 py-4 min-h-[380px] flex flex-col justify-end">
                    <div className="self-end max-w-[88%] rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2 text-[13px] leading-snug text-zinc-50 shadow">
                      <p className="whitespace-pre-line">{mensagemDoTom(tom)}</p>
                      <div className="mt-2 flex items-center gap-2 rounded-md bg-black/20 px-2.5 py-2">
                        <FileText className="w-4 h-4 text-zinc-200 flex-shrink-0" />
                        <span className="text-xs truncate">boleto-{EXEMPLO.documento}.pdf</span>
                      </div>
                      <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-zinc-300">
                        08:00 <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Diferenciais ────────────────────────────────────────────────── */}
        <section id="recursos" aria-labelledby="titulo-recursos" className="scroll-mt-20 border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <h2 id="titulo-recursos" className="text-3xl sm:text-4xl font-black text-white tracking-tight max-w-2xl">O que faz diferença no dia a dia</h2>
            <div className="mt-12 grid md:grid-cols-3 gap-4">
              {DIFERENCIAIS.map((d, i) => {
                const Icone = ICONES_DIFERENCIAIS[i] ?? CheckCircle2;
                return (
                  <article key={d.titulo} className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 flex flex-col">
                    <Icone className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    <h3 className="mt-4 text-lg font-bold text-white">{d.titulo}</h3>
                    <p className="mt-2 text-sm text-zinc-400 leading-relaxed flex-1">{d.texto}</p>
                    <p className={`${rotulo} mt-5`}>{d.planos}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Planos ──────────────────────────────────────────────────────── */}
        <section id="planos" aria-labelledby="titulo-planos" className="scroll-mt-20 border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div className="max-w-2xl">
              <h2 id="titulo-planos" className="text-3xl sm:text-4xl font-black text-white tracking-tight">Planos e preços</h2>
              <p className="mt-4 text-zinc-400 leading-relaxed">
                Todos com {DIAS_TESTE} dias grátis, sem cartão. Sem fidelidade e sem taxa por boleto pago.
              </p>
            </div>
            <div className="mt-12 grid md:grid-cols-3 gap-4 items-stretch">
              {PLAN_LIST.map((p) => {
                const destaque = p.id === "pro";
                return (
                  <article
                    key={p.id}
                    className={`relative rounded-xl p-6 flex flex-col border ${destaque ? "border-emerald-500/50 bg-emerald-500/[0.04]" : "border-zinc-800 bg-zinc-950"}`}
                  >
                    {destaque && (
                      <span className="absolute -top-2.5 left-6 rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black">
                        Recomendado
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-white">{p.name}</h3>
                    <p className="mt-1 text-sm text-zinc-500 leading-relaxed">{p.description}</p>
                    <p className="mt-5 flex items-baseline gap-1">
                      <span className="text-4xl font-black text-white tabular-nums">R$ {p.priceBRL}</span>
                      <span className="text-sm text-zinc-500">/mês</span>
                    </p>
                    <ul className="mt-6 space-y-2.5 text-sm text-zinc-300 flex-1">
                      {p.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={abrirCadastro}
                      className={`mt-6 px-4 py-3 text-sm ${destaque ? botaoPrimario : botaoSecundario}`}
                    >
                      Testar o {p.name} grátis
                    </button>
                  </article>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-zinc-500">
              A assinatura é cobrada pelo Asaas, por boleto ou cartão. Todos os planos enviam pelo seu próprio número de WhatsApp.
            </p>
          </div>
        </section>

        {/* ── Perguntas frequentes ────────────────────────────────────────── */}
        <section id="perguntas" aria-labelledby="titulo-perguntas" className="scroll-mt-20 border-t border-zinc-900">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20">
            <h2 id="titulo-perguntas" className="text-3xl sm:text-4xl font-black text-white tracking-tight">Perguntas frequentes</h2>
            <div className="mt-10 divide-y divide-zinc-900 border-y border-zinc-900">
              {PERGUNTAS.map((q) => (
                <details key={q.pergunta} className="group py-5">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <h3 className="text-base font-semibold text-white">{q.pergunta}</h3>
                    <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{q.resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Chamada final ───────────────────────────────────────────────── */}
        <section className="border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
            <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Comece a cobrar ainda hoje</h2>
            <p className="mt-4 text-zinc-400">{DIAS_TESTE} dias grátis, sem cartão. Você conecta o WhatsApp e importa a carteira em poucos minutos.</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button type="button" onClick={abrirCadastro} className={`${botaoPrimario} px-6 py-3.5 text-base`}>
                Criar conta grátis <ArrowRight className="w-4 h-4" />
              </button>
              <button type="button" onClick={abrirEntrar} className={`${botaoSecundario} px-6 py-3.5 text-base`}>
                Já tenho conta
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ── Rodapé ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-900 text-xs text-zinc-500">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-end justify-between">
          <div className="space-y-2 max-w-sm">
            <p className="font-display font-black text-sm text-white">NC <span className="text-emerald-400">Finance</span></p>
            <p className="leading-relaxed">Software de cobrança pelo WhatsApp para pequenas e médias empresas.</p>
            <p>Contato: <a href={`mailto:${CONTATO_EMAIL}`} className="text-zinc-300 hover:text-white">{CONTATO_EMAIL}</a></p>
          </div>
          <div className="space-y-3 sm:text-right">
            <nav aria-label="Documentos" className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end">
              <button type="button" onClick={() => setShowTermos(true)} className="hover:text-white cursor-pointer">Termos de Uso</button>
              <button type="button" onClick={() => setShowPrivacidade(true)} className="hover:text-white cursor-pointer">Privacidade</button>
              <button type="button" onClick={() => setShowAcordo(true)} className="hover:text-white cursor-pointer">Tratamento de dados</button>
              <button type="button" onClick={() => setShowSuporte(true)} className="hover:text-white cursor-pointer">Suporte</button>
            </nav>
            <p>© 2026 NC Finance. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>

      {/* CTA fixo no celular, só depois do hero */}
      <div
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 p-3 bg-zinc-950/90 backdrop-blur border-t border-zinc-800 transition-all duration-300 ${
          showStickyCta && !acesso ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"
        }`}
        aria-hidden={!showStickyCta || Boolean(acesso)}
      >
        <button
          type="button"
          onClick={abrirCadastro}
          tabIndex={showStickyCta && !acesso ? 0 : -1}
          className={`${botaoPrimario} w-full px-6 py-3.5 text-sm`}
        >
          Testar {DIAS_TESTE} dias grátis <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {acesso && (
        <PainelAcesso
          modo={acesso}
          setModo={setAcesso}
          onClose={() => setAcesso(null)}
          bloqueado={documentoLegalAberto}
          onLogin={onLogin}
          onSignUp={onSignUp}
          onForgotPassword={onForgotPassword}
          isAuthLoading={isAuthLoading}
          authConfigError={authConfigError}
          abrirTermos={() => setShowTermos(true)}
          abrirPrivacidade={() => setShowPrivacidade(true)}
          abrirAcordo={() => setShowAcordo(true)}
        />
      )}

      {showTermos && <TermosDeUso onClose={() => setShowTermos(false)} />}
      {showAcordo && <AcordoTratamentoDados onClose={() => setShowAcordo(false)} />}
      {showPrivacidade && <PoliticaPrivacidade onClose={() => setShowPrivacidade(false)} />}
      {showSuporte && (
        <Suspense fallback={null}>
          <Suporte onClose={() => setShowSuporte(false)} />
        </Suspense>
      )}
    </div>
  );
}

// ─── Entrar / criar conta / recuperar senha ──────────────────────────────────

interface PainelAcessoProps {
  modo: ModoAcesso;
  setModo: (m: ModoAcesso) => void;
  onClose: () => void;
  /** Termos/privacidade abertos por cima: Esc fecha só eles. */
  bloqueado: boolean;
  onLogin: LandingPageProps["onLogin"];
  onSignUp: LandingPageProps["onSignUp"];
  onForgotPassword: LandingPageProps["onForgotPassword"];
  isAuthLoading: boolean;
  authConfigError: string;
  abrirTermos: () => void;
  abrirPrivacidade: () => void;
  abrirAcordo: () => void;
}

const campoAcesso = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors";

function PainelAcesso({
  modo, setModo, onClose, bloqueado,
  onLogin, onSignUp, onForgotPassword, isAuthLoading, authConfigError,
  abrirTermos, abrirPrivacidade, abrirAcordo,
}: PainelAcessoProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aceitou, setAceitou] = useState(false);
  const [erro, setErro] = useState("");
  const [info, setInfo] = useState("");
  const [entrou, setEntrou] = useState(false);

  // Trava a rolagem da página atrás e fecha com Esc.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = anterior; };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !bloqueado) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bloqueado, onClose]);

  const trocarModo = (m: ModoAcesso) => {
    setModo(m);
    setErro("");
    setInfo("");
  };

  const titulo = modo === "cadastro" ? "Criar conta" : modo === "senha" ? "Recuperar senha" : "Entrar";
  const subtitulo = modo === "cadastro"
    ? `${DIAS_TESTE} dias grátis, sem cartão. CPF e endereço são pedidos depois, no primeiro acesso.`
    : modo === "senha"
      ? "Digite o e-mail da sua conta e enviaremos um link para criar uma nova senha."
      : "Acesse o painel da NC Finance.";

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authConfigError) { setErro(authConfigError); return; }
    setErro("");
    setInfo("");

    if (modo === "senha") {
      if (!email.trim()) { setErro("Digite seu e-mail."); return; }
      // Mesma mensagem com ou sem conta: não revela quais e-mails existem.
      try { await onForgotPassword(email.trim()); } catch { /* idem */ }
      setInfo("Se este e-mail tiver conta, enviamos um link para redefinir a senha. Confira a caixa de entrada e o spam.");
      return;
    }

    if (!email.trim() || !senha) { setErro("Preencha e-mail e senha."); return; }
    if (modo === "cadastro") {
      if (nome.trim().length < 2) { setErro("Digite seu nome."); return; }
      if (senha.length < 6) { setErro("A senha precisa ter pelo menos 6 caracteres."); return; }
      if (!aceitou) { setErro("Para criar a conta, aceite os Termos de Uso e a Política de Privacidade."); return; }
    }

    try {
      if (modo === "cadastro") {
        const r = await onSignUp({ name: nome.trim(), email: email.trim(), password: senha });
        if (r.needsEmailConfirmation) {
          setModo("entrar");
          setSenha("");
          setInfo(r.message);
          return;
        }
      } else {
        await onLogin({ email: email.trim(), password: senha });
      }
      setEntrou(true);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      let msg = modo === "cadastro" ? "Não foi possível criar a conta. Tente de novo." : "Não foi possível entrar. Tente de novo.";
      if (/invalid login credentials/i.test(raw)) msg = "E-mail ou senha incorretos.";
      else if (/email not confirmed/i.test(raw)) msg = "Confirme seu e-mail pelo link que enviamos antes de entrar.";
      else if (/already (been )?registered/i.test(raw)) msg = "Este e-mail já tem conta. Entre ou recupere a senha.";
      else if (/password/i.test(raw)) msg = "A senha precisa ter pelo menos 6 caracteres.";
      else if (/rate limit|too many/i.test(raw)) msg = "Muitas tentativas seguidas. Aguarde alguns minutos.";
      else if (/network|fetch/i.test(raw)) msg = "Sem conexão. Verifique a internet e tente de novo.";
      setErro(msg);
    }
  };

  const textoBotao = isAuthLoading
    ? "Aguarde…"
    : modo === "cadastro" ? "Criar conta grátis" : modo === "senha" ? "Enviar link" : "Entrar";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-8 overflow-y-auto"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="acesso-titulo" className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl">
        <header className="flex items-start justify-between gap-3 px-6 py-5 border-b border-zinc-800/80">
          <div>
            <h2 id="acesso-titulo" className="text-xl font-black text-white tracking-tight">{titulo}</h2>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">{subtitulo}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1 text-zinc-500 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </header>

        <form onSubmit={(e) => void enviar(e)} className="px-6 py-5 space-y-4">
          {erro && <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{erro}</p>}
          {info && <p role="status" className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">{info}</p>}
          {entrou && <p role="status" className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">Tudo certo. Abrindo o painel…</p>}

          {modo === "cadastro" && (
            <div>
              <label htmlFor="acesso-nome" className={`${rotulo} block mb-1.5`}>Seu nome</label>
              <input id="acesso-nome" autoComplete="name" autoFocus value={nome}
                onChange={(e) => { setNome(e.target.value); setErro(""); }}
                className={campoAcesso} placeholder="Nome e sobrenome" />
            </div>
          )}

          <div>
            <label htmlFor="acesso-email" className={`${rotulo} block mb-1.5`}>E-mail</label>
            <input id="acesso-email" type="email" autoComplete="email" autoFocus={modo !== "cadastro"} value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(""); }}
              className={campoAcesso} placeholder="voce@suaempresa.com.br" />
          </div>

          {modo !== "senha" && (
            <div>
              <label htmlFor="acesso-senha" className={`${rotulo} block mb-1.5`}>Senha</label>
              <PasswordInput
                id="acesso-senha"
                autoComplete={modo === "cadastro" ? "new-password" : "current-password"}
                value={senha}
                onChange={(e) => { setSenha(e.target.value); setErro(""); }}
                className={campoAcesso}
                placeholder={modo === "cadastro" ? "Pelo menos 6 caracteres" : "Sua senha"}
              />
              {modo === "entrar" && (
                <button type="button" onClick={() => trocarModo("senha")} className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 cursor-pointer">
                  Esqueci minha senha
                </button>
              )}
            </div>
          )}

          {modo === "cadastro" && (
            <label className="flex items-start gap-2.5 text-xs text-zinc-400 leading-relaxed">
              <input type="checkbox" checked={aceitou} onChange={(e) => { setAceitou(e.target.checked); setErro(""); }}
                className="mt-0.5 w-4 h-4 accent-emerald-500 flex-shrink-0" />
              <span>
                Li e aceito os{" "}
                <button type="button" onClick={abrirTermos} className="text-emerald-400 hover:underline">Termos de Uso</button>, a{" "}
                <button type="button" onClick={abrirPrivacidade} className="text-emerald-400 hover:underline">Política de Privacidade</button> e o{" "}
                <button type="button" onClick={abrirAcordo} className="text-emerald-400 hover:underline">Acordo de Tratamento de Dados</button>.
              </span>
            </label>
          )}

          <button
            type="submit"
            disabled={isAuthLoading || entrou || Boolean(authConfigError)}
            className={`${botaoPrimario} w-full py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {textoBotao}
          </button>
        </form>

        <footer className="px-6 py-4 border-t border-zinc-800/80 text-xs text-zinc-500">
          {modo === "entrar" && (
            <>Não tem conta? <button type="button" onClick={() => trocarModo("cadastro")} className="font-semibold text-emerald-400 hover:underline cursor-pointer">Teste {DIAS_TESTE} dias grátis</button></>
          )}
          {modo === "cadastro" && (
            <>Já tem conta? <button type="button" onClick={() => trocarModo("entrar")} className="font-semibold text-emerald-400 hover:underline cursor-pointer">Entrar</button></>
          )}
          {modo === "senha" && (
            <button type="button" onClick={() => trocarModo("entrar")} className="font-semibold text-emerald-400 hover:underline cursor-pointer">Voltar para o login</button>
          )}
        </footer>
      </div>
    </div>
  );
}
