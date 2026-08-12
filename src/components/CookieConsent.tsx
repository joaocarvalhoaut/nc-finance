import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";

const STORAGE_KEY = "ncf-cookie-consent-v1";

/**
 * Aviso de cookies (LGPD). Informativo — o app usa apenas cookies/armazenamento
 * ESSENCIAIS (sessão de autenticação); não há rastreamento de terceiros. Por
 * isso não bloqueia scripts (não há o que bloquear). Se um dia forem adicionados
 * analytics/marketing, este banner deve virar consentimento com bloqueio prévio.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, at: new Date().toISOString() }));
    } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-3 inset-x-3 sm:bottom-5 sm:left-5 sm:right-auto sm:max-w-md z-[60]
                 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-2xl shadow-2xl p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Cookie className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white">Cookies essenciais</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mt-1">
            Usamos apenas cookies e armazenamento local <strong className="text-zinc-300">essenciais</strong> para
            manter você conectado com segurança. Não usamos rastreamento de terceiros nem publicidade.
            Saiba mais na nossa Política de Privacidade.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={accept}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors cursor-pointer"
            >
              Entendi
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={accept}
          aria-label="Fechar aviso"
          className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
