/**
 * Conteúdo da landing — fonte única.
 *
 * O mesmo texto vai para a página, para os dados estruturados (JSON-LD) e para
 * o /llms.txt, gerados no build por tools/prerender-landing.mjs. Assim o que o
 * Google e os buscadores de IA leem é sempre o que o visitante vê. Planos e
 * preços vêm de src/config/plans.ts.
 *
 * Regra: só prometer o que o produto faz hoje. Antes de mudar uma frase,
 * confira no código (planos liberados, prazos, limites).
 */

export const SITE_URL = "https://ncfinance.com.br/";
export const CONTATO_EMAIL = "ncfinance09@gmail.com";
export const DIAS_TESTE = 7;

/** Definição curta e citável — o que um buscador de IA deve repetir sobre o produto. */
export const DEFINICAO =
  "A NC Finance é um software brasileiro (SaaS) de cobrança pelo WhatsApp para pequenas e médias empresas. " +
  "Você importa a lista de clientes em atraso, o sistema organiza os títulos e calcula juros e multa, " +
  "e as cobranças saem do seu próprio número — uma a uma, em lote ou por regras automáticas.";

export interface Passo { titulo: string; texto: string }

export const PASSOS: Passo[] = [
  {
    titulo: "Importe a carteira",
    texto: "Planilha Excel ou CSV, PDF, TXT, texto colado ou Google Sheets. O sistema lê cliente, documento, vencimento, valor e telefone, e você confere tudo antes de salvar.",
  },
  {
    titulo: "Revise e envie",
    texto: "O painel calcula juros e multa de cada título. Escolha o tom — amigável, neutro, firme ou jurídico — e envie pelo seu WhatsApp, um a um ou, nos planos Pro e Premium, em lote.",
  },
  {
    titulo: "Acompanhe e dê baixa",
    texto: "Cada envio fica no histórico. Importe o relatório de pagos e o sistema marca os títulos como liquidados: quem já pagou não recebe mais cobrança.",
  },
];

export interface Diferencial { titulo: string; texto: string; planos: string }

export const DIFERENCIAIS: Diferencial[] = [
  {
    titulo: "Seu número, conectado em um minuto",
    texto: "Leia um QR Code com o celular da empresa, como no WhatsApp Web. Seu cliente recebe a cobrança de um contato que ele já conhece.",
    planos: "Todos os planos",
  },
  {
    titulo: "O boleto vai junto",
    texto: "Anexe o PDF do boleto em cada título. Ele segue na mensagem como link, para o cliente abrir e pagar na hora.",
    planos: "Todos os planos",
  },
  {
    titulo: "Cobra sozinho, todo dia",
    texto: "Crie regras como “vencidos” ou “vencem em 3 dias”. Às 8h o sistema envia, sem cobrar o mesmo cliente duas vezes em menos de 20 horas.",
    planos: "Pro e Premium",
  },
];

export interface Pergunta { pergunta: string; resposta: string }

export const PERGUNTAS: Pergunta[] = [
  {
    pergunta: "O que é a NC Finance?",
    resposta: DEFINICAO,
  },
  {
    pergunta: "Meu número pode ser bloqueado pelo WhatsApp?",
    resposta:
      "Pode, como em qualquer envio automatizado: o WhatsApp bloqueia números que recebem muitas denúncias ou que mandam muito volume de repente. " +
      "Para reduzir o risco, cobre só quem já é seu cliente, aumente o volume aos poucos num número novo e comece pelos tons amigável e neutro. " +
      "As automações não cobram o mesmo cliente duas vezes em menos de 20 horas, e no plano Premium dá para limitar os envios por dia.",
  },
  {
    pergunta: "Quem aparece como remetente da cobrança?",
    resposta:
      "A sua empresa. A mensagem sai do WhatsApp que você conectou e é assinada com o nome da empresa que você cadastrou — a NC Finance não aparece. O texto também pode ser ajustado antes de cada envio e em cada regra de automação.",
  },
  {
    pergunta: "Preciso de cartão de crédito para testar?",
    resposta:
      `Não. Escolha um plano e use ${DIAS_TESTE} dias de graça. A primeira fatura vence no fim do teste, por boleto ou cartão. Se cancelar antes, não paga nada.`,
  },
  {
    pergunta: "Posso cancelar quando quiser?",
    resposta: "Sim, em Minha Conta, sem multa e sem fidelidade. O acesso continua até o fim do período já pago.",
  },
  {
    pergunta: "Quais arquivos consigo importar?",
    resposta:
      "Planilha Excel (XLS ou XLSX), CSV, PDF, TXT, texto colado e planilhas do Google Sheets. Não precisa seguir um modelo: o sistema identifica os dados e você revisa antes de salvar.",
  },
  {
    pergunta: "Os juros e a multa são calculados sozinhos?",
    resposta:
      "Sim. Você define uma vez a multa e os juros ao dia, e o painel mostra o valor corrigido de cada título pelos dias de atraso. A mensagem leva esse valor atualizado.",
  },
  {
    pergunta: "Como ficam os dados dos meus clientes (LGPD)?",
    resposta:
      "Cada conta só acessa os próprios dados. Você pode exportar ou apagar tudo a qualquer momento em Minha Conta. Os detalhes estão na Política de Privacidade e no Acordo de Tratamento de Dados.",
  },
];
