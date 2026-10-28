import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { saveMyProfile, type UserProfileData } from "../services/accountService";
import { isValidCPF } from "../utils/cpf";

/**
 * Complete seu cadastro — obrigatório para contas sem CPF, telefone ou
 * endereço (criadas quando o cadastro perdia esses dados, ou antes deles
 * existirem). Aparece antes de qualquer outra tela do sistema.
 */

interface Props {
  userId: string;
  email: string;
  displayName: string;
  /** Perfil incompleto já existente: os campos vêm preenchidos. */
  perfil: UserProfileData | null;
  /** Aceite dos termos marcado no cadastro (user_metadata), para gravar no perfil. */
  termsAcceptedAt?: string | null;
  onSaved: () => void;
  onLogout: () => void;
}

const digitos = (v: string) => v.replace(/\D/g, "");

const formatCPF = (v: string) => {
  const d = digitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const formatPhone = (v: string) => {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const formatCEP = (v: string) => {
  const d = digitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

const Rotulo = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <label htmlFor={htmlFor} className="block mb-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500">{children}</label>
);

export default function CompletarCadastro({ userId, email, displayName, perfil, termsAcceptedAt, onSaved, onLogout }: Props) {
  // CPF válido já gravado não muda por aqui (é a identidade da conta).
  const cpfTravado = Boolean(perfil?.cpf && isValidCPF(perfil.cpf));

  const [nome, setNome] = useState(perfil?.full_name || (displayName !== "Conta autenticada" ? displayName : ""));
  const [cpf, setCpf] = useState(formatCPF(perfil?.cpf ?? ""));
  const [telefone, setTelefone] = useState(formatPhone(perfil?.phone ?? ""));
  const [cep, setCep] = useState(formatCEP(perfil?.cep ?? ""));
  const [endereco, setEndereco] = useState(perfil?.address ?? "");
  const [cidade, setCidade] = useState(perfil?.city ?? "");
  const [uf, setUf] = useState(perfil?.state ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const handleCep = async (raw: string) => {
    const formatado = formatCEP(raw);
    setCep(formatado);
    setErro("");
    const d = digitos(formatado);
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const data = await res.json() as { logradouro?: string; localidade?: string; uf?: string; erro?: boolean };
      if (!data.erro) {
        if (data.logradouro) setEndereco(data.logradouro);
        if (data.localidade) setCidade(data.localidade);
        if (data.uf) setUf(data.uf);
      }
    } catch { /* sem ViaCEP: preenche à mão */ }
    setBuscandoCep(false);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return setErro("Digite seu nome completo.");
    if (!isValidCPF(cpf)) return setErro("CPF inválido. Verifique o número.");
    if (digitos(telefone).length < 10) return setErro("Digite um telefone válido com DDD.");
    if (digitos(cep).length !== 8) return setErro("Digite o CEP completo.");
    if (!endereco.trim() || !cidade.trim() || !uf.trim()) return setErro("Preencha o endereço completo.");

    setSalvando(true);
    setErro("");
    try {
      await saveMyProfile(userId, {
        full_name: nome, cpf, phone: telefone, cep, address: endereco, city: cidade, state: uf,
        accepted_terms_at: termsAcceptedAt ?? undefined,
      });
      onSaved();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar seus dados.");
    } finally {
      setSalvando(false);
    }
  };

  const inputCls = "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-60";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center px-4 py-10">
      <form onSubmit={(e) => void salvar(e)} className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-xl">
        <header className="px-6 py-5 border-b border-zinc-800/80">
          <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">Último passo</p>
          <h1 className="mt-1.5 text-xl font-black text-white tracking-tight">Complete seu cadastro</h1>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Precisamos destes dados para emitir as faturas da assinatura e manter sua conta segura.
            Conta: <span className="text-zinc-300">{email}</span>
          </p>
        </header>

        <div className="px-6 py-5 space-y-4">
          <div>
            <Rotulo htmlFor="cc-nome">Nome completo</Rotulo>
            <input id="cc-nome" value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} className={inputCls} autoComplete="name" placeholder="Seu nome ou razão social" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Rotulo htmlFor="cc-cpf">CPF</Rotulo>
              <input
                id="cc-cpf" value={cpf} disabled={cpfTravado} inputMode="numeric" placeholder="000.000.000-00"
                onChange={(e) => { setCpf(formatCPF(e.target.value)); setErro(""); }} className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <Rotulo htmlFor="cc-tel">Telefone</Rotulo>
              <input
                id="cc-tel" value={telefone} inputMode="tel" autoComplete="tel" placeholder="(00) 00000-0000"
                onChange={(e) => { setTelefone(formatPhone(e.target.value)); setErro(""); }} className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Rotulo htmlFor="cc-cep">CEP {buscandoCep && <span className="normal-case tracking-normal text-emerald-400">· buscando…</span>}</Rotulo>
              <input
                id="cc-cep" value={cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
                onChange={(e) => void handleCep(e.target.value)} className={`${inputCls} font-mono`}
              />
            </div>
            <div className="sm:col-span-2">
              <Rotulo htmlFor="cc-end">Endereço</Rotulo>
              <input id="cc-end" value={endereco} onChange={(e) => { setEndereco(e.target.value); setErro(""); }} className={inputCls} autoComplete="street-address" placeholder="Rua, número" />
            </div>
          </div>

          <div className="grid gap-4 grid-cols-[1fr_88px]">
            <div>
              <Rotulo htmlFor="cc-cidade">Cidade</Rotulo>
              <input id="cc-cidade" value={cidade} onChange={(e) => { setCidade(e.target.value); setErro(""); }} className={inputCls} autoComplete="address-level2" />
            </div>
            <div>
              <Rotulo htmlFor="cc-uf">UF</Rotulo>
              <input
                id="cc-uf" value={uf} maxLength={2} autoComplete="address-level1" placeholder="SP"
                onChange={(e) => { setUf(e.target.value.toUpperCase().replace(/[^A-Z]/g, "")); setErro(""); }} className={`${inputCls} uppercase`}
              />
            </div>
          </div>

          {erro && <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{erro}</p>}
        </div>

        <footer className="px-6 py-4 border-t border-zinc-800/80 flex items-center justify-between gap-3">
          <button type="button" onClick={onLogout} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer">
            <LogOut className="w-3 h-3" /> Sair
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold disabled:opacity-50 transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            {salvando ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando…</> : "Salvar e continuar"}
          </button>
        </footer>
      </form>
    </div>
  );
}
