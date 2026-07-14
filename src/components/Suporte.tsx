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
    answer: "Novos usuários têm um trial gratuito de 7 dias ao se cadastrar. Durante o trial você tem acesso completo às funcionalidades do plano escolhido. Ao término, a cobrança é iniciada automaticamente — você pode cancelar antes do fim do trial sem custo.",
  },
  {
    category: "Primeiros Passos",
    question: "Esqueci minha senha. Como recupero?",
    answer: "Na tela de login, clique em 'Esqueci minha senha' e informe o e-mail da sua conta. Enviaremos um link para você criar uma nova senha — verifique sua caixa de entrada e também a pasta de spam.",
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
  {
    category: "WhatsApp e Cobranças",
    question: "Como anexar automaticamente o boleto de cada cliente?",
    answer: "Nos planos Pro e Premium, conecte uma pasta do Google Drive com os boletos em PDF. Compartilhe a pasta com o e-mail da service account (mostrado no card 'Boletos do Google Drive', no ícone de ajuda '?') como Leitor, cole a URL da pasta e clique em 'Buscar boletos no Drive'. O sistema anexa o boleto ao cliente certo quando o número do documento aparece no nome do arquivo (ex: 'BOLETO 1382-005 CLIENTE.pdf') OU quando o valor e o vencimento de dentro do PDF batem com o título. Só sugere quando há correspondência segura — se não encontrar, mostra 'Sem boleto' (para nunca anexar o boleto errado).",
  },
  {
    category: "WhatsApp e Cobranças",
    question: "As cobranças automáticas seguem o tipo do cliente?",
    answer: "Sim. Cada regra de automação respeita a categoria atual do cliente: a regra 'Vencidos' só cobra quem está como Vencido; as regras 'Vencem hoje' e 'Vencem em X dias' só cobram quem está como 'A vencer'. Se você mudar o tipo de um cliente, a automação passa a seguir o novo tipo. Clientes Liquidados e Desabilitados nunca são cobrados por nenhuma regra.",
  },

  // Importação
  {
    category: "Importação de Dados",
    question: "Quais formatos de arquivo posso importar?",
    answer: "O sistema aceita arquivos PDF, TXT e Excel (XLSX/XLS). O extrator local identifica automaticamente clientes, vencimentos, valores, banco e números de documento. Para melhores resultados, use arquivos de relatório ERP com CNPJ dos fornecedores no texto.",
  },
  {
    category: "Importação de Dados",
    question: "O banco é detectado automaticamente?",
    answer: "Sim. O sistema usa duas fontes para identificar o banco:\n1. Nome do arquivo — se o nome contiver o nome de um banco conhecido (ex: 'BRADESCO_vencidos.pdf'), ele é usado automaticamente para todos os registros.\n2. Coluna 'Banco' no arquivo — se o arquivo tiver uma coluna dedicada ao banco, o valor dela tem prioridade.\nCaso nenhum banco seja encontrado, o campo fica em branco para preenchimento manual.",
  },
  {
    category: "Importação de Dados",
    question: "Alguns registros foram marcados como 'baixa confiança' — o que faço?",
    answer: "Registros com confiança abaixo de 75% tiveram algum campo extraído de forma incerta. Revise os campos diretamente na tabela antes de enviar para a Visão Geral — você pode editar qualquer campo clicando nele. Campos em branco precisam ser preenchidos manualmente.",
  },
  {
    category: "Importação de Dados",
    question: "Posso importar o mesmo arquivo duas vezes?",
    answer: "Sim. O sistema usa o número do documento como chave de deduplicação. Se você importar o mesmo arquivo novamente, os registros existentes serão atualizados (não duplicados). Caso existam documentos duplicados dentro do mesmo arquivo, o sistema exibirá um aviso perguntando se deseja manter todos ou somente o primeiro de cada.",
  },
  {
    category: "Importação de Dados",
    question: "Como funciona a integração com o Google Sheets?",
    answer: "Nos planos Pro e Premium, você pode importar dados diretamente de uma planilha Google Sheets. Para isso, compartilhe sua planilha com o e-mail da service account da plataforma (visível no painel de importação) como 'Visualizador' e cole o link da planilha no campo indicado.",
  },

  // Visão Geral
  {
    category: "Visão Geral",
    question: "Como ordenar os registros na tabela?",
    answer: "A tabela possui filtros de ordenação em várias colunas:\n• Cliente — alterna entre A→Z e Z→A (padrão: A→Z)\n• Vencimento — ordena do mais antigo para o mais novo (↑) ou do mais novo para o mais antigo (↓)\n• Banco — agrupa registros do mesmo banco em ordem alfabética\n• Valor Base — ordena do maior para o menor ou do menor para o maior\nAo ativar um sort, os demais são desativados automaticamente.",
  },
  {
    category: "Visão Geral",
    question: "Como navegar pela tabela quando há muitas colunas?",
    answer: "Você pode arrastar a tabela lateralmente clicando e segurando o mouse sobre ela. As colunas de checkbox e Cliente ficam fixas à esquerda (sticky) para sempre ficarem visíveis durante a navegação horizontal.",
  },
  {
    category: "Visão Geral",
    question: "Como adicionar observações a um registro?",
    answer: "Na coluna 'Obs.' da tabela, clique no ícone de balão de texto. Um campo de texto abrirá para digitar sua observação. Clique em 'Salvar' para confirmar. Registros com observação exibem um ponto âmbar de indicação na linha.",
  },
  {
    category: "Visão Geral",
    question: "Como impedir que um cliente seja cobrado (desabilitar)?",
    answer: "Na Visão Geral, marque o(s) cliente(s) na tabela e clique em 'Desabilitar selecionados'. É obrigatório informar um motivo — ele fica salvo nas observações do cliente. O cliente passa para a categoria 'Desabilitado' e não recebe mais nenhuma cobrança (nem manual, nem automática). Para vê-los, use o filtro 'Desabilitados' na coluna Tipo. Clientes 'Liquidados' (já pagos) também nunca são cobrados.",
  },
  {
    category: "Visão Geral",
    question: "O que é a 'Pendência Crítica' no Dashboard?",
    answer: "O card Pendência Crítica exibe o total em aberto dos devedores vencidos há pelo menos N dias (configurável). Você pode:\n• Definir o número mínimo de dias de atraso no campo 'dias ≥'\n• Alternar entre 'c/ juros' (usa o valor atualizado com multa e juros) e 's/ juros' (usa o valor original)\nIsso permite identificar rapidamente os casos mais críticos da carteira.",
  },
  {
    category: "Visão Geral",
    question: "Como funcionam os encargos (multa e juros)?",
    answer: "Os encargos são calculados automaticamente para devedores na categoria 'Vencidos':\n• Multa: percentual fixo aplicado uma única vez sobre o valor original\n• Juros: percentual diário multiplicado pela quantidade real de dias de atraso (contados a partir da data de vencimento até hoje)\nDevedores 'A Vencer' não recebem encargos. 'Liquidados' mantêm o valor original. Os percentuais são configurados nos Parâmetros de Encargos Globais.",
  },

  // Exportação
  {
    category: "Exportação",
    question: "Como exportar para PDF ou Excel?",
    answer: "Na aba Visão Geral, use os botões na parte superior da tabela:\n• 'Exportar Planilha (XLS)' — gera um arquivo Excel com todos os campos, incluindo banco.\n• 'Exportar Relatório (PDF)' — gera um relatório em PDF formatado com cabeçalho, cards de resumo e tabela de registros.\nAmbos exportam os registros filtrados no momento. Se houver clientes selecionados (checkbox), somente eles são exportados.",
  },
  {
    category: "Exportação",
    question: "Posso exportar apenas alguns clientes selecionados?",
    answer: "Sim. Marque os checkboxes dos clientes desejados na tabela e clique em 'Exportar PDF (N)' ou 'Exportar XLS'. O número entre parênteses indica quantos registros serão incluídos. Os cards de resumo do PDF também refletirão apenas os selecionados.",
  },
  {
    category: "Exportação",
    question: "O PDF mostra apenas as categorias presentes?",
    answer: "Sim. Se os registros exportados pertencem a uma única categoria (ex: apenas Vencidos), o PDF exibe somente o card 'Total de Registros'. Se houver mais de uma categoria, os cards de cada categoria presente são exibidos automaticamente ao lado do Total.",
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
