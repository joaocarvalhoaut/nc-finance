import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  CheckCircle2, 
  Sparkles, 
  MessageSquare, 
  ShieldCheck, 
  Clock, 
  ArrowRight, 
  FileSpreadsheet, 
  HardDrive, 
  Terminal,
  FileCheck,
  Smartphone,
  Check,
  Send,
  Zap
} from "lucide-react";
import type { AuthCredentials, SignUpPayload } from "../types";

interface LandingPageProps {
  onLogin: (credentials: AuthCredentials) => Promise<void>;
  onSignUp: (payload: SignUpPayload) => Promise<{ needsEmailConfirmation: boolean; message: string }>;
  isAuthLoading: boolean;
  authConfigError?: string;
}

export default function LandingPage({
  onLogin,
  onSignUp,
  isAuthLoading,
  authConfigError = ""
}: LandingPageProps) {
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [isAuthSuccess, setIsAuthSuccess] = useState(false);

  // Live Phone billing demo simulation state
  const [demoPhoneName, setDemoPhoneName] = useState("Carlos Eduardo");
  const [demoValue, setDemoValue] = useState("1.849,90");
  const [demoTone, setDemoTone] = useState<"amigavel" | "neutro" | "firme" | "juridico">("amigavel");
  const [activeTab, setActiveTab] = useState<"features" | "pricing" | "simulation" | "about">("features");

  // Get message output for simulation
  const getDemoMessage = () => {
    switch (demoTone) {
      case "amigavel":
        return `Olá, ${demoPhoneName}, tudo bem? 😊 Passando para lembrar de forma tranquila sobre o boleto da NC Finance no valor de R$ ${demoValue} com vencimento próximo. Se precisar, posso reenviar os dados para facilitar! Abraços.`;
      case "neutro":
        return `Olá, ${demoPhoneName}. Segue o acompanhamento do título com vencimento programado. Valor de R$ ${demoValue}. Solicitamos a confirmação ou envio do comprovante correspondente. Atenciosamente, Setor de Cobrança.`;
      case "firme":
        return `Atenção, ${demoPhoneName}. Consta em aberto o título correspondente no valor de R$ ${demoValue}. Solicitamos regularização imediata hoje para evitar restrições cadastrais. Responda com a previsão de pagamento.`;
      case "juridico":
        return `Prezado(a) ${demoPhoneName}, notificamos para fins de registro administrativo a pendência descrita no valor de R$ ${demoValue}. Na ausência de posicionamento voluntário, o caso seguirá ao rito de cobrança administrativa extrajudicial.`;
    }
  };

  const handleAuthentication = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    if (isRegisterMode && !authName) {
      setAuthError("Por favor, digite seu nome completo para cadastro.");
      return;
    }

    setAuthError("");
    setIsAuthSuccess(true);
    setTimeout(() => {
      void 0;
    }, 1200);
  };

  const handleAuthenticationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authConfigError) {
      setAuthError(authConfigError);
      return;
    }
    if (!authEmail || !authPassword) {
      setAuthError("Por favor, preencha todos os campos obrigatorios.");
      return;
    }
    if (isRegisterMode && !authName) {
      setAuthError("Por favor, digite seu nome completo para cadastro.");
      return;
    }

    setAuthError("");
    setAuthInfo("");

    try {
      if (isRegisterMode) {
        const result = await onSignUp({
          name: authName,
          email: authEmail,
          password: authPassword
        });

        if (result.needsEmailConfirmation) {
          setIsAuthSuccess(false);
          setAuthInfo(result.message);
          setIsRegisterMode(false);
          return;
        }
      } else {
        await onLogin({
          email: authEmail,
          password: authPassword
        });
      }

      setIsAuthSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nao foi possivel autenticar agora.";
      setIsAuthSuccess(false);
      setAuthError(message);
    }
  };

  const handleDemoPreset = (name: string, val: string) => {
    setDemoPhoneName(name);
    setDemoValue(val);
  };

  return (
    <div className="bg-black text-zinc-100 min-h-screen font-sansselection:bg-emerald-500 selection:text-black">
      {/* Dynamic Grid Overlay Background element */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.08),transparent_50%)] pointer-events-none" />
      <div className="absolute top-[30%] left-[-10%] w-[500px] h-[500px] bg-[radial-gradient(circle,rgba(16,185,129,0.03),transparent_70%)] pointer-events-none" />

      {/* Landing Header */}
      <header className="border-b border-zinc-900/80 backdrop-blur-md bg-black/60 sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center">
            <span className="font-display font-extrabold text-xl sm:text-2xl tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 via-white to-emerald-400 uppercase select-none drop-shadow-[0_0_10px_rgba(52,211,153,0.15)]">
              NC Finance
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-4 relative py-1">
            <button 
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("features");
                document.getElementById("recursos")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`relative px-3 py-1.5 text-xs font-semibold select-none transition-all cursor-pointer ${activeTab === "features" ? "text-emerald-400 font-bold" : "text-zinc-400 hover:text-white"}`}
            >
              {activeTab === "features" && (
                <motion.div 
                  layoutId="activeLandingTabLine" 
                  className="absolute bottom-0 left-1 right-1 h-0.5 bg-emerald-400" 
                  transition={{ type: "spring", stiffness: 220, damping: 25 }}
                />
              )}
              Recursos
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("pricing");
                document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`relative px-3 py-1.5 text-xs font-semibold select-none transition-all cursor-pointer ${activeTab === "pricing" ? "text-emerald-400 font-bold" : "text-zinc-400 hover:text-white"}`}
            >
              {activeTab === "pricing" && (
                <motion.div 
                  layoutId="activeLandingTabLine" 
                  className="absolute bottom-0 left-1 right-1 h-0.5 bg-emerald-400" 
                  transition={{ type: "spring", stiffness: 220, damping: 25 }}
                />
              )}
              Planos & Preços
            </button>
            <button 
              onClick={(e) => {
                e.preventDefault();
                setActiveTab("simulation");
                document.getElementById("demo-celular")?.scrollIntoView({ behavior: "smooth" });
              }}
              className={`relative px-3 py-1.5 text-xs font-semibold select-none transition-all cursor-pointer ${activeTab === "simulation" ? "text-emerald-400 font-bold" : "text-zinc-400 hover:text-white"}`}
            >
              {activeTab === "simulation" && (
                <motion.div 
                  layoutId="activeLandingTabLine" 
                  className="absolute bottom-0 left-1 right-1 h-0.5 bg-emerald-400" 
                  transition={{ type: "spring", stiffness: 220, damping: 25 }}
                />
              )}
              Simulação
            </button>
          </nav>

          <div className="flex items-center gap-3">
            <a 
              href="#auth-panel" 
              className="text-xs sm:text-sm font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 px-4 py-2 rounded-xl bg-emerald-500/5 hover:bg-emerald-500/10 transition-all hover:border-emerald-500/40"
            >
              Entrar ou Cadastrar
            </a>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative pt-12 pb-20 sm:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            
            {/* Left Column: CTA Pitch */}
            <div className="lg:col-span-7 flex flex-col space-y-6 text-center lg:text-left">
              <div className="inline-flex self-center lg:self-start items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Inteligência de Cobrança Autônoma
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight">
                Reduza a inadimplência <br />
                com cobranças via <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-emerald-200 drop-shadow-[0_2px_10px_rgba(52,211,153,0.15)]">WhatsApp</span>
              </h1>

              <p className="text-zinc-400 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed font-light">
                Importe relatórios de clientes em atraso ou faturas pendentes. 
                Nossa Inteligência Artificial extrai e organiza as parcelas, calcula juros e multas atualizados, e dispara notificações nos tons ideais de abordagem.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start pt-4">
                <a
                  href="#auth-panel"
                  className="px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold flex items-center justify-center gap-2 cursor-pointer shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all text-sm sm:text-base"
                >
                  Experimentar NC Finance <ArrowRight className="w-4 h-4" />
                </a>
                <a
                  href="#demo-celular"
                  className="px-6 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium flex items-center justify-center gap-2 transition-all text-sm sm:text-base"
                >
                  Assistir Simulação
                </a>
              </div>

              {/* Dynamic Metrics */}
              <div className="grid grid-cols-3 gap-4 sm:gap-6 pt-8 border-t border-zinc-900 max-w-lg mx-auto lg:mx-0">
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">82%</div>
                  <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mt-1">Taxa de Abertura</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">3.5x</div>
                  <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mt-1">Mais Rápido</div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-white">-45%</div>
                  <div className="text-[10px] sm:text-xs text-zinc-500 uppercase tracking-widest font-mono mt-1">Inadimplência</div>
                </div>
              </div>
            </div>

            {/* Right Column: AI Visual Representation / Generated Mockup */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="relative w-full max-w-md group">
                {/* Glow ring behind phone */}
                <div className="absolute -inset-1.5 bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-2xl blur opacity-25 group-hover:opacity-35 transition duration-1000"></div>
                
                <div className="relative bg-zinc-950/80 border border-zinc-800 p-3 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="bg-black rounded-xl p-2.5 border border-zinc-900 flex flex-col items-center">
                    <div className="w-full h-4 relative flex justify-between px-2 text-[10px] text-zinc-500 font-mono">
                      <span>14:02 UTC</span>
                      <div className="w-16 h-3.5 bg-zinc-900 rounded-full absolute left-1/2 -translate-x-1/2 -top-1 border-x border-b border-zinc-800" />
                      <span>5G 📶</span>
                    </div>

                    {/* Image showcase */}
                    <div className="w-full overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950 mt-1 relative flex justify-center">
                      <img
                        src="/src/assets/images/whatsapp_billing_mockup_1779296528244.png"
                        alt="WhatsApp Billing Mockup"
                        className="w-full object-cover rounded-lg aspect-square"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute bottom-4 left-4 right-4 bg-zinc-950/90 border border-emerald-500/30 backdrop-blur-md p-3 rounded-xl shadow-xl flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                          <span className="text-xs text-zinc-200">Z-API Disparador Conectado</span>
                        </div>
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">LIVE</span>
                      </div>
                    </div>

                    <div className="p-3 text-center w-full">
                      <p className="text-xs text-zinc-400 italic">
                        "Visualização em tempo real das cobranças enviadas por WhatsApp com arquivos de suporte acoplados"
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* CORE FEATURES bento style */}
      <motion.section 
        id="recursos" 
        className="py-20 border-t border-zinc-900/60 bg-zinc-950/30 overflow-hidden"
        initial={{ x: -120, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: false, amount: 0.15 }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-emerald-400 font-mono text-sm uppercase tracking-widest font-semibold">Tudo o que você precisa</h2>
            <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Desenvolvido para times financeiros ágeis</h3>
            <p className="text-zinc-400 font-light">
              Esqueça tabelas bagunçadas e o envio manual e tenso de cobranças indesejadas pelo celular pessoal. Com a NC Finance, o processo é estruturado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Box 1: File Extractor */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <FileCheck className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Importação Inteligente (IA)</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Envie relatórios bagunçados, PDFs, txt, boletos brutos ou extratos. Nossa engenharia extrai o nome do cliente, fornecedor, documento, vencimento e valores instantaneamente sem cadastro prévio manual.
              </p>
            </div>

            {/* Box 2: Calculating Engine */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <Terminal className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Atualização de Juros e Multas</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Configure globalmente na visão geral a multa padrão (%) e os juros adicionais acumulados por dia de atraso. O sistema atualiza os valores reais pendentes de cada devedor em tempo real.
              </p>
            </div>

            {/* Box 3: WhatsApp Dispatchers */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Escala de 4 Tons de Abordagem</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Varie a abordagem baseado em nível de relacionamento: Amigável (preventivo), Neutro (institucional), Firme (prioritário) ou Jurídico (registro administrativo/extrajudicial), evitando atritos na comunicação.
              </p>
            </div>

            {/* Box 4: Google Workspace */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Conexão com Sheets e Drive</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Suba parcelas integrando diretamente com Google Sheets. Vincule faturas e PDF de boletos guardados em pastas do Google Drive para que sejam enviados acoplados à cobrança do WhatsApp de forma limpa.
              </p>
            </div>

            {/* Box 5: Auto-schedulers */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Agendamento de Disparos</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Defina o fuso e horário padrão das cobranças automáticas. O sistema analisa quem possui pendências ativas nos prazos determinados e envia no momento programado sem atraso operacional.
              </p>
            </div>

            {/* Box 6: Z-API Integration */}
            <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-6 hover:border-emerald-500/20 transition-all flex flex-col gap-4">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-fit rounded-xl">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h4 className="text-lg font-bold text-white">Conexão com Z-API Oficial</h4>
              <p className="text-zinc-400 text-sm font-light leading-relaxed">
                Insira sua chave de API e Instance ID do serviço Z-API. Integre seu próprio número de WhatsApp secundário ou corporativo para obter 100% de autonomia e visibilidade de respostas dos clientes.
              </p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* DYNAMIC INTERACTIVE WHATSAPP DEMO SECTION */}
      <motion.section 
        id="demo-celular" 
        className="py-20 bg-black overflow-hidden"
        initial={{ x: 120, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: false, amount: 0.15 }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            {/* Left: Settings Panel */}
            <div className="space-y-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-zinc-900/80 border border-zinc-800 text-emerald-400 text-xs font-semibold leading-none uppercase tracking-wide">
                Simulador Interativo
              </div>
              <h3 className="text-3xl sm:text-4xl font-black text-white">Visualize como o seu cliente irá receber</h3>
              <p className="text-zinc-400 font-light leading-relaxed">
                Escolha o tom desejado e veja como a mensagem dinâmica se adapta com as variáveis do banco de dados dNC Finance (Representante, Boleto, Vencimento, CPF, Cliente).
              </p>

              {/* Interaction controllers */}
              <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Preset do Devedor:</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleDemoPreset("Carlos Eduardo", "1.849,90")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${demoPhoneName === "Carlos Eduardo" ? "bg-emerald-500 text-black shadow-md" : "bg-zinc-850 hover:bg-zinc-800 text-zinc-300"}`}
                  >
                    Carlos (Vencido há 5 dias - R$ 1.849,90)
                  </button>
                  <button 
                    onClick={() => handleDemoPreset("Mariana Silva", "425,00")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${demoPhoneName === "Mariana Silva" ? "bg-emerald-500 text-black shadow-md" : "bg-zinc-850 hover:bg-zinc-800 text-zinc-300"}`}
                  >
                    Mariana (A vencer amanhã - R$ 425,00)
                  </button>
                  <button 
                    onClick={() => handleDemoPreset("Empresa Souza S/A", "14.220,00")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${demoPhoneName === "Empresa Souza S/A" ? "bg-emerald-500 text-black shadow-md" : "bg-zinc-850 hover:bg-zinc-800 text-zinc-300"}`}
                  >
                    Souza S/A (R$ 14.220,00)
                  </button>
                </div>

                <div className="pt-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 block mb-2">Selecione o Tom de Cobrança:</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(["amigavel", "neutro", "firme", "juridico"] as const).map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setDemoTone(tone)}
                        className={`py-2 rounded-lg text-xs capitalize font-bold transition-all cursor-pointer border ${demoTone === tone ? "bg-emerald-500/15 text-emerald-400 border-emerald-500" : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white"}`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Phone Frame Simulator */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm bg-zinc-950 border-[5px] border-zinc-900 rounded-[3rem] p-3 shadow-2xl relative overflow-hidden aspect-[9/18]">
                {/* Camera punch */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-10 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-900" />
                </div>

                {/* Simulated Screen */}
                <div className="bg-zinc-900 h-full rounded-[2.6rem] overflow-hidden flex flex-col justify-between">
                  {/* Whatsapp Header */}
                  <div className="bg-[#075e54] p-3 pt-7 text-white flex items-center justify-between shadow">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-700 font-bold flex items-center justify-center text-xs">
                        NC
                      </div>
                      <div>
                        <h5 className="font-bold text-xs">Acompanhamento NC Finance</h5>
                        <p className="text-[10px] text-emerald-200">Online & Automatizado</p>
                      </div>
                    </div>
                    <span className="text-xs text-emerald-100">🔌 Conectado</span>
                  </div>

                  {/* Bubble Space */}
                  <div className="flex-1 p-3 flex flex-col justify-end space-y-3 bg-[#e5ddd5] overflow-y-auto">
                    {/* Incoming customer response balloon */}
                    <div className="self-start max-w-[85%] bg-white text-zinc-800 p-2.5 rounded-lg rounded-tl-none shadow-sm text-xs">
                      Bom dia, qual o status da minha fatura de boleto em aberto? Consigo o link do boleto?
                    </div>

                    {/* Automatic Reply Balloon */}
                    <div className="self-end max-w-[85%] bg-[#dcf8c6] text-zinc-800 p-2.5 rounded-lg rounded-tr-none shadow-sm text-xs flex flex-col gap-1.5 border border-emerald-900/10">
                      <p className="whitespace-pre-wrap">{getDemoMessage()}</p>
                      <div className="p-1.5 rounded bg-black/5 border border-black/10 flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-[10px] text-zinc-700 underline font-semibold">Boleto_NC_Pendencias.pdf (PDF)</span>
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[9px] text-zinc-500 font-mono mt-0.5">
                        <span>14:03</span>
                        <Check className="w-3 h-3 text-blue-500" />
                      </div>
                    </div>
                  </div>

                  {/* Input line simulating keyboard */}
                  <div className="p-2 bg-zinc-950 flex items-center gap-2">
                    <div className="flex-1 bg-zinc-900 rounded-full px-3 py-1.5 text-xs text-zinc-500 flex items-center italic">
                      Conversa de Cobrança Iniciada...
                    </div>
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-black flex items-center justify-center select-none shadow">
                      <Send className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      </motion.section>

      {/* PLANS MATRIX */}
      <motion.section 
        id="planos" 
        className="py-20 border-t border-zinc-900/60 bg-gradient-to-b from-zinc-950/20 to-black overflow-hidden"
        initial={{ y: 120, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: false, amount: 0.12 }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
            <h2 className="text-emerald-400 font-mono text-sm uppercase tracking-widest font-semibold">Valores Simplificados</h2>
            <h3 className="text-3xl sm:text-4xl font-black text-white tracking-tight">O plano ideal para sua escala operacional</h3>
            <p className="text-zinc-400 font-light text-sm sm:text-base">
              Aborde devedores sem intermediários caros ou tarifas abusivas por boleto quitado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Plano 1: Lite */}
            <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-2xl relative flex flex-col justify-between hover:border-zinc-800 transition-all">
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-zinc-300">Plano Lite</h4>
                  <p className="text-xs text-zinc-500 mt-1">Para pequenas carteiras de faturamento</p>
                </div>
                <div className="flex items-baseline gap-1 text-white">
                  <span className="text-3xl sm:text-4xl font-black">R$ 97</span>
                  <span className="text-zinc-500 text-sm font-light">/mês</span>
                </div>
                <hr className="border-zinc-900" />
                <ul className="space-y-3.5 text-sm text-zinc-400 font-light">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Importação de até 150 devedores/mês
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> 3 canais de arquivos (Vencidos, A vencer, Pagar)
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Cobrança Manual de 4 tons via WhatsApp
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-600 line-through">
                    <CheckCircle2 className="w-4 h-4 text-zinc-800 flex-shrink-0" /> Extração Inteligente com IA Gemini
                  </li>
                  <li className="flex items-center gap-2.5 text-zinc-600 line-through">
                    <CheckCircle2 className="w-4 h-4 text-zinc-800 flex-shrink-0" /> Anexos automáticos do Google Drive
                  </li>
                </ul>
              </div>
              <a href="#auth-panel" className="mt-8 px-4 py-2.5 rounded-xl border border-zinc-800 text-zinc-300 font-medium hover:bg-zinc-900 transition-all text-center block text-sm">
                Começar no Lite
              </a>
            </div>

            {/* Plano 2: Pro */}
            <div className="bg-zinc-950 border-2 border-emerald-500 p-8 rounded-2xl relative flex flex-col justify-between shadow-[0_0_20px_rgba(16,185,129,0.15)] transform md:-translate-y-2">
              <div className="absolute top-0 right-6 -translate-y-1/2 bg-emerald-500 text-black px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest shadow">
                Recomendado
              </div>
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-emerald-400 flex items-center gap-1.5">
                    Plano Pró <Sparkles className="w-4 h-4" />
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1">Robô autônomo com inteligência artificial</p>
                </div>
                <div className="flex items-baseline gap-1 text-white">
                  <span className="text-3xl sm:text-5xl font-black text-emerald-300 font-mono">R$ 197</span>
                  <span className="text-zinc-500 text-sm font-light">/mês</span>
                </div>
                <hr className="border-emerald-500/20" />
                <ul className="space-y-3.5 text-sm text-zinc-300 font-light">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Importação de devedores ilimitados/mês
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Extração Inteligente Automática com IA Gemini
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Disparadores agendados automatizados
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Integração Planilhas Sheets & Drive Matching
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Suporte VIP NC & Multi-representantes
                  </li>
                </ul>
              </div>
              <a href="#auth-panel" className="mt-8 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-[0_4px_15px_rgba(16,185,129,0.3)] transition-all text-center block text-sm">
                Garantir Licença Pro
              </a>
            </div>

            {/* Plano 3: Enterprise */}
            <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-2xl relative flex flex-col justify-between hover:border-zinc-800 transition-all">
              <div className="space-y-6">
                <div>
                  <h4 className="text-lg font-bold text-zinc-300">Plano Corporate</h4>
                  <p className="text-xs text-zinc-500 mt-1">Integração ERP robusta para grandes volumes</p>
                </div>
                <div className="flex items-baseline gap-1 text-white">
                  <span className="text-3xl sm:text-4xl font-black">R$ 497</span>
                  <span className="text-zinc-500 text-sm font-light">/mês</span>
                </div>
                <hr className="border-zinc-900" />
                <ul className="space-y-3.5 text-sm text-zinc-400 font-light">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Tudo do Plano Pró acoplado
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Múltiplas instâncias simultâneas Z-API
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> API aberta para integração direta com ERPs
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Gerente de conta exclusivo NC Finance
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Infraestrutura em nuvem dedicada
                  </li>
                </ul>
              </div>
              <a href="#auth-panel" className="mt-8 px-4 py-2.5 rounded-xl border border-emerald-500/20 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all text-center block text-sm">
                Falar com Consultores
              </a>
            </div>
          </div>
        </div>
      </motion.section>

      {/* AUTHENTICATION CONTROL CORE PANEL */}
      <section id="auth-panel" className="py-20 border-t border-zinc-900/60 bg-zinc-950/40">
        <div className="max-w-md mx-auto px-4">
          <div className="bg-zinc-950 border border-zinc-900 p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-300" />
            
            <div className="text-center mb-8">
              <h3 className="text-2xl font-black text-white">
                {isRegisterMode ? "Crie sua Conta" : "Controle seu Faturamento"}
              </h3>
              <p className="text-zinc-400 text-xs font-light mt-1">
                {isRegisterMode ? "Preencha seus dados para obter acesso imediato" : "Acesse o painel do cliente NC Finance"}
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl text-center">
                {authError}
              </div>
            )}

            {authInfo && (
              <div className="mb-4 p-3 bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs rounded-xl text-center">
                {authInfo}
              </div>
            )}

            {isAuthSuccess && (
              <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl text-center font-bold">
                ✓ Autenticacao validada. Redirecionando para o painel...
              </div>
            )}

            <form onSubmit={handleAuthenticationSubmit} className="space-y-4">
              {isRegisterMode && (
                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={(e) => {
                      setAuthName(e.target.value);
                      setAuthError("");
                    }}
                    className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-light"
                    placeholder="NC Empreendimentos"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">E-mail Corporativo</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => {
                    setAuthEmail(e.target.value);
                    setAuthError("");
                  }}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-light"
                  placeholder="admin@ncfinance.com.br"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Senha de Acesso</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => {
                    setAuthPassword(e.target.value);
                    setAuthError("");
                  }}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500 transition-all font-light font-mono"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={isAuthLoading || isAuthSuccess || Boolean(authConfigError)}
                className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:-translate-y-0.5 transition-all text-sm mt-2 cursor-pointer"
              >
                {isAuthLoading
                  ? "Validando acesso..."
                  : isRegisterMode
                    ? "Registrar e Entrar"
                    : "Validar Acesso e Conectar"}
              </button>
            </form>

            <div className="mt-8 flex items-center justify-between text-xs text-zinc-500 border-t border-zinc-900 pt-5">
              <span>Demo rápida disponível sem restrições.</span>
              <button 
                type="button"
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setAuthError("");
                  setAuthInfo("");
                }}
                className="text-emerald-400 font-bold hover:underline"
              >
                {isRegisterMode ? "Já possuo conta (Entrar)" : "Criar uma conta grátis"}
              </button>
            </div>

            {/* Helper button for filling the form without bypassing auth */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  setAuthEmail("contato@ncfinance.co");
                  setAuthPassword("ncfinance123");
                  setAuthName("Diretor NC");
                  setAuthError("");
                  setAuthInfo("");
                }}
                className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl font-bold transition-all text-center"
              >
                Preencher campos de exemplo
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900/80 bg-black/90 py-12 text-zinc-500 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 border-b border-zinc-900/60 pb-8">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center text-black font-extrabold text-[9px]">
                NC
              </div>
              <span className="font-bold text-sm text-zinc-300">NC Finance Ltda.</span>
            </div>
            <p className="max-w-md text-center sm:text-right text-[11px] leading-relaxed">
              NC Finance é uma plataforma tecnológica de faturamento automatizado e cobranças. A infraestrutura de envio via aplicativo de WhatsApp depende de APIs acessórias contratadas externamente.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between pt-8 gap-4 text-[10px]">
            <span>© 2026 NC Finance S/A. Todos os direitos reservados. CNPJ 12.345.678/0001-99</span>
            <div className="flex gap-4">
              <span className="hover:text-emerald-400 cursor-pointer">Termos de Uso</span>
              <span className="hover:text-emerald-400 cursor-pointer">Segurança de Dados</span>
              <span className="hover:text-emerald-400 cursor-pointer font-mono">v1.1.0-Release</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

