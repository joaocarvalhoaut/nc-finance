import { AlertTriangle, ShieldCheck, X } from "lucide-react";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Aviso exibido na primeira vez que o cliente anexa um boleto.
 * Deixa explícito que o pagamento vai para o beneficiário do próprio boleto
 * (a NC Finance não recebe nem intermedia) e que anexar cobranças indevidas
 * é responsabilidade do cliente. Proteção contra uso indevido / golpes.
 */
export default function BoletoResponsibilityModal({ open, onConfirm, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-zinc-900 border border-amber-500/30 rounded-3xl shadow-2xl p-6 relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white">Antes de anexar o boleto</h3>
        </div>

        <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
          <p>
            O pagamento do boleto vai <strong className="text-white">direto para o beneficiário indicado no próprio boleto</strong> —
            quem o emitiu no banco. A NC Finance <strong className="text-white">não recebe, não intermedia e não tem controle</strong> sobre esses valores.
          </p>
          <p>
            Anexe apenas boletos <strong className="text-white">emitidos pela sua empresa</strong>, em cobranças nas quais
            você é o <strong className="text-white">credor legítimo</strong> da dívida.
          </p>
          <p className="text-xs text-amber-300/90 bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
            Enviar cobranças indevidas ou de terceiros é de sua inteira responsabilidade e pode configurar crime.
            Todas as cobranças ficam registradas e são rastreáveis.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="sm:flex-1 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="sm:flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" /> Entendi, sou o credor legítimo
          </button>
        </div>
      </div>
    </div>
  );
}
