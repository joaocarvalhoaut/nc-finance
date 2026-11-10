/**
 * Importar telefones — traz o WhatsApp dos clientes de uma agenda (.vcf do
 * iPhone/Android) ou de uma planilha com nome e telefone. Leitura 100% no
 * navegador (services/importarTelefones.ts); grava só o que o usuário marcar:
 * o telefone nos títulos da carteira e o contato na agenda (user_contatos).
 */

import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, Phone, RefreshCw, Upload, X } from "lucide-react";
import type { Debtor } from "../types";
import { lerArquivo } from "../services/localDocumentExtraction/leitores";
import { contactKeyFromName } from "../services/contactSync";
import {
  contatosDaTabela, cruzarComCarteira, lerVcf,
  type CruzamentoDeContatos, type LeituraDeContatos,
} from "../services/importarTelefones";

export interface AplicarTelefones {
  /** id do título → telefone (só dígitos). */
  telefones: Map<string, string>;
  /** Vão para a agenda de contatos. */
  contatos: { clientName: string; phone: string }[];
}

type Resultado = { titulos: number; falhas: number; contatos: number; erroAgenda?: boolean };

interface Props {
  debtors: Debtor[];
  onClose: () => void;
  onAplicar: (dados: AplicarTelefones) => Promise<Resultado>;
}

const ACEITA = ".vcf,.xlsx,.xls,.ods,.csv,.txt";
const fone = (d: string) => d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`;

export default function ImportarTelefones({ debtors, onClose, onAplicar }: Props) {
  const [arquivo, setArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");
  const [leitura, setLeitura] = useState<LeituraDeContatos | null>(null);
  const [cruz, setCruz] = useState<CruzamentoDeContatos | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [trocarOutros, setTrocarOutros] = useState(false);
  const [guardarFora, setGuardarFora] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const lerEscolhido = async (f: File) => {
    setArquivo(f.name);
    setErro("");
    setLeitura(null);
    setCruz(null);
    setResultado(null);
    setLendo(true);
    try {
      let lida: LeituraDeContatos | null;
      if (/\.vcf$/i.test(f.name) || /vcard/i.test(f.type)) {
        lida = lerVcf(await f.text());
      } else {
        const doc = await lerArquivo(f);
        lida = doc.tabelas.map((t) => contatosDaTabela(t.rows)).find((l) => l && l.contatos.length) ?? null;
      }
      if (!lida || lida.contatos.length === 0) {
        setErro("Não achei nome e telefone neste arquivo. Use a agenda exportada do celular (.vcf) ou uma planilha com uma coluna de nome e outra de telefone.");
        return;
      }
      const c = cruzarComCarteira(lida.contatos, debtors);
      setLeitura(lida);
      setCruz(c);
      // Marcados de saída: nome igual e que muda algo. "Parecido" o usuário confirma.
      setMarcados(new Set(c.casados.filter((m) => m.tipo === "exato" && (m.semTelefone.length || m.outroNumero.length)).map((m) => m.cliente)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendo(false);
    }
  };

  const comMudanca = useMemo(() => (cruz?.casados ?? []).filter((m) => m.semTelefone.length || m.outroNumero.length), [cruz]);
  const jaCertos = (cruz?.casados.length ?? 0) - comMudanca.length;
  const escolhidos = comMudanca.filter((m) => marcados.has(m.cliente));
  const outrosEscolhidos = escolhidos.reduce((s, m) => s + m.outroNumero.length, 0);
  const totalTitulos = escolhidos.reduce((s, m) => s + m.semTelefone.length + (trocarOutros ? m.outroNumero.length : 0), 0);
  const fora = cruz?.fora.length ?? 0;
  const podeSalvar = totalTitulos > 0 || (guardarFora && fora > 0);

  const alternar = (cliente: string) => setMarcados((prev) => {
    const s = new Set(prev);
    if (s.has(cliente)) s.delete(cliente); else s.add(cliente);
    return s;
  });

  const aplicar = async () => {
    if (!cruz) return;
    const telefones = new Map<string, string>();
    for (const m of escolhidos) {
      for (const id of m.semTelefone) telefones.set(id, m.contato.telefone);
      if (trocarOutros) for (const id of m.outroNumero) telefones.set(id, m.contato.telefone);
    }
    // Agenda: os confirmados com o nome da carteira (assim casam nas próximas
    // importações) e, se pedido, os que ainda não são clientes.
    const contatos = [
      ...escolhidos.map((m) => ({ clientName: m.cliente, phone: m.contato.telefone })),
      ...(guardarFora ? cruz.fora.map((c) => ({ clientName: c.nome, phone: c.telefone })) : []),
    ];
    setSalvando(true);
    setErro("");
    try {
      setResultado(await onAplicar({ telefones, contatos }));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const rotulo = "block text-[10px] font-mono uppercase tracking-widest text-zinc-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
      onMouseDown={(e) => e.target === e.currentTarget && !salvando && onClose()}
      onKeyDown={(e) => e.key === "Escape" && !salvando && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="importar-telefones-titulo" className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)]">
        <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800/80">
          <div>
            <h3 id="importar-telefones-titulo" className="text-sm font-bold text-white">Importar telefones</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Agenda do celular (.vcf) ou planilha com nome e telefone. O arquivo é lido no seu navegador.</p>
          </div>
          <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar" className="p-1 -mr-1 text-zinc-500 hover:text-white transition-colors cursor-pointer disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Arquivo */}
          <div className={`relative rounded-lg border border-dashed transition-colors px-4 py-4 flex items-center gap-3 ${
            arquivo && !erro ? "border-emerald-500/40 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/40"
          }`}>
            <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              {lendo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">{lendo ? "Lendo…" : arquivo || "Clique ou arraste o arquivo aqui"}</p>
              <p className="text-[11px] text-zinc-500">{arquivo ? "Clique para trocar o arquivo" : "VCF (contatos do iPhone ou Android), Excel, CSV ou TXT"}</p>
            </div>
            <input
              type="file"
              accept={ACEITA}
              disabled={lendo || salvando}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void lerEscolhido(f); }}
              aria-label="Escolher arquivo de contatos"
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          {erro && (
            <p role="alert" className="flex items-start gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> {erro}
            </p>
          )}

          {resultado && (
            <div className="text-xs bg-emerald-500/10 border border-emerald-500/30 rounded-md px-3 py-2.5 space-y-0.5">
              <p className="flex items-center gap-2 font-semibold text-emerald-200"><Check className="w-3.5 h-3.5" /> Pronto</p>
              <p className="text-zinc-300">
                {plural(resultado.titulos, "título ganhou WhatsApp", "títulos ganharam WhatsApp")}
                {resultado.contatos > 0 && ` · ${plural(resultado.contatos, "contato salvo", "contatos salvos")} na agenda`}.
              </p>
              {resultado.erroAgenda && <p className="text-amber-300">Os contatos não foram salvos na agenda. Os telefones dos títulos estão salvos.</p>}
              {resultado.falhas > 0 && <p className="text-amber-300">{plural(resultado.falhas, "título não foi salvo", "títulos não foram salvos")} — tente de novo.</p>}
            </div>
          )}

          {leitura && cruz && !resultado && (
            <>
              <p className="text-xs text-zinc-400">
                {plural(leitura.contatos.length, "contato com telefone", "contatos com telefone")}
                {" · "}<span className="text-zinc-200">{plural(cruz.casados.length, "é cliente da carteira", "são clientes da carteira")}</span>
                {jaCertos > 0 && ` · ${jaCertos} já com o número certo`}
                {leitura.semTelefoneValido > 0 && ` · ${leitura.semTelefoneValido} sem telefone válido`}
              </p>

              {comMudanca.length > 0 ? (
                <div>
                  <span className={`${rotulo} mb-1.5`}>Clientes que recebem o telefone</span>
                  <ul className="border border-zinc-800 rounded-lg divide-y divide-zinc-900 max-h-72 overflow-y-auto">
                    {comMudanca.map((m) => {
                      const ativo = marcados.has(m.cliente);
                      const nomeDiferente = contactKeyFromName(m.contato.nome) !== contactKeyFromName(m.cliente);
                      return (
                        <li key={m.cliente}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={ativo}
                            onClick={() => alternar(m.cliente)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer ${ativo ? "bg-emerald-500/10" : "hover:bg-zinc-900/60"}`}
                          >
                            <span className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${ativo ? "bg-emerald-500 border-emerald-500" : "border-zinc-600"}`}>
                              {ativo && <Check className="w-3 h-3 text-black" strokeWidth={3} />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-semibold text-white truncate">{m.cliente}</span>
                              <span className="block text-[11px] text-zinc-500 truncate">
                                {m.semTelefone.length > 0 && plural(m.semTelefone.length, "título sem WhatsApp", "títulos sem WhatsApp")}
                                {m.semTelefone.length > 0 && m.outroNumero.length > 0 && " · "}
                                {m.outroNumero.length > 0 && plural(m.outroNumero.length, "com outro número", "com outro número")}
                              </span>
                              {nomeDiferente && (
                                <span className="block text-[11px] text-amber-300 truncate">Nome parecido — no arquivo está “{m.contato.nome}”. Confira.</span>
                              )}
                            </span>
                            <span className="flex-shrink-0 text-xs font-mono text-zinc-300">{fone(m.contato.telefone)}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-md px-3 py-2.5">
                  {cruz.casados.length > 0
                    ? "Os clientes da carteira que estão no arquivo já têm esse número. Nada a preencher."
                    : "Nenhum nome do arquivo bate com um cliente da carteira. O nome precisa ser igual ao da carteira (ou o começo dele, com nome e sobrenome)."}
                </p>
              )}

              {outrosEscolhidos > 0 && (
                <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={trocarOutros} onChange={(e) => setTrocarOutros(e.target.checked)} className="mt-0.5 accent-emerald-500" />
                  <span>Trocar também onde já existe outro número ({plural(outrosEscolhidos, "título", "títulos")}). Sem marcar, esses ficam como estão.</span>
                </label>
              )}

              {fora > 0 && (
                <label className="flex items-start gap-2.5 text-xs text-zinc-300 cursor-pointer">
                  <input type="checkbox" checked={guardarFora} onChange={(e) => setGuardarFora(e.target.checked)} className="mt-0.5 accent-emerald-500" />
                  <span>
                    {fora === 1 ? "Guardar o outro contato na agenda" : `Guardar os outros ${plural(fora, "contato", "contatos")} na agenda`}
                    <span className="block text-[11px] text-zinc-500">Ficam só na sua conta e servem para preencher o WhatsApp quando esses clientes entrarem na carteira. Se a agenda é pessoal, deixe desmarcado.</span>
                  </span>
                </label>
              )}
            </>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-zinc-800/80">
          <button type="button" onClick={onClose} disabled={salvando} className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
          {!resultado && (
            <button
              type="button"
              onClick={() => void aplicar()}
              disabled={!podeSalvar || salvando || lendo}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {salvando
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando…</>
                : <><Phone className="w-4 h-4" /> {totalTitulos > 0 ? `Preencher ${plural(totalTitulos, "título", "títulos")}` : "Salvar na agenda"}</>}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
