/**
 * DriveHelpPopover — ícone "?" que explica como funciona a busca de boletos no
 * Drive: como dar acesso, como nomear os arquivos e o que caracteriza o match.
 *
 * Autocontido (gerencia o próprio estado aberto/fechado). Basta colocar ao lado
 * do título "Boletos do Google Drive".
 */
import { useState } from "react";
import { HelpCircle, X } from "lucide-react";

const SERVICE_EMAIL = String(import.meta.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();

export default function DriveHelpPopover() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Como funciona / como dar acesso"
        className="text-zinc-500 hover:text-emerald-400 transition-colors"
        aria-label="Ajuda sobre boletos do Drive"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-white">Como funciona a busca de boletos no Drive</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-5 text-sm text-zinc-300">
              {/* 1. Acesso */}
              <section className="space-y-1.5">
                <h4 className="font-semibold text-emerald-400">1. Dar acesso à pasta do Drive</h4>
                <p>
                  No Google Drive, abra a pasta dos boletos → <strong>Compartilhar</strong> → adicione
                  o e-mail abaixo como <strong>Leitor</strong>:
                </p>
                <div className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-sky-300 break-all select-all">
                  {SERVICE_EMAIL || "(e-mail da conta de serviço não configurado — contate o suporte)"}
                </div>
                <p className="text-xs text-zinc-500">
                  Depois cole a URL da pasta em “Trocar pasta” e clique em buscar.
                </p>
              </section>

              {/* 2. Nome do arquivo */}
              <section className="space-y-1.5">
                <h4 className="font-semibold text-emerald-400">2. Como nomear os arquivos (essencial)</h4>
                <p>
                  O nome do PDF <strong>precisa conter o número do documento/título</strong> do devedor.
                  É isso que liga o boleto ao cliente certo.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  <li>Título <span className="font-mono text-zinc-200">3523-3</span> → <span className="font-mono text-emerald-300">BOLETO 3523-3 CLIENTE.pdf</span> ✅</li>
                  <li>Título <span className="font-mono text-zinc-200">1273/003</span> → <span className="font-mono text-emerald-300">EMPRESA_1273003_2.pdf</span> ✅</li>
                  <li>Só o nome do cliente (<span className="font-mono">KADU MOVEIS.pdf</span>) <strong>não basta</strong> — o cliente tem vários boletos ❌</li>
                </ul>
              </section>

              {/* 3. O que caracteriza o match */}
              <section className="space-y-1.5">
                <h4 className="font-semibold text-emerald-400">3. O que caracteriza a anexação</h4>
                <p>O sistema só sugere um boleto quando há <strong>prova segura</strong>:</p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-zinc-400">
                  <li><strong>Número do documento</strong> do devedor presente no nome do arquivo (ou na linha digitável), <strong>ou</strong></li>
                  <li><strong>Valor + vencimento</strong> do boleto iguais aos do título (lidos de dentro do PDF).</li>
                </ul>
                <p className="text-xs text-zinc-500">
                  Se nada disso bate, aparece “Sem boleto” — de propósito, para nunca anexar o boleto errado.
                </p>
              </section>

              {/* 4. Passo a passo */}
              <section className="space-y-1.5">
                <h4 className="font-semibold text-emerald-400">4. Passo a passo</h4>
                <ol className="list-decimal pl-5 space-y-1 text-xs text-zinc-400">
                  <li>Compartilhe a pasta com o e-mail acima e cole a URL em “Trocar pasta”.</li>
                  <li>Aguarde a indexação ler os PDFs (o contador mostra o progresso).</li>
                  <li>Clique em <strong>“Buscar boletos no Drive”</strong>.</li>
                  <li>Confira a sugestão de cada devedor e clique em <strong>“Anexar”</strong>.</li>
                </ol>
              </section>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
