/**
 * AvisoBloqueioNumero — risco de o WhatsApp restringir o número num disparo grande.
 *
 * As cobranças saem do número do próprio cliente (Z-API / WhatsApp comum): pico
 * de volume, número novo e envio para quem nunca falou com ele são o que mais
 * leva a bloqueio. Usado no envio em lote (Carteira e Cobranças).
 *
 * Com a situação do dia (aquecimento + limite diário — _shared/protecaoNumero.ts),
 * mostra quantas ainda podem sair hoje: o servidor segura o que passar disso.
 */

import { AlertTriangle } from "lucide-react";
import { motivoDoLimite, type SituacaoDoDia } from "../../supabase/functions/_shared/protecaoNumero.ts";

/** Acima disso o aviso pede, com ênfase, para dividir o envio. */
const LOTE_GRANDE = 50;

export default function AvisoBloqueioNumero({ mensagens, compacto = false, situacao = null }: {
  mensagens: number;
  compacto?: boolean;
  situacao?: SituacaoDoDia | null;
}) {
  const restante = situacao?.restante ?? null;
  const cortado = restante !== null && mensagens > restante;
  const saem = cortado ? restante : mensagens;
  const grande = saem > LOTE_GRANDE;
  return (
    <div className={`flex gap-3 rounded-lg border px-3.5 py-3 ${grande || cortado ? "border-amber-500/40 bg-amber-500/10" : "border-amber-500/25 bg-amber-500/[0.06]"}`} role="note">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
      <div className={`space-y-1 leading-relaxed ${compacto ? "text-[11px]" : "text-[12px]"}`}>
        <p className="font-semibold text-amber-200">
          {saem === 0
            ? "Nenhuma mensagem sai hoje: o limite do dia acabou"
            : <>{saem === 1 ? "Vai sair 1 mensagem" : `Vão sair ${saem} mensagens`} do seu WhatsApp agora</>}
        </p>
        {situacao && situacao.limite !== null && (
          <p className={cortado ? "text-amber-200" : "text-zinc-300"}>
            Hoje: {situacao.enviadasHoje} de {situacao.limite} mensagens ({motivoDoLimite(situacao)}).
            {cortado && ` As outras ${mensagens - saem} ficam para amanhã.`}
          </p>
        )}
        <p className="text-zinc-300">
          Muitas mensagens de uma vez — principalmente de um número novo ou para quem nunca conversou com
          ele — podem levar o WhatsApp a restringir o número por 24 a 48 h, ou a bloqueá-lo de vez.
        </p>
        <p className={grande ? "text-amber-200" : "text-zinc-400"}>
          {grande && <span className="font-semibold">Lote grande: divida em partes ao longo do dia. </span>}
          Se as mensagens pararem de chegar, pare os envios por 24 a 48 h.
        </p>
      </div>
    </div>
  );
}
