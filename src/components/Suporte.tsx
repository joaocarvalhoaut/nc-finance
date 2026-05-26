import React, { useState } from "react";
import { X, ChevronDown, ChevronUp, MessageCircle, Mail } from "lucide-react";

interface Props {
  onClose: () => void;
}

interface FAQ {
  question: string;
  answer: string;
  category: string;
}

const FAQS: FAQ[] = [
  // Primeiros passos
  {
    category: "Primeiros Passos",
    question: "Como faço para começar a usar o NC Finance?",
    answer: "Após criar sua conta e ativar o plano, acesse a aba 'Importar' para carregar sua lista de devedores (PDF, TXT ou Excel). Após revisar os dados extraídos, clique em 'Enviar para a Visão Geral'. Na aba 'Cobrar' você pode selecionar os devedores e disparar as mensagens pelo WhatsApp.",
  },
  {
    category: "Primeiros Passos",
    question: "Preciso instalar alguma coisa?",
    answer: "Não. O NC Finance é 100% baseado em navegador — basta acessar pelo link e fazer login. Nenhum download ou instalação é necessário.",
  },
  {
    category: "Primeiros Passos",
    question: "Qual é o período de avaliação gratuita?",
    answer: "Novos usuários têm acesso a um período de trial gratuito ao se cadastrar. Durante o trial você tem acesso completo às funcionalidades do plano escolhido. Ao término, a cobrança é iniciada automaticamente — você pode cancelar antes do fim do trial sem custo.",
  },

  // WhatsApp
  {
    category: "WhatsApp e Cobranças",
    question: "Como o envio pelo WhatsApp funciona?",
    answer: "O NC Finance utiliza a Z-API como gateway de WhatsApp. A plataforma já está configurada com uma instância global — você não precisa conectar seu próprio número. As mensagens são enviadas a partir da instância da plataforma para os números dos seus devedores.",
  },
  {
    category: "WhatsApp e Cobranças",
    question: "Qual é o limite de cobranças que posso enviar?",
    answer: "O limite depende do seu plano mensal:\n• Básico: 300 cobranças/mês\n• Pro: 1.500 cobranças/mês\n• Premium: 5.000 cobranças/mês\nO contador é resetado todo dia 1º do mês.",
  },
  {
    category: "WhatsApp e Cobranças",
    question: "O devedor vai receber a mensagem de qual número?",
    answer: "As mensagens são enviadas pelo número WhatsApp configurado na instância global da plataforma NC Finance. O devedor receberá a mensagem como se fosse de um contato da empresa.",
  },
  {
    category: "WhatsApp e Cobranças",
    question: "Posso enviar para qualquer número de telefone?",
    answer: "Sim, desde que seja um número válido com WhatsApp ativo. O sistema aceita números com DDI+DDD+número (ex: 5577999887720). Números inválidos ou sem WhatsApp resultarão em erro de envio, registrado no Histórico.",
  },
  {
    category: "WhatsApp e Cobranças",
    question: "O que são os 4 tons de mensagem?",
    answer: "O NC Finance oferece 4 estilos de cobrança adaptáveis ao perfil de cada devedor:\n• Amigável: tom cordial e informal\n• Neutro: objetivo e profissional\n• Firme: direto com urgência\n• Jurídico: linguagem formal com aviso de encaminhamento",
  },

  // Importação
  {
    category: "Importação de Dados",
    question: "Quais formatos de arquivo posso importar?",
    answer: "O sistema aceita arquivos PDF, TXT e Excel (XLSX/XLS). O extrator local identifica automaticamente clientes, vencimentos, valores e números de documento. Para melhores resultados, use arquivos de relatório ERP com CNPJ dos fornecedores no texto.",
  },
  {
    category: "Importação de Dados",
    question: "Alguns registros foram marcados como 'baixa confiança' — o que faço?",
    answer: "Registros com confiança abaixo de 75% tiveram algum campo extraído de forma incerta. Revise os campos diretamente na tabela antes de enviar para a Visão Geral — você pode editar qualquer campo clicando nele. Campos em branco precisam ser preenchidos manualmente.",
  },
  {
    category: "Importação de Dados",
    question: "Posso importar o mesmo arquivo duas vezes?",
    answer: "Sim. O sistema usa o número do documento como chave de deduplicação. Se você importar o mesmo arquivo novamente, os registros existentes serão atualizados (não duplicados) para os que possuem número de documento. Registros sem número de documento serão inseridos novamente.",
  },
  {
    category: "Importação de Dados",
    question: "Como funciona a integração com o Google Sheets?",
    answer: "Nos planos Pro e Premium, você pode importar dados diretamente de uma planilha Google Sheets. Para isso, compartilhe sua planilha com o e-mail da service account da plataforma (visível no painel de importação) como 'Visualizador' e cole o link da planilha no campo indicado.",
  },

  // Planos e Pagamentos
  {
    category: "Planos e Pagamentos",
    question: "Como faço para mudar de plano?",
    answer: "Acesse a aba de configurações do seu perfil e clique em 'Gerenciar Assinatura'. Você será redirecionado ao portal do Stripe onde pode fazer upgrade, downgrade ou cancelar. Upgrades têm efeito imediato com cobrança proporcional.",
  },
  {
    category: "Planos e Pagamentos",
    question: "Como cancelo minha assinatura?",
    answer: "Você pode cancelar a qualquer momento pelo portal do Stripe (acessível nas configurações do perfil). O acesso permanece ativo até o final do período já pago. Não há taxas de cancelamento.",
  },
  {
    category: "Planos e Pagamentos",
    question: "Meu pagamento falhou — o que acontece?",
    answer: "Caso o pagamento da renovação falhe, o Stripe tentará cobrar novamente em alguns dias. Se todas as tentativas falharem, a assinatura é cancelada e o acesso ao envio de cobranças é suspenso. Você receberá notificações por e-mail durante esse processo.",
  },
  {
    category: "Planos e Pagamentos",
    question: "Os dados ficam salvos se eu cancelar?",
    answer: "Sim. Seus dados ficam armazenados por até 90 dias após o cancelamento. Durante esse período você pode reativar a assinatura e retomar de onde parou. Após 90 dias, os dados são excluídos permanentemente.",
  },

  // Segurança e Privacidade
  {
    category: "Segurança e Privacidade",
    question: "Os dados dos meus devedores estão seguros?",
    answer: "Sim. Todos os dados são armazenados com criptografia em trânsito (HTTPS). Os números de telefone são salvos de forma mascarada nos logs. As credenciais de APIs terceiras nunca são expostas no frontend. O banco de dados possui controle de acesso por Row Level Security (RLS).",
  },
  {
    category: "Segurança e Privacidade",
    question: "A NC Finance tem acesso às mensagens que envio?",
    answer: "Os logs de cobrança armazenam apenas um preview das primeiras 100 caracteres da mensagem, para fins de auditoria. O conteúdo completo não é armazenado.",
  },
];

const CATEGORIES = [...new Set(FAQS.map((f) => f.category))];

export default function Suporte({ onClose }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("Todos");
  const [search, setSearch] = useState("");

  const filtered = FAQS.filter((faq) => {
    const matchCat = activeCategory === "Todos" || faq.category === activeCategory;
    const matchSearch =
      search.trim() === "" ||
      faq.question.toLowerCase().includes(search.toLowerCase()) ||
      faq.answer.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Central de Suporte</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Perguntas frequentes · NC Finance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 flex-shrink-0">
          <input
            type="text"
            placeholder="Pesquisar dúvidas..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpenIndex(null); }}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        {/* Category filters */}
        <div className="px-6 pt-3 pb-1 flex gap-2 flex-wrap flex-shrink-0">
          {["Todos", ...CATEGORIES].map((cat) => (
            <button
              key={cat}
              onClick={() => { setActiveCategory(cat); setOpenIndex(null); }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-emerald-500 text-black"
                  : "bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* FAQ list */}
        <div className="overflow-y-auto px-6 py-4 space-y-2 flex-1">
          {filtered.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">Nenhuma resposta encontrada para "{search}".</p>
          ) : (
            filtered.map((faq, i) => (
              <div
                key={i}
                className="border border-zinc-800 rounded-xl overflow-hidden"
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-900 transition-colors gap-3"
                  onClick={() => setOpenIndex(openIndex === i ? null : i)}
                >
                  <span className="text-sm font-medium text-zinc-200">{faq.question}</span>
                  {openIndex === i
                    ? <ChevronUp className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  }
                </button>
                {openIndex === i && (
                  <div className="px-4 pb-4 bg-zinc-900/50">
                    <p className="text-zinc-400 text-sm leading-relaxed whitespace-pre-line">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Contact footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex-shrink-0">
          <div className="bg-zinc-900 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="text-zinc-300 text-sm font-medium">Não encontrou o que procurava?</p>
              <p className="text-zinc-500 text-xs mt-0.5">Nossa equipe responde em até 1 dia útil.</p>
            </div>
            <a
              href="mailto:ncfinance09@gmail.com"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm transition-colors flex-shrink-0"
            >
              <Mail className="w-4 h-4" />
              Falar com Suporte
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
