import { Clock, MessageCircle, Smartphone, X } from "lucide-react";
import { CONTATO_WHATSAPP, CONTATO_WHATSAPP_LINK, CONTATO_WHATSAPP_NUMERO } from "../content/landing";
import { abrirWhatsapp } from "../utils/abrirWhatsapp";

interface Props {
  onClose: () => void;
  onAbrirConfiguracoes: () => void;
}

/**
 * Aviso do primeiro uso: a conta ainda não tem número de WhatsApp conectado.
 * Enquanto a criação automática da instância (programa Partner da Z-API) não
 * está ligada, quem conecta é o suporte — o cliente chama no WhatsApp.
 *
 * A mensagem pronta do link é genérica de propósito: nada da conta vai na URL.
 */
const MENSAGEM_PRONTA = "Olá! Acabei de criar minha conta na NC Finance e quero conectar meu número de WhatsApp.";

export default function AvisoConectarNumero({ onClose, onAbrirConfiguracoes }: Props) {
  const link = `${CONTATO_WHATSAPP_LINK}?text=${encodeURIComponent(MENSAGEM_PRONTA)}`;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aviso-conectar-titulo"
    >
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-3 top-3 p-1 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="px-6 pt-6 pb-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-4.5 h-4.5 text-emerald-400" />
            </div>
            <h3 id="aviso-conectar-titulo" className="text-base font-bold text-white">
              Conecte o seu número de WhatsApp
            </h3>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed">
            As cobranças saem do <strong className="text-white">seu próprio número</strong>. Para ligar ele à
            sua conta, mande uma mensagem para o nosso suporte no WhatsApp:
          </p>

          <p className="font-mono text-lg text-white tracking-tight">{CONTATO_WHATSAPP}</p>

          <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 flex gap-2 leading-relaxed">
            <Clock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              A conexão do seu número pode levar <strong>até 24 horas</strong>. Enquanto isso, já dá para importar a
              carteira e deixar tudo pronto.
            </span>
          </p>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 px-6 py-4 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={onAbrirConfiguracoes}
            className="sm:flex-1 px-4 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-sm font-semibold transition-colors cursor-pointer"
          >
            Ver em Configurações
          </button>
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { abrirWhatsapp(e, CONTATO_WHATSAPP_NUMERO, MENSAGEM_PRONTA); onClose(); }}
            className="sm:flex-1 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" /> Chamar o suporte
          </a>
        </div>
      </div>
    </div>
  );
}
