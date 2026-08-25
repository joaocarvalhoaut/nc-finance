import { useEffect, useState } from "react";
import { Cookie, X } from "lucide-react";
import { getConsent, grantAnalyticsConsent, declineAnalyticsConsent } from "../lib/analytics";

/**
 * Consentimento de cookies/analytics (LGPD) com BLOQUEIO PRÉVIO.
 *
 * Cookies essenciais (sessão de auth) são sempre usados — são necessários para
 * o serviço. O analytics de produto (PostHog) é OPT-IN: só liga se o usuário
 * clicar em "Aceitar". Enquanto ele não escolher, nada de analytics carrega.
 * A escolha é lembrada; some o banner após decidir.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mostra o banner só se ainda não houver uma escolha registrada.
    if (getConsent() === null) setVisible(true);
  }, []);

  const acceptAll = () => {
    grantAnalyticsConsent();
    setVisible(false);
  };

  const essentialOnly = () => {
    declineAnalyticsConsent();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Preferências de cookies"
      className="fixed bottom-3 inset-x-3 sm:bottom-5 sm:left-5 sm:right-auto sm:max-w-md z-[60]
                 bg-zinc-900/95 backdrop-blur border border-zinc-800 rounded-2xl shadow-2xl p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <Cookie className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white">Sua privacidade</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mt-1">
            Usamos cookies <strong className="text-zinc-300">essenciais</strong> para manter você
            conectado com segurança. Com sua permissão, usamos também
            <strong className="text-zinc-300"> analytics de produto</strong> (anônimo e sem dados
            sensíveis) para melhorar o app. Você pode recusar sem perder nenhuma função.
            Detalhes na Política de Privacidade.
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <button
              type="button"
              onClick={acceptAll}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors cursor-pointer"
            >
              Aceitar
            </button>
            <button
              type="button"
              onClick={essentialOnly}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              Só essenciais
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={essentialOnly}
          aria-label="Fechar (mantém apenas essenciais)"
          className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
