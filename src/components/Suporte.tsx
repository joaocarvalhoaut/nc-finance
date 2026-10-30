import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Mail, Search, X } from "lucide-react";
import { CONTATO_EMAIL, DIAS_TESTE } from "../content/landing";

/**
 * Central de ajuda (perguntas frequentes). Abre no app e na landing.
 *
 * Regra do conteúdo: só descrever o que o produto faz hoje, com os nomes das
 * telas como aparecem no menu (Resumo, Carteira, Importar carteira, Cobranças,
 * Preparar envios, Histórico de envios, Automações, Configurações). Ao mudar uma
 * tela ou uma regra, atualize a resposta correspondente.
 *
 * Respostas: "\n" separa parágrafos; linha começando com "• " vira item de lista.
 */

interface Props {
  onClose: () => void;
}

interface Pergunta {
  tema: Tema;
  pergunta: string;
  resposta: string;
}

const TEMAS = ["Primeiros passos", "WhatsApp e envios", "Importação", "Carteira", "Assinatura", "Privacidade"] as const;
type Tema = (typeof TEMAS)[number];

const PERGUNTAS: Pergunta[] = [
  // ── Primeiros passos ────────────────────────────────────────────────────────
  {
    tema: "Primeiros passos",
    pergunta: "Como começo a usar?",
    resposta:
      "Três passos:\n" +
      "• Em Configurações, conecte o WhatsApp do número que vai enviar as cobranças.\n" +
      "• Em Cobranças, importe a lista de quem está em atraso, confira os registros e envie — tudo num passo a passo.\n" +
      "• Para cobrar sozinho todo dia, crie uma regra em Automações (planos Pro e Premium).",
  },
  {
    tema: "Primeiros passos",
    pergunta: "Preciso instalar alguma coisa?",
    resposta: "Não. O NC Finance funciona no navegador, no computador ou no celular. Só o WhatsApp que envia as cobranças fica no seu celular, conectado ao sistema.",
  },
  {
    tema: "Primeiros passos",
    pergunta: "Como funciona o teste grátis?",
    resposta: `Escolha um plano e use ${DIAS_TESTE} dias de graça, sem cartão de crédito. A primeira fatura vence no fim do teste, por boleto ou cartão. Se cancelar antes, não paga nada.`,
  },
  {
    tema: "Primeiros passos",
    pergunta: "Esqueci minha senha. Como recupero?",
    resposta: "Na tela de entrada, clique em “Esqueci minha senha” e informe o e-mail da conta. Enviamos um link para criar uma senha nova — confira também a caixa de spam.",
  },

  // ── WhatsApp e envios ───────────────────────────────────────────────────────
  {
    tema: "WhatsApp e envios",
    pergunta: "Como conecto meu WhatsApp?",
    resposta:
      "Em Configurações, clique em “Conectar WhatsApp” e escaneie o código com o celular do número (WhatsApp › Aparelhos conectados › Conectar um aparelho). Leva menos de um minuto e está incluído em todos os planos.\n" +
      "Se aparecer “Recebemos seu pedido”, o número está sendo preparado: a tela mostra o prazo, e depois é só voltar e escanear o código.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "O cliente recebe a mensagem de qual número?",
    resposta: "Do seu: o WhatsApp que você conectou. A mensagem é assinada com o nome da sua empresa, que você cadastra em Configurações › Nome nas mensagens. A NC Finance não aparece.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Quantas cobranças posso enviar por mês?",
    resposta: "Depende do plano:\n• Básico: até 300\n• Pro: até 1.500\n• Premium: até 5.000\nA contagem recomeça todo dia 1º.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Meu número pode ser bloqueado pelo WhatsApp?",
    resposta:
      "Pode, como em qualquer envio automatizado: o WhatsApp bloqueia números que recebem muitas denúncias ou que mandam muito volume de repente. Para reduzir o risco:\n" +
      "• cobre só quem já é seu cliente;\n" +
      "• num número novo, aumente o volume aos poucos;\n" +
      "• comece pelos tons amigável e neutro.\n" +
      "As automações não cobram o mesmo cliente duas vezes em menos de 20 horas, e no Premium dá para limitar os envios por dia.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Em que formato preciso colocar o telefone?",
    resposta: "Em qualquer um: (11) 98765-4321, 11987654321 ou com +55. O sistema acerta o formato e coloca o nono dígito em celular cadastrado no formato antigo. Número sem WhatsApp aparece como erro no Histórico de envios.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Quais são os tons de mensagem?",
    resposta:
      "• Amigável: lembrete leve e cordial.\n" +
      "• Neutro: direto e profissional.\n" +
      "• Firme: pede a regularização com prioridade.\n" +
      "• Jurídico: formal, para registro administrativo.\n" +
      "O texto pode ser ajustado antes de cada envio e em cada regra de automação.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Qual valor vai na mensagem?",
    resposta: "O valor atualizado: o valor do título mais a multa e os juros ao dia que você configurou, contados até o dia do envio — o mesmo valor corrigido que aparece no painel. Títulos a vencer vão pelo valor original.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "Como anexar o boleto de cada cliente?",
    resposta:
      "Um por um, na Carteira ou em Preparar envios: em cada título, clique em “Anexar” e escolha o PDF do boleto. Ele vai junto na mensagem como link, para o cliente abrir e pagar.\n" +
      "O olho ao lado do arquivo mostra o PDF anexado e o “x” remove. Vale em todos os planos.",
  },
  {
    tema: "WhatsApp e envios",
    pergunta: "As automações respeitam o tipo do cliente?",
    resposta:
      "Sim. A regra “Vencidos” só cobra quem está como vencido; “Vencem hoje” e “Vencem em X dias” só cobram quem está como a vencer. As regras rodam todo dia às 8h (horário de Brasília).\n" +
      "Clientes liquidados ou desabilitados nunca são cobrados por nenhuma regra.",
  },

  // ── Importação ──────────────────────────────────────────────────────────────
  {
    tema: "Importação",
    pergunta: "Quais arquivos posso importar?",
    resposta:
      "Planilha Excel (XLSX, XLS) ou ODS, CSV, TXT, PDF — inclusive escaneado —, foto ou print do relatório (JPG, PNG) e texto colado. Nos planos Pro e Premium também dá para puxar de uma planilha do Google Sheets.\n" +
      "Não precisa seguir modelo: o sistema reconhece as colunas pelo título (“Sacado”, “Vencto”, “Vlr”…) e pelo conteúdo, e ignora linhas de total e rodapés.",
  },
  {
    tema: "Importação",
    pergunta: "Meus arquivos são enviados para algum lugar na leitura?",
    resposta: "Não. A leitura acontece no seu navegador — inclusive o reconhecimento de texto de fotos e PDFs escaneados. Só os registros que você confirma são salvos na sua carteira.",
  },
  {
    tema: "Importação",
    pergunta: "O que significa “revisar” ou “conferir” num registro?",
    resposta:
      "Que vale olhar antes de salvar: o registro veio sem algum dado (telefone, vencimento, documento) ou foi lido com dúvida — por exemplo, um número que a leitura da foto não teve certeza. Corrija o campo na revisão.\n" +
      "Em Cobranças, registro sem valor ou sem vencimento já vem desmarcado, para não sair cobrança de R$ 0,00.",
  },
  {
    tema: "Importação",
    pergunta: "Posso importar o mesmo arquivo de novo?",
    resposta: "Pode. O número do documento identifica cada título: importar de novo atualiza os registros que já existem, sem duplicar. Se o próprio arquivo tiver documentos repetidos, o sistema pergunta se você quer manter todos ou só o primeiro de cada.",
  },
  {
    tema: "Importação",
    pergunta: "O banco é detectado sozinho?",
    resposta: "Quando dá: se o arquivo tiver uma coluna de banco, ela vale; senão, um banco no nome do arquivo (ex.: “BRADESCO_vencidos.pdf”) é usado para todos os registros. Sem nenhum dos dois, o campo fica em branco para você preencher.",
  },
  {
    tema: "Importação",
    pergunta: "Como importo do Google Sheets?",
    resposta: "Nos planos Pro e Premium, compartilhe a planilha com o e-mail mostrado no campo do Google Sheets, como Leitor, e cole o link da planilha.",
  },

  // ── Carteira ────────────────────────────────────────────────────────────────
  {
    tema: "Carteira",
    pergunta: "Como encontro e organizo os clientes?",
    resposta: "Na Carteira, use a busca, o filtro por tipo e a ordenação por nome, vencimento, valor ou banco. No computador dá para arrastar a tabela para os lados; a seleção e o nome do cliente ficam fixos.",
  },
  {
    tema: "Carteira",
    pergunta: "Como adiciono uma observação?",
    resposta: "Clique no ícone de nota na linha do cliente, escreva e salve. Cliente com observação mostra o ícone em amarelo.",
  },
  {
    tema: "Carteira",
    pergunta: "Como paro de cobrar um cliente?",
    resposta: "Marque o cliente na Carteira e clique em “Desabilitar selecionados”, informando o motivo (ele fica nas observações). O cliente passa para Desabilitado e não recebe mais cobrança, nem manual nem automática. Títulos liquidados também nunca são cobrados.",
  },
  {
    tema: "Carteira",
    pergunta: "Como são calculados multa e juros?",
    resposta:
      "Você define os percentuais em Encargos, na Carteira:\n" +
      "• Multa: percentual aplicado uma vez sobre o valor original.\n" +
      "• Juros: percentual ao dia, multiplicado pelos dias de atraso desde o vencimento.\n" +
      "Títulos a vencer e liquidados não têm encargos. A mensagem leva o valor já com os encargos.",
  },
  {
    tema: "Carteira",
    pergunta: "O que é a “Pendência crítica” no Resumo?",
    resposta: "O total em aberto dos títulos vencidos há pelo menos N dias — você escolhe o N e se o total considera ou não multa e juros. Serve para enxergar rápido os casos mais graves.",
  },
  {
    tema: "Carteira",
    pergunta: "Como exporto a carteira?",
    resposta:
      "Na Carteira, em Exportar:\n" +
      "• Planilha (XLS/CSV), com todos os campos;\n" +
      "• Relatório PDF, com resumo por tipo;\n" +
      "• Sincronizar com Sheets, numa planilha do Google.\n" +
      "Sai o que está filtrado na tela — ou só os clientes marcados, se houver seleção.",
  },

  // ── Assinatura ──────────────────────────────────────────────────────────────
  {
    tema: "Assinatura",
    pergunta: "Como mudo de plano?",
    resposta: "Em Configurações, clique em “Gerenciar assinatura” e escolha o novo plano. O limite de cobranças muda na hora, e a fatura em aberto passa a ter o valor do novo plano.",
  },
  {
    tema: "Assinatura",
    pergunta: "Como cancelo a assinatura?",
    resposta: "Em Configurações › Gerenciar assinatura › Cancelar assinatura. Sem multa e sem fidelidade: o acesso continua até o fim do período já pago (ou do teste grátis, sem cobrança).",
  },
  {
    tema: "Assinatura",
    pergunta: "E se a fatura vencer sem pagamento?",
    resposta: "Há 3 dias de tolerância depois do vencimento (o tempo de compensação do boleto). Passado esse prazo, o envio de cobranças fica pausado até o pagamento — seus dados continuam guardados. Para pagar, use Gerenciar assinatura › Pagar fatura em aberto.",
  },
  {
    tema: "Assinatura",
    pergunta: "Perco meus dados se cancelar?",
    resposta: "Não. Cancelar a assinatura não apaga nada: carteira, histórico e contatos continuam na sua conta, e o envio fica pausado até você assinar de novo. Se quiser apagar tudo, exclua a conta em Configurações.",
  },

  // ── Privacidade ─────────────────────────────────────────────────────────────
  {
    tema: "Privacidade",
    pergunta: "Os dados dos meus clientes estão seguros?",
    resposta:
      "• Cada conta só enxerga os próprios dados — a separação é feita no próprio banco de dados.\n" +
      "• As conexões são criptografadas (HTTPS), e as credenciais de integrações nunca passam pelo navegador.\n" +
      "• Nos registros técnicos, o telefone aparece mascarado.",
  },
  {
    tema: "Privacidade",
    pergunta: "A NC Finance guarda as mensagens que eu envio?",
    resposta: "Só um trecho das primeiras 100 letras de cada mensagem, para o Histórico de envios. O texto completo não é guardado.",
  },
  {
    tema: "Privacidade",
    pergunta: "Como exporto ou apago meus dados (LGPD)?",
    resposta: "Em Configurações você baixa uma cópia de tudo ou exclui a conta. Os detalhes estão na Política de Privacidade e no Acordo de Tratamento de Dados.",
  },
];

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Parágrafos e listas a partir do texto da resposta. */
function Resposta({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = [];
  let itens: string[] = [];
  const fecharLista = () => {
    if (!itens.length) return;
    blocos.push(
      <ul key={`l${blocos.length}`} className="space-y-1">
        {itens.map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[9px] w-1 h-1 rounded-full bg-zinc-600 flex-shrink-0" aria-hidden="true" />
            <span>{t}</span>
          </li>
        ))}
      </ul>,
    );
    itens = [];
  };
  for (const linha of texto.split("\n")) {
    if (linha.startsWith("• ")) itens.push(linha.slice(2));
    else {
      fecharLista();
      blocos.push(<p key={`p${blocos.length}`}>{linha}</p>);
    }
  }
  fecharLista();
  return <div className="space-y-2 text-sm text-zinc-400 leading-relaxed">{blocos}</div>;
}

export default function Suporte({ onClose }: Props) {
  const [tema, setTema] = useState<Tema | "Todas">("Todas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  // Esc fecha; a página atrás não rola.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const termo = semAcento(busca.trim());
  const visiveis = useMemo(
    () => PERGUNTAS.filter((p) =>
      (termo ? true : tema === "Todas" || p.tema === tema) &&
      (!termo || semAcento(`${p.pergunta} ${p.resposta}`).includes(termo))),
    [tema, termo],
  );

  const trocarTema = (t: Tema | "Todas") => {
    setTema(t);
    setBusca("");
    setAberta(null);
    listaRef.current?.scrollTo({ top: 0 });
  };

  const copiarEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTATO_EMAIL);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { /* sem permissão de área de transferência: o e-mail continua visível */ }
  };

  const chip = (ativo: boolean) =>
    `px-2.5 py-1 rounded-md border text-xs whitespace-nowrap transition-colors cursor-pointer ${
      ativo ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ajuda-titulo"
        className="w-full sm:max-w-2xl h-[92vh] sm:h-auto sm:max-h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-t-xl sm:rounded-xl shadow-2xl"
      >
        {/* Cabeçalho + busca + temas */}
        <header className="px-5 pt-4 pb-3 border-b border-zinc-800/80 space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="ajuda-titulo" className="text-sm font-bold text-white">Ajuda</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Respostas rápidas sobre o NC Finance</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="p-1 -mr-1 text-zinc-500 hover:text-white transition-colors cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="search"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setAberta(null); }}
              placeholder="Buscar: boleto, WhatsApp, fatura…"
              aria-label="Buscar nas perguntas"
              className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Celular: uma linha que rola de lado. Computador: quebra em linhas. */}
          <nav aria-label="Temas" className="-mx-5 px-5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
            {(["Todas", ...TEMAS] as const).map((t) => (
              <button key={t} type="button" onClick={() => trocarTema(t)} className={chip(!termo && tema === t)} aria-pressed={!termo && tema === t}>
                {t}
              </button>
            ))}
          </nav>
        </header>

        {/* Perguntas */}
        <div ref={listaRef} className="flex-1 overflow-y-auto px-5">
          {termo && (
            <p className="pt-3 text-[11px] font-mono uppercase tracking-widest text-zinc-500">
              {visiveis.length} {visiveis.length === 1 ? "resposta" : "respostas"} para “{busca.trim()}”
            </p>
          )}
          {visiveis.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-zinc-300">Nada encontrado.</p>
              <p className="text-xs text-zinc-500 mt-1">Tente outra palavra ou escreva para o suporte, aqui embaixo.</p>
            </div>
          ) : (
            <ul className="divide-y divide-zinc-900">
              {visiveis.map((p) => {
                const ativa = aberta === p.pergunta;
                return (
                  <li key={p.pergunta}>
                    <button
                      type="button"
                      onClick={() => setAberta(ativa ? null : p.pergunta)}
                      aria-expanded={ativa}
                      className="w-full flex items-center justify-between gap-4 py-3.5 text-left cursor-pointer group"
                    >
                      <span className={`text-sm transition-colors ${ativa ? "text-white font-semibold" : "text-zinc-200 group-hover:text-white"}`}>
                        {p.pergunta}
                      </span>
                      <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${ativa ? "rotate-180 text-emerald-400" : "text-zinc-600"}`} aria-hidden="true" />
                    </button>
                    {ativa && (
                      <div className="pb-4 -mt-1">
                        <Resposta texto={p.resposta} />
                        {(termo || tema === "Todas") && (
                          <p className="mt-3 text-[10px] font-mono uppercase tracking-widest text-zinc-600">{p.tema}</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Contato */}
        <footer className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 border-t border-zinc-800/80 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-sm text-zinc-300">Não achou a resposta?</p>
            <p className="text-xs text-zinc-500">
              <span className="text-zinc-400 break-all">{CONTATO_EMAIL}</span> · respondemos em até 1 dia útil
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => void copiarEmail()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-800 hover:border-zinc-700 text-xs text-zinc-300 transition-colors cursor-pointer"
            >
              {copiado ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar e-mail</>}
            </button>
            <a
              href={`mailto:${CONTATO_EMAIL}?subject=${encodeURIComponent("Suporte NC Finance")}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Enviar e-mail
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
