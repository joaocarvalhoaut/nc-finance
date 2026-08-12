import { useState } from "react";
import { AlertTriangle, X, Loader2 } from "lucide-react";
import { deleteMyAccount } from "../services/accountService";

interface Props {
  onClose: () => void;
  /** Chamado após exclusão bem-sucedida (ex.: signOut + redirect). */
  onDeleted: () => void;
}

const CONFIRM_WORD = "EXCLUIR";

/**
 * Exclusão de conta (LGPD). Ação irreversível — exige digitar a palavra de
 * confirmação para habilitar o botão, evitando clique acidental.
 */
export default function DeleteAccountModal({ onClose, onDeleted }: Props) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD && !loading;

  const handleDelete = async () => {
    if (!canDelete) return;
    setLoading(true);
    setError("");
    try {
      await deleteMyAccount();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir a conta. Tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}
    >
      <div className="bg-zinc-950 border border-rose-500/30 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" /> Excluir minha conta
          </h2>
          {!loading && (
            <button onClick={onClose} aria-label="Fechar" className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Esta ação é <strong className="text-rose-400">permanente e irreversível</strong>. Serão apagados:
          </p>
          <ul className="text-sm text-zinc-400 list-disc pl-5 space-y-1">
            <li>Todos os devedores, cobranças e histórico</li>
            <li>Automações, contatos e configurações</li>
            <li>Boletos armazenados e sua conta de acesso</li>
          </ul>
          <p className="text-xs text-zinc-500">
            Os backups automáticos do provedor expiram por retenção e não podem ser apagados seletivamente,
            conforme descrito na Política de Privacidade.
          </p>

          <div>
            <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
              Digite <span className="text-rose-400 font-mono">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setError(""); }}
              disabled={loading}
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-rose-500 transition-all font-mono"
              placeholder={CONFIRM_WORD}
            />
          </div>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-3 rounded-xl border border-zinc-700 text-zinc-300 text-sm font-semibold hover:bg-zinc-900 transition-colors disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canDelete ? "bg-rose-600 hover:bg-rose-500 text-white cursor-pointer" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              }`}
            >
              {loading ? (<><Loader2 className="w-4 h-4 animate-spin" /> Excluindo…</>) : "Excluir tudo"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
