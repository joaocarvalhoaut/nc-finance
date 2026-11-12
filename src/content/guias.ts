/**
 * Guias — páginas de conteúdo para SEO e GEO (/guias/<slug>).
 *
 * Cada guia responde uma pergunta que o dono de empresa faz no Google ou no
 * ChatGPT ("como cobrar cliente pelo WhatsApp", "como calcular juros de boleto
 * atrasado"…). Viram HTML estático no build (tools/prerender-landing.mjs), sem
 * JavaScript: o robô lê tudo de primeira. Também entram no sitemap.xml e no
 * /llms.txt.
 *
 * Regras:
 *  - Resposta direta no começo (`resumo`): é o trecho que buscador e IA citam.
 *  - Só afirmar o que é verdade. Lei: citar o artigo. Produto: só o que o código
 *    faz hoje (ver src/content/landing.ts e os planos em src/config/plans.ts).
 *  - Texto simples (sem HTML/Markdown): o gerador escapa tudo.
 *  - Mudou o texto? Atualize `atualizadoEm`.
 */

import type { Pergunta } from "./landing";

export interface SecaoGuia {
  titulo: string;
  paragrafos?: string[];
  lista?: string[];
  /** true = lista numerada (passo a passo). */
  numerada?: boolean;
  /** Parágrafo depois da lista. */
  fecho?: string;
}

export interface Guia {
  slug: string;
  /** H1 da página. */
  titulo: string;
  /** <title> — até ~65 caracteres. */
  tituloSeo: string;
  /** meta description — até ~160 caracteres. */
  descricao: string;
  /** Resposta direta, 2 a 4 frases. */
  resumo: string;
  publicadoEm: string; // YYYY-MM-DD
  atualizadoEm: string; // YYYY-MM-DD
  secoes: SecaoGuia[];
  /** Como o NC Finance ajuda nesse assunto — só recursos que existem. */
  noNcFinance: string[];
  perguntas: Pergunta[];
}

export const GUIAS: Guia[] = [
  {
    slug: "como-cobrar-cliente-inadimplente-pelo-whatsapp",
    titulo: "Como cobrar cliente inadimplente pelo WhatsApp",
    tituloSeo: "Como cobrar cliente inadimplente pelo WhatsApp: passo a passo",
    descricao:
      "Passo a passo para cobrar clientes em atraso pelo WhatsApp: o que a mensagem precisa ter, quando mandar, o que a lei proíbe e como não ter o número bloqueado.",
    resumo:
      "Para cobrar um cliente inadimplente pelo WhatsApp, mande a mensagem do número da sua empresa, identificando quem cobra, qual título está em aberto, o valor atualizado e o vencimento, " +
      "com o boleto ou o Pix junto e um jeito fácil de negociar. Comece por um tom amigável e suba o tom aos poucos se não houver resposta. " +
      "A cobrança deve ser privada e respeitosa: o Código de Defesa do Consumidor proíbe expor o devedor ao ridículo, constranger ou ameaçar.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Antes de mandar a primeira mensagem",
        paragrafos: [
          "Cobrança errada custa caro: o cliente que já pagou e recebe cobrança fica irritado, e o que recebe valor errado não paga. Confira a lista antes de começar.",
        ],
        lista: [
          "O título está mesmo em aberto: não foi pago, não está em negociação e não foi cancelado.",
          "O valor está atualizado, com a multa e os juros que o contrato ou o boleto preveem.",
          "O telefone é do responsável pelo pagamento, e não de um funcionário qualquer da empresa cliente.",
          "Você tem em mãos o número do documento, o vencimento e o valor original.",
          "O meio de pagamento está pronto: boleto em PDF ou link, ou chave Pix.",
        ],
      },
      {
        titulo: "O que a mensagem de cobrança precisa ter",
        lista: [
          "Quem está cobrando: o nome da sua empresa, logo na primeira linha.",
          "Qual dívida: número do documento ou da nota, vencimento e valor.",
          "Como pagar agora: o boleto anexado ou a chave Pix, sem o cliente ter que pedir.",
          "O que fazer se já pagou: pedir o comprovante para dar baixa.",
          "Um canal para negociar: responder a própria mensagem já basta.",
        ],
        fecho:
          "Mensagem curta funciona melhor. Quem abre a conversa precisa entender em poucos segundos o que é, quanto é e como resolver.",
      },
      {
        titulo: "Uma cadência que funciona (régua de cobrança)",
        paragrafos: [
          "Mandar a mesma mensagem todo dia irrita e aumenta o risco de denúncia. O que funciona é uma sequência curta, em que o tom sobe aos poucos:",
        ],
        numerada: true,
        lista: [
          "Alguns dias antes do vencimento: um lembrete amigável, com o boleto. Ainda não é cobrança, e evita boa parte dos atrasos.",
          "Logo depois do vencimento: um aviso neutro, com o valor e o boleto de novo.",
          "Cerca de uma semana de atraso: uma mensagem firme, com o valor atualizado e a proposta de negociar.",
          "Atraso longo: um comunicado formal, dizendo os próximos passos previstos no contrato.",
        ],
        fecho:
          "Os prazos não são regra fixa: ajuste ao seu negócio e ao seu cliente. E só diga que vai protestar ou negativar se for mesmo fazer isso.",
      },
      {
        titulo: "O que a lei proíbe na cobrança",
        paragrafos: [
          "Cobrar pelo WhatsApp é permitido. O que conta é a forma. O artigo 42 do Código de Defesa do Consumidor diz que, na cobrança de débitos, o consumidor inadimplente não será exposto a ridículo, nem será submetido a qualquer tipo de constrangimento ou ameaça. O artigo 71 torna crime a cobrança com ameaça, coação ou constrangimento.",
          "Na prática, evite:",
        ],
        lista: [
          "Cobrar em grupo, no status ou em qualquer lugar que outras pessoas vejam.",
          "Falar da dívida com parentes, colegas de trabalho ou vizinhos do devedor.",
          "Mandar mensagens em sequência no mesmo dia ou fora do horário comercial.",
          "Ameaçar consequências que você não vai aplicar ou que a lei não permite.",
          "Cobrar quem já pagou: confira os pagamentos antes de cada rodada.",
        ],
        fecho:
          "Os dados do cliente também são protegidos pela LGPD: use o telefone e a dívida só para a cobrança da relação que vocês têm.",
      },
      {
        titulo: "Como não ter o número bloqueado",
        paragrafos: [
          "O WhatsApp não publica um limite de mensagens. O bloqueio costuma vir de denúncias e de picos de volume, principalmente em número novo ou que nunca conversou com aqueles contatos.",
        ],
        lista: [
          "Cobre só quem já é seu cliente e conhece o seu número.",
          "Identifique a empresa em toda mensagem: quem não reconhece o remetente denuncia.",
          "Número novo: comece com poucas mensagens por dia e aumente aos poucos ao longo de algumas semanas.",
          "Prefira os tons amigável e neutro nas primeiras mensagens.",
        ],
      },
    ],
    noNcFinance: [
      "Importa a lista de clientes em atraso de planilha Excel ou CSV, PDF, TXT, foto do relatório ou Google Sheets.",
      "Calcula a multa e os juros ao dia de cada título, e a mensagem leva o valor atualizado.",
      "Tem quatro tons de mensagem (amigável, neutro, firme e jurídico), e o texto pode ser ajustado antes de enviar.",
      "A cobrança sai do WhatsApp da sua empresa, assinada com o nome dela, com o boleto em PDF anexado como link.",
      "Nos planos Pro e Premium, regras automáticas enviam às 8h (por exemplo, \"vencem em 3 dias\" e \"vencidos\"), sem cobrar o mesmo cliente duas vezes em menos de 20 horas.",
      "Limite diário de mensagens e aquecimento para número novo, para reduzir o risco de bloqueio.",
      "Ao importar o relatório de pagos, os títulos recebem baixa e quem pagou não é mais cobrado.",
    ],
    perguntas: [
      {
        pergunta: "Cobrar pelo WhatsApp é permitido?",
        resposta:
          "Sim. Nenhuma lei proíbe usar o WhatsApp para cobrar. Valem as regras de qualquer cobrança: a mensagem deve ser privada, só para o devedor, sem expor, constranger ou ameaçar (artigo 42 do Código de Defesa do Consumidor), e os dados do cliente devem ser usados só para essa finalidade (LGPD).",
      },
      {
        pergunta: "Quantas mensagens de cobrança posso mandar?",
        resposta:
          "A lei não fixa um número. O razoável é espaçar as mensagens, não repetir no mesmo dia e subir o tom aos poucos. Excesso pode ser visto como constrangimento e aumenta as denúncias do número.",
      },
      {
        pergunta: "Posso cobrar juros e multa pelo atraso?",
        resposta:
          "Sim, se estiverem previstos no contrato ou no boleto. Em relações de consumo, a multa por atraso é limitada a 2% do valor da prestação (artigo 52, parágrafo 1º, do Código de Defesa do Consumidor).",
      },
      {
        pergunta: "E se o cliente disser que já pagou?",
        resposta:
          "Peça o comprovante, confira no seu extrato ou no banco e dê baixa no título. Pare as cobranças desse título até a conferência terminar.",
      },
    ],
  },
];
