import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * Verificação anti-robô (Cloudflare Turnstile) do login, cadastro e
 * recuperação de senha. O token vai junto do pedido ao Supabase Auth, que o
 * confere com a chave secreta (configurada no painel do Supabase, nunca aqui).
 *
 * Sem VITE_TURNSTILE_SITE_KEY o widget não aparece e nada muda — por isso o
 * front pode ir ao ar antes de ligar o CAPTCHA no Supabase. A ordem inversa
 * trava todo login.
 *
 * A caixa fica sempre na tela: quase sempre passa sozinha ("Sucesso!"); só
 * pede um clique quando a Cloudflare desconfia. O token vale uma vez: depois
 * de cada tentativa, reset() pede outro.
 */

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let carregando: Promise<void> | null = null;

function carregarScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (carregando) return carregando;
  carregando = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { carregando = null; reject(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return carregando;
}

export interface TurnstileHandle {
  /** Descarta o token usado e pede outro. */
  reset: () => void;
}

interface TurnstileProps {
  onToken: (token: string) => void;
  onErro?: () => void;
}

export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile({ onToken, onErro }, ref) {
  const caixa = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const cbToken = useRef(onToken);
  const cbErro = useRef(onErro);
  cbToken.current = onToken;
  cbErro.current = onErro;

  useImperativeHandle(ref, () => ({
    reset: () => {
      cbToken.current("");
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    },
  }), []);

  useEffect(() => {
    let vivo = true;
    carregarScript()
      .then(() => {
        if (!vivo || !caixa.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(caixa.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          language: "pt-br",
          // Sempre visível: com "interaction-only" a caixa sumia e a pessoa
          // ficava sem saber que a verificação estava pendente.
          appearance: "always",
          "refresh-expired": "auto",
          size: "flexible",
          callback: (token: string) => cbToken.current(token),
          "expired-callback": () => cbToken.current(""),
          "error-callback": () => { cbToken.current(""); cbErro.current?.(); },
        });
      })
      .catch(() => { if (vivo) cbErro.current?.(); });
    return () => {
      vivo = false;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  return <div ref={caixa} />;
});
