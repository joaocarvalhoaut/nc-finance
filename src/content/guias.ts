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
  /** Texto pronto para copiar (mantém as quebras de linha), depois da lista. */
  modelo?: string;
  /** Rótulo do bloco do `modelo` (padrão: "Modelo para copiar"). */
  rotuloModelo?: string;
  /** Parágrafo depois da lista / do modelo. */
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
  {
    slug: "modelos-de-mensagem-de-cobranca-whatsapp",
    titulo: "Modelos de mensagem de cobrança pelo WhatsApp",
    tituloSeo: "Modelos de mensagem de cobrança pelo WhatsApp (prontos)",
    descricao:
      "Modelos prontos de mensagem de cobrança para WhatsApp, do lembrete antes do vencimento ao aviso formal: amigável, neutro, firme e formal, mais respostas para negociar.",
    resumo:
      "Uma boa mensagem de cobrança pelo WhatsApp diz quem cobra, qual título está em aberto, o valor atualizado e o vencimento, e já leva o boleto ou o Pix. " +
      "Comece com um lembrete antes do vencimento e um tom amigável nos primeiros dias de atraso; passe ao neutro, ao firme e, por fim, a um aviso formal só se não houver resposta. " +
      "Abaixo estão modelos prontos para cada etapa: troque o que está entre colchetes.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "O que todo modelo precisa ter",
        lista: [
          "O nome do cliente e o da sua empresa, logo no começo.",
          "O número do documento, o vencimento e o valor atualizado.",
          "O boleto ou a chave Pix na própria mensagem.",
          "Uma saída para quem já pagou (mandar o comprovante) e para quem quer negociar (responder a mensagem).",
        ],
        fecho:
          "Troque tudo o que está entre colchetes antes de enviar. Mensagem com o nome e o valor de cada cliente funciona melhor do que um texto genérico.",
      },
      {
        titulo: "1. Lembrete antes do vencimento",
        paragrafos: [
          "Mande dois ou três dias antes. Ainda não é cobrança: é um favor ao cliente, e evita boa parte dos atrasos.",
        ],
        modelo:
          "Olá, [Nome]! Aqui é o financeiro da [Empresa].\n" +
          "Passando para lembrar que o boleto abaixo vence em [data]:\n\n" +
          "Documento: [número]\n" +
          "Valor: R$ [valor]\n\n" +
          "Boleto: [link]\n" +
          "Se já pagou, pode desconsiderar. Obrigado!",
      },
      {
        titulo: "2. Tom amigável (primeiros dias de atraso)",
        paragrafos: [
          "A maior parte dos atrasos curtos é esquecimento. Trate como tal: sem cobrança de juros no texto, sem pressão.",
        ],
        modelo:
          "Olá, [Nome], tudo bem?\n" +
          "Aqui é o financeiro da [Empresa]. Ainda não identificamos o pagamento do título abaixo:\n\n" +
          "Documento: [número]\n" +
          "Vencimento: [data]\n" +
          "Valor atualizado: R$ [valor]\n\n" +
          "Boleto atualizado: [link]\n" +
          "Se já pagou, me mande o comprovante que eu dou baixa. Qualquer dúvida, é só responder aqui.",
      },
      {
        titulo: "3. Tom neutro (cerca de uma semana de atraso)",
        paragrafos: [
          "Mais formal, ainda cordial. Já vale abrir a porta para negociar.",
        ],
        modelo:
          "Prezado(a) [Nome],\n\n" +
          "Aqui é o financeiro da [Empresa]. Consta em aberto em nosso sistema:\n\n" +
          "Documento: [número]\n" +
          "Vencimento: [data]\n" +
          "Valor atualizado: R$ [valor]\n\n" +
          "Pedimos que regularize o pagamento pelo boleto: [link]\n" +
          "Se preferir combinar outra data ou parcelar, responda esta mensagem.\n\n" +
          "Atenciosamente,\n" +
          "Financeiro [Empresa]",
      },
      {
        titulo: "4. Tom firme (duas a três semanas de atraso)",
        paragrafos: [
          "Direto e com prazo. Firme não é grosseiro: nada de ironia, letras maiúsculas ou ameaça.",
        ],
        modelo:
          "[Nome], aqui é da cobrança da [Empresa].\n\n" +
          "O documento [número], vencido em [data], segue em aberto. O valor atualizado, com multa e juros, é R$ [valor].\n\n" +
          "Precisamos da regularização até [data limite]. Boleto: [link]\n" +
          "Se houver algum problema com o pagamento, responda hoje para combinarmos uma solução.\n\n" +
          "Cobrança [Empresa]",
      },
      {
        titulo: "5. Aviso formal (atraso longo)",
        paragrafos: [
          "O último passo antes de medidas fora do WhatsApp. Diga qual é o próximo passo e quando ele acontece.",
        ],
        modelo:
          "Sr(a). [Nome],\n\n" +
          "A [Empresa] comunica que o débito do documento [número], vencido em [data], no valor atualizado de R$ [valor], segue sem pagamento.\n\n" +
          "Pedimos que regularize ou entre em contato para negociar até [data limite]. Sem retorno, o débito seguirá para [próximo passo previsto no contrato: protesto do título, inclusão em cadastro de inadimplentes ou cobrança judicial].\n\n" +
          "Departamento financeiro [Empresa]",
        fecho:
          "Escreva só o passo que você vai mesmo tomar. Ameaça que não se cumpre tira a credibilidade da cobrança e pode ser vista como constrangimento, o que os artigos 42 e 71 do Código de Defesa do Consumidor proíbem.",
      },
      {
        titulo: "Respostas para quando o cliente responde",
        paragrafos: ["Proposta de negociação:"],
        modelo:
          "Combinado, [Nome]. Podemos fazer assim:\n" +
          "entrada de R$ [valor] até [data] e o restante em [quantidade] parcelas de R$ [valor], todo dia [dia].\n" +
          "Se estiver de acordo, responda \"aceito\" que eu mando os boletos.",
        fecho:
          "Cliente disse que já pagou: \"Obrigado pelo retorno, [Nome]. Pode me mandar o comprovante? Assim confiro e dou baixa no título.\" E pare as cobranças desse título até conferir.",
      },
      {
        titulo: "Erros que fazem o cliente não pagar (ou denunciar o número)",
        lista: [
          "Mensagem sem o nome da empresa: o cliente não sabe quem está cobrando.",
          "Valor errado ou sem o boleto: o cliente precisa pedir, e a conversa morre ali.",
          "Mesmo texto todo dia, ou mais de uma mensagem no mesmo dia.",
          "Mensagem à noite, no fim de semana ou em feriado.",
          "Cobrar quem já pagou ou quem já está negociando.",
          "Pular direto para o aviso formal no primeiro atraso.",
        ],
      },
    ],
    noNcFinance: [
      "Os quatro tons (amigável, neutro, firme e jurídico) já vêm prontos, com o nome do cliente, o documento, o vencimento e o valor atualizado preenchidos para cada título.",
      "A mensagem é assinada com o nome da sua empresa e sai do WhatsApp dela.",
      "Dá para ajustar o texto antes de enviar.",
      "O boleto em PDF vai como link na própria mensagem.",
      "Nos planos Pro e Premium, cada regra automática tem o seu tom ou um texto próprio: por exemplo, amigável para \"vencem em 3 dias\" e firme para os vencidos.",
      "Cliente marcado como em negociação fica fora do lote e da automação: só recebe mensagem enviada um a um.",
    ],
    perguntas: [
      {
        pergunta: "Qual tom usar na primeira cobrança?",
        resposta:
          "O amigável. Nos primeiros dias, a maior parte dos atrasos é esquecimento, e uma mensagem cordial com o boleto resolve. Suba para o neutro e o firme só se não houver pagamento nem resposta.",
      },
      {
        pergunta: "Posso dizer na mensagem que vou negativar o nome do cliente?",
        resposta:
          "Pode, se for verdade e se você for mesmo fazer isso. O consumidor tem de ser comunicado por escrito antes de entrar no cadastro de inadimplentes (artigo 43, parágrafo 2º, do Código de Defesa do Consumidor); em geral, o próprio birô de crédito manda esse aviso. Usar a negativação só como ameaça pode ser visto como constrangimento.",
      },
      {
        pergunta: "Qual o melhor horário para mandar mensagem de cobrança?",
        resposta:
          "Em dia útil e em horário comercial. Mensagem à noite, no fim de semana ou em feriado incomoda, rende menos resposta e aumenta as denúncias do número.",
      },
      {
        pergunta: "Posso usar o mesmo texto para todos os clientes?",
        resposta:
          "Pode usar o mesmo modelo, desde que cada mensagem leve o nome, o documento e o valor certos de cada cliente. Texto personalizado é lido como conversa; texto idêntico para muita gente parece disparo em massa.",
      },
    ],
  },
  {
    slug: "como-calcular-juros-e-multa-de-boleto-atrasado",
    titulo: "Como calcular juros e multa de boleto atrasado",
    tituloSeo: "Como calcular juros e multa de boleto atrasado (com exemplo)",
    descricao:
      "Fórmula e exemplo para calcular multa e juros de boleto em atraso: quanto pode cobrar, como contar os dias e como chegar ao valor atualizado.",
    resumo:
      "O valor atualizado de um boleto atrasado é o valor original mais a multa e os juros de mora. A multa é cobrada uma vez só, em percentual do valor original; " +
      "os juros são cobrados por dia de atraso, também sobre o valor original. Exemplo: um boleto de R$ 1.000,00 com multa de 2% e juros de 1% ao mês, pago 15 dias depois do vencimento, " +
      "fica em R$ 1.025,00 (R$ 20,00 de multa e R$ 5,00 de juros). Em relação de consumo, a multa não pode passar de 2%.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "A fórmula",
        paragrafos: [
          "Valor atualizado = valor original + multa + juros.",
          "Multa = valor original × percentual da multa. Entra uma vez só, a partir do primeiro dia de atraso.",
          "Juros = valor original × juros ao mês ÷ 30 × dias de atraso. Crescem a cada dia, sempre sobre o valor original (juros simples, sem juros sobre juros).",
        ],
      },
      {
        titulo: "Passo a passo",
        numerada: true,
        lista: [
          "Confira no contrato ou no boleto os percentuais de multa e de juros. Sem previsão, a multa não pode ser cobrada.",
          "Conte os dias de atraso: do dia seguinte ao vencimento até o dia do pagamento (ou até hoje).",
          "Calcule a multa: valor original × percentual da multa.",
          "Calcule os juros: valor original × juros ao mês ÷ 30 × dias de atraso. Juros de 1% ao mês dão cerca de 0,033% ao dia.",
          "Some o valor original, a multa e os juros.",
        ],
      },
      {
        titulo: "Exemplo completo",
        paragrafos: [
          "Boleto de R$ 1.000,00, vencido em 1º de março, com multa de 2% e juros de 1% ao mês, pago em 16 de março (15 dias de atraso):",
        ],
        rotuloModelo: "Cálculo",
        modelo:
          "Valor original: R$ 1.000,00\n" +
          "Multa (2%): R$ 1.000,00 × 2% = R$ 20,00\n" +
          "Juros (1% a.m.): R$ 1.000,00 × 1% ÷ 30 × 15 = R$ 5,00\n" +
          "Valor atualizado: R$ 1.025,00",
        fecho:
          "Se o mesmo boleto for pago com 45 dias de atraso, a multa continua R$ 20,00 e os juros vão a R$ 15,00: R$ 1.035,00.",
      },
      {
        titulo: "Quanto se pode cobrar",
        lista: [
          "Multa em relação de consumo (empresa cobrando pessoa física): no máximo 2% do valor da prestação (artigo 52, §1º, do Código de Defesa do Consumidor).",
          "Multa entre empresas: vale o contrato, mas o juiz pode reduzir uma multa excessiva (artigo 413 do Código Civil).",
          "Juros de mora: o usual em boleto é 1% ao mês. Sem taxa combinada, vale a taxa legal do artigo 406 do Código Civil, que desde a Lei 14.905/2024 é a Selic menos a inflação (IPCA).",
          "Correção monetária: só se o contrato prever, com o índice definido nele. O cálculo acima não inclui correção.",
        ],
        fecho:
          "Em qualquer caso, os percentuais precisam estar no contrato ou no boleto que o cliente recebeu. Encargo que aparece só na hora de cobrar gera discussão e atrasa o pagamento.",
      },
      {
        titulo: "Boleto que vence no fim de semana ou feriado",
        paragrafos: [
          "Se o vencimento cai em sábado, domingo ou feriado, o cliente pode pagar no primeiro dia útil seguinte sem juros de mora (Lei 7.089/1983). Se ele pagar nesse dia, não conte atraso.",
        ],
      },
      {
        titulo: "Erros comuns no cálculo",
        lista: [
          "Cobrar a multa de novo a cada mês: ela entra uma vez só.",
          "Calcular os juros sobre o valor já com multa: os juros correm sobre o valor original.",
          "Usar juros compostos (juros sobre juros) na cobrança do atraso.",
          "Cobrar encargo que não está no contrato nem no boleto.",
          "Mandar a mensagem com o valor de dias atrás: o valor muda todo dia.",
        ],
      },
    ],
    noNcFinance: [
      "Você define uma vez a multa (%) e os juros ao dia (%), e o painel mostra o valor atualizado de cada título pelos dias de atraso.",
      "O cálculo é o deste guia: multa uma vez e juros simples ao dia, os dois sobre o valor original.",
      "A mensagem de cobrança leva o valor atualizado no dia do envio, inclusive nas regras automáticas das 8h.",
      "Títulos a vencer e pagos ficam no valor original; título em negociação continua correndo multa e juros.",
      "Título que vence em sábado, domingo ou feriado nacional fica sem multa e sem juros até o primeiro dia útil seguinte.",
    ],
    perguntas: [
      {
        pergunta: "Qual é a multa máxima por atraso de boleto?",
        resposta:
          "Quando uma empresa cobra uma pessoa física (relação de consumo), 2% do valor da prestação, pelo artigo 52, §1º, do Código de Defesa do Consumidor. Entre empresas vale o que o contrato diz, mas o juiz pode reduzir uma multa excessiva (artigo 413 do Código Civil).",
      },
      {
        pergunta: "Quanto é 1% ao mês de juros por dia?",
        resposta:
          "Cerca de 0,033% ao dia (1% ÷ 30). Num boleto de R$ 1.000,00, isso dá aproximadamente R$ 0,33 por dia de atraso.",
      },
      {
        pergunta: "A multa é cobrada todo mês?",
        resposta:
          "Não. A multa por atraso é cobrada uma vez só, no primeiro dia de atraso. O que cresce com o tempo são os juros.",
      },
      {
        pergunta: "Os juros são sobre o valor com multa?",
        resposta:
          "Não. Multa e juros são calculados sobre o valor original do boleto e depois somados a ele.",
      },
    ],
  },
  {
    slug: "como-evitar-bloqueio-do-whatsapp-ao-cobrar",
    titulo: "Como evitar o bloqueio do WhatsApp ao cobrar clientes",
    tituloSeo: "Como evitar bloqueio do WhatsApp ao cobrar clientes",
    descricao:
      "Por que o WhatsApp bloqueia números que cobram clientes e o que fazer para evitar: aquecimento do número novo, limite por dia, mensagens e sinais de alerta.",
    resumo:
      "O WhatsApp não publica um limite de mensagens por dia para o aplicativo comum ou Business. O bloqueio costuma vir de denúncias, de picos de volume e de número novo mandando para quem nunca falou com ele. " +
      "Para evitar: cobre só quem é seu cliente, identifique a empresa em toda mensagem, mande para cada cliente no máximo uma mensagem por dia, " +
      "espalhe os envios ao longo do dia e, se o número for novo, comece com cerca de 30 mensagens por dia e aumente aos poucos ao longo de um mês.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Por que números são bloqueados",
        paragrafos: [
          "O WhatsApp não diz quantas mensagens um número pode mandar. O que se observa é que o bloqueio vem de comportamento que parece spam:",
        ],
        lista: [
          "Denúncias: quem recebe pode tocar em \"Denunciar\" e \"Bloquear\". Poucas denúncias já pesam.",
          "Pico de volume: um número que mandava 10 mensagens por dia e de repente manda 300.",
          "Número novo: chip recém-ativado, sem histórico de conversas, mandando muitas mensagens.",
          "Contatos frios: mensagens para quem nunca conversou com o número e não tem ele salvo.",
        ],
        fecho:
          "Este guia trata do WhatsApp comum e do WhatsApp Business (aplicativo). Na API oficial da Meta (WhatsApp Business Platform), os limites são publicados e as mensagens que a empresa inicia usam modelos aprovados.",
      },
      {
        titulo: "Aqueça o número novo",
        paragrafos: [
          "Número novo precisa de histórico antes de mandar volume. Uma referência prudente para os primeiros 30 dias:",
        ],
        rotuloModelo: "Mensagens por dia",
        modelo:
          "Dias 1 a 3: até 30\n" +
          "Dias 4 a 7: até 50\n" +
          "Dias 8 a 14: até 80\n" +
          "Dias 15 a 21: até 120\n" +
          "Dias 22 a 30: até 200",
        fecho:
          "Nesse período, converse de verdade: responda quem responde, peça para os clientes salvarem o número e evite mandar tudo de uma vez.",
      },
      {
        titulo: "Boas práticas em toda cobrança",
        lista: [
          "Cobre só quem é seu cliente e conhece o seu número.",
          "Diga o nome da empresa na primeira linha: quem não reconhece o remetente denuncia.",
          "No máximo uma mensagem por dia para cada cliente. Se ele tem vários títulos, mande todos na mesma mensagem.",
          "Espalhe os envios ao longo do dia, em horário comercial e em dia útil.",
          "Personalize: nome do cliente, documento e valor de cada um.",
          "Comece pelos tons amigável e neutro. Mensagem agressiva gera mais denúncia.",
          "Responda quem responde. Conversa nos dois sentidos é o contrário de spam.",
          "Tire da lista os números errados: quem não é o devedor e recebe cobrança denuncia.",
          "Complete o perfil: nome da empresa, foto e descrição.",
        ],
      },
      {
        titulo: "Sinais de alerta",
        lista: [
          "Muitas mensagens ficam com um tique só (não entregues).",
          "Vários clientes deixam de responder de uma vez ou dizem que não reconhecem o número.",
          "O aplicativo mostra aviso de restrição ou pede para confirmar o número de novo.",
        ],
        fecho:
          "Diante de qualquer um desses sinais, pare os envios em volume por alguns dias e volte com menos mensagens por dia.",
      },
      {
        titulo: "Se o número for bloqueado",
        paragrafos: [
          "O próprio aplicativo mostra a opção de pedir uma análise do bloqueio. Explique que o número é de uma empresa e que as mensagens são para clientes dela. Se o número voltar, recomece com volume baixo, como num número novo.",
        ],
      },
    ],
    noNcFinance: [
      "Limite diário de mensagens escolhido por você, que vale para todo envio: um a um, em lote e automático, em qualquer plano.",
      "Opção \"Meu número é novo\": aquecimento de 30 dias (30, 50, 80, 120 e 200 mensagens por dia). O que passar do limite não sai naquele dia.",
      "Títulos do mesmo cliente vão juntos numa mensagem só, e ela conta uma vez no limite.",
      "Aviso na Carteira e no envio em lote com quantas mensagens ainda podem sair hoje.",
      "As regras automáticas não cobram o mesmo cliente duas vezes em menos de 20 horas.",
      "A cobrança sai do número da sua empresa, assinada com o nome dela.",
    ],
    perguntas: [
      {
        pergunta: "Quantas mensagens posso mandar por dia no WhatsApp sem ser bloqueado?",
        resposta:
          "O WhatsApp não publica esse número para o aplicativo comum ou Business. Depende do histórico do número e das denúncias. Num número novo, comece com cerca de 30 mensagens por dia e aumente aos poucos; num número antigo, que já conversa com os clientes, o volume pode ser maior, sem picos bruscos.",
      },
      {
        pergunta: "O WhatsApp Business evita o bloqueio?",
        resposta:
          "Não evita, mas ajuda: o perfil com nome, foto e descrição da empresa faz o cliente reconhecer quem está cobrando, e isso reduz denúncias. As regras de volume e de denúncia valem do mesmo jeito.",
      },
      {
        pergunta: "Mandar a mesma mensagem para todos dá bloqueio?",
        resposta:
          "Aumenta o risco. Texto idêntico para muita gente parece disparo em massa. Use um modelo, mas com o nome, o documento e o valor de cada cliente.",
      },
      {
        pergunta: "Meu número foi bloqueado. E agora?",
        resposta:
          "Peça a análise pelo próprio aplicativo, explicando que é um número de empresa falando com os próprios clientes. Se ele voltar, recomece com poucas mensagens por dia e suba aos poucos.",
      },
    ],
  },
  {
    slug: "o-que-a-lei-permite-na-cobranca-de-clientes",
    titulo: "O que a lei permite (e proíbe) na cobrança de clientes",
    tituloSeo: "Cobrança de clientes: o que a lei permite e proíbe (CDC e LGPD)",
    descricao:
      "O que pode e o que não pode na cobrança de dívidas pelo WhatsApp, telefone ou e-mail: Código de Defesa do Consumidor, LGPD, negativação, protesto e cobrança indevida.",
    resumo:
      "Cobrar uma dívida é direito de quem vendeu, e pode ser feito pelo WhatsApp. A lei proíbe a forma abusiva: expor o devedor ao ridículo, constranger, ameaçar, mentir ou atrapalhar o trabalho, o descanso ou o lazer dele " +
      "(artigos 42 e 71 do Código de Defesa do Consumidor). Os dados do cliente podem ser usados para cobrar, pela LGPD, mas só para isso e sem passar a terceiros. " +
      "Quem cobra valor que não é devido pode ter de devolver o dobro do que recebeu a mais.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "O que pode",
        lista: [
          "Cobrar pelo WhatsApp, telefone, e-mail ou carta, direto com o devedor.",
          "Mandar lembretes antes e depois do vencimento, em intervalos razoáveis.",
          "Cobrar multa e juros previstos no contrato ou no boleto (em relação de consumo, multa de no máximo 2%, pelo artigo 52, §1º, do CDC).",
          "Propor acordo, desconto ou parcelamento.",
          "Avisar dos próximos passos que você vai mesmo tomar: protesto do título, inclusão em cadastro de inadimplentes ou ação judicial.",
          "Contratar uma empresa de cobrança, que deve seguir as mesmas regras.",
        ],
      },
      {
        titulo: "O que não pode",
        paragrafos: [
          "O artigo 42 do Código de Defesa do Consumidor diz que, na cobrança, o consumidor inadimplente não será exposto a ridículo, nem submetido a constrangimento ou ameaça. " +
            "O artigo 71 torna crime (detenção de 3 meses a 1 ano e multa) cobrar com ameaça, coação, constrangimento físico ou moral, afirmações falsas, incorretas ou enganosas, " +
            "ou de qualquer outro jeito que exponha o consumidor ao ridículo ou interfira com o trabalho, o descanso ou o lazer dele. Na prática:",
        ],
        lista: [
          "Cobrar em grupo, no status, em rede social ou em qualquer lugar que outras pessoas vejam.",
          "Contar da dívida para parentes, vizinhos, colegas ou o chefe do devedor.",
          "Ligar ou mandar mensagem várias vezes por dia, de madrugada, no fim de semana ou no feriado.",
          "Ameaçar com prisão, polícia ou qualquer consequência que a lei não prevê ou que você não vai aplicar.",
          "Dizer que o nome já está negativado, ou que haverá processo, quando não for verdade.",
          "Usar palavras ofensivas, ironia ou tom de humilhação.",
        ],
      },
      {
        titulo: "Identificação de quem cobra",
        paragrafos: [
          "O artigo 42-A do CDC exige que todo documento de cobrança apresentado ao consumidor traga o nome, o endereço e o CPF ou CNPJ de quem cobra. O boleto normalmente já traz esses dados. " +
            "Se você cobra só com chave Pix, sem boleto, vale colocá-los na mensagem. E em toda mensagem diga o nome da empresa: cobrança anônima não é paga e ainda é denunciada.",
        ],
      },
      {
        titulo: "Dados do cliente e LGPD",
        paragrafos: [
          "A Lei Geral de Proteção de Dados (Lei 13.709/2018) permite usar os dados do cliente para cobrar: é a execução do contrato e a proteção do crédito (artigo 7º, incisos V e X). Mas:",
        ],
        lista: [
          "Use o telefone e os dados da dívida só para a cobrança daquela relação, e não para propaganda.",
          "Não compartilhe a lista de devedores com quem não faz parte da cobrança.",
          "Guarde os dados com segurança e só pelo tempo necessário.",
          "Se o cliente pedir para não ser contatado por um canal, registre o pedido e passe a cobrar por outro.",
        ],
      },
      {
        titulo: "Negativação e protesto",
        lista: [
          "Antes de o nome entrar em cadastro de inadimplentes (SPC, Serasa), o consumidor tem de ser avisado por escrito (artigo 43, §2º, do CDC). Esse aviso cabe ao próprio birô de crédito (Súmula 359 do STJ).",
          "Depois do pagamento total, quem negativou tem 5 dias úteis para pedir a retirada do nome (Súmula 548 do STJ).",
          "A informação negativa não pode ficar no cadastro por mais de 5 anos (artigo 43, §1º, do CDC).",
          "O protesto do título é feito em cartório (Lei 9.492/1997) e também serve como prova do atraso.",
        ],
      },
      {
        titulo: "Cobrou errado? Cuidado com a devolução em dobro",
        paragrafos: [
          "Pelo parágrafo único do artigo 42 do CDC, o consumidor cobrado em valor indevido tem direito a receber de volta o dobro do que pagou a mais, com correção e juros, salvo engano justificável. " +
            "Por isso, confira os pagamentos antes de cada rodada de cobrança e pare de cobrar na hora em que o cliente mandar o comprovante.",
        ],
      },
      {
        titulo: "E quando o devedor é outra empresa?",
        paragrafos: [
          "Entre empresas, o CDC em geral não se aplica, e vale o que o contrato diz sobre multa e juros. Mas expor ou ameaçar continua proibido: ameaça é crime para qualquer um (artigo 147 do Código Penal), e a exposição pode gerar indenização por dano moral, também para empresa.",
        ],
      },
    ],
    noNcFinance: [
      "Cada mensagem vai só para o devedor, do WhatsApp da sua empresa e assinada com o nome dela.",
      "Os envios automáticos saem às 8h, e o mesmo cliente não é cobrado duas vezes em menos de 20 horas.",
      "Título pago não é cobrado, e o relatório de pagos importado dá baixa nos títulos.",
      "Lista \"Não contatar\": o cliente marcado não recebe mais mensagens, em nenhum tipo de envio.",
      "Os dados de cada conta ficam separados: cada empresa só vê os próprios clientes.",
    ],
    perguntas: [
      {
        pergunta: "Cobrar pelo WhatsApp é legal?",
        resposta:
          "Sim. Nenhuma lei proíbe o canal. O que a lei proíbe é a cobrança abusiva: expor, constranger, ameaçar, mentir ou atrapalhar o trabalho, o descanso ou o lazer do devedor (artigos 42 e 71 do Código de Defesa do Consumidor).",
      },
      {
        pergunta: "Posso cobrar no grupo ou mandar mensagem para um parente do devedor?",
        resposta:
          "Não. Isso expõe o devedor a terceiros, o que o artigo 42 do CDC proíbe e o artigo 71 trata como crime. A cobrança deve ser feita só com o próprio devedor.",
      },
      {
        pergunta: "Existe horário proibido para cobrar?",
        resposta:
          "Não há horário fixado em lei federal, mas o artigo 71 do CDC proíbe a cobrança que interfira com o trabalho, o descanso ou o lazer do consumidor. Na prática, cobre em dia útil e em horário comercial.",
      },
      {
        pergunta: "Posso dizer que vou negativar o nome do cliente?",
        resposta:
          "Pode, se for verdade e se você for mesmo fazer isso. O consumidor precisa ser avisado por escrito antes de entrar no cadastro (artigo 43, §2º, do CDC), e esse aviso é feito pelo birô de crédito. Usar a negativação só como ameaça pode ser visto como constrangimento.",
      },
      {
        pergunta: "O que acontece se eu cobrar um valor que o cliente já pagou?",
        resposta:
          "Se ele pagar de novo, pode exigir a devolução em dobro do que pagou a mais, com correção e juros, salvo engano justificável (parágrafo único do artigo 42 do CDC). E a cobrança indevida pode gerar indenização por dano moral.",
      },
    ],
  },
  {
    slug: "regua-de-cobranca",
    titulo: "Régua de cobrança: o que é e como montar a sua",
    tituloSeo: "Régua de cobrança: o que é, exemplo e como montar",
    descricao:
      "O que é régua de cobrança, um exemplo pronto do lembrete antes do vencimento ao aviso formal, como montar a sua e quando parar de cobrar.",
    resumo:
      "Régua de cobrança é a sequência planejada de contatos com o cliente, marcada em dias antes e depois do vencimento, em que cada etapa tem um canal e um tom. " +
      "Um exemplo simples: lembrete 3 dias antes, aviso no dia, mensagem amigável logo após o vencimento, neutra com uma semana, firme com duas semanas e um aviso formal com um mês de atraso. " +
      "A régua para assim que o cliente paga, negocia ou pede para não ser contatado por aquele canal.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Por que ter uma régua",
        lista: [
          "Ninguém fica sem cobrança por esquecimento, e ninguém é cobrado demais.",
          "O tom sobe aos poucos: o bom cliente que atrasou não é tratado como caloteiro.",
          "A equipe sabe o que fazer em cada dia, sem depender de quem lembra.",
          "Dá para medir em que etapa as pessoas pagam e ajustar.",
        ],
      },
      {
        titulo: "Exemplo de régua",
        paragrafos: [
          "Ponto de partida para quem vende a prazo com boleto ou Pix. D-3 quer dizer 3 dias antes do vencimento; D+7, 7 dias depois.",
        ],
        rotuloModelo: "Régua",
        modelo:
          "D-3 · Lembrete com o boleto (tom amigável)\n" +
          "D0 · Aviso de vencimento hoje\n" +
          "D+3 · Não identificamos o pagamento (amigável)\n" +
          "D+7 · Valor atualizado e convite para negociar (neutro)\n" +
          "D+15 · Prazo para regularizar (firme)\n" +
          "D+30 · Aviso formal com o próximo passo do contrato\n" +
          "D+45 · Protesto, negativação ou cobrança judicial, se for o caso",
        fecho:
          "Se o vencimento cair em fim de semana ou feriado, o cliente pode pagar no primeiro dia útil seguinte sem juros (Lei 7.089/1983): conte o atraso a partir daí.",
      },
      {
        titulo: "Como montar a sua",
        numerada: true,
        lista: [
          "Separe os clientes: valor em aberto, pessoa física ou empresa, quem costuma atrasar e quem nunca atrasa.",
          "Defina as etapas e os dias. Menos etapas, bem espaçadas, funcionam melhor do que mensagem todo dia.",
          "Escreva a mensagem de cada etapa: quem cobra, qual título, valor atualizado, vencimento, boleto ou Pix e como negociar.",
          "Defina quando parar: pagou, mandou comprovante, entrou em negociação ou pediu para não ser contatado.",
          "Acompanhe quantos pagam em cada etapa e ajuste os dias e os textos.",
        ],
      },
      {
        titulo: "Erros comuns",
        lista: [
          "Continuar cobrando quem já pagou: confira os pagamentos antes de cada etapa.",
          "Mandar a régua inteira para quem está negociando.",
          "Pular do lembrete direto para a ameaça.",
          "Prometer protesto ou negativação e não fazer: a régua perde a força.",
          "Mandar tudo no mesmo horário, para centenas de clientes de uma vez, de um número novo.",
        ],
      },
    ],
    noNcFinance: [
      "Regras automáticas (planos Pro e Premium) de três tipos: X dias antes do vencimento, no dia do vencimento e vencidos.",
      "Cada regra tem o seu tom (amigável, neutro, firme ou jurídico) ou um texto próprio.",
      "A regra pode rodar só em dias úteis e pular feriados nacionais; no Premium, também tem janela de horário e limite de envios por dia.",
      "O mesmo cliente não é cobrado duas vezes em menos de 20 horas, e títulos do mesmo cliente vão numa mensagem só.",
      "Quem está em negociação fica fora da automação; título pago ou na lista \"Não contatar\" não recebe mensagem.",
      "O valor da mensagem é o atualizado do dia, com multa e juros.",
    ],
    perguntas: [
      {
        pergunta: "O que é régua de cobrança?",
        resposta:
          "É a sequência planejada de contatos de cobrança, marcada em dias antes e depois do vencimento (D-3, D0, D+7…), em que cada etapa tem um canal e um tom. Serve para cobrar todo mundo no momento certo, sem esquecer ninguém e sem exagerar.",
      },
      {
        pergunta: "Quantas etapas a régua deve ter?",
        resposta:
          "Para a maioria dos negócios, de 4 a 7: um lembrete antes do vencimento, um aviso no dia e de 2 a 5 mensagens depois, espaçadas em dias. Mais do que isso tende a irritar o cliente e aumentar as denúncias do número.",
      },
      {
        pergunta: "A régua para empresas é diferente da régua para pessoas físicas?",
        resposta:
          "Costuma ser. Empresas têm setor financeiro, prazos de aprovação e datas fixas de pagamento: vale falar com o responsável pelo contas a pagar e dar mais tempo entre as etapas. Com pessoa física, valem os limites do Código de Defesa do Consumidor, como a multa de no máximo 2%.",
      },
      {
        pergunta: "Quando parar a régua?",
        resposta:
          "Quando o cliente paga ou manda o comprovante, quando entra em negociação (aí vale o que foi combinado) e quando pede para não ser contatado por aquele canal. Cobrar quem já pagou pode obrigar a devolver em dobro o que ele pagar a mais (artigo 42 do CDC).",
      },
    ],
  },
  {
    slug: "como-cobrar-cliente-que-nao-responde",
    titulo: "Como cobrar cliente que não responde",
    tituloSeo: "Cliente não responde a cobrança? O que fazer, passo a passo",
    descricao:
      "O que fazer quando o cliente some e não responde a cobrança: conferir o contato, mudar a mensagem e o canal, oferecer saídas e, por fim, notificação, protesto ou Juizado.",
    resumo:
      "Quando o cliente não responde, primeiro confira se o número e a pessoa estão certos e se a mensagem diz quem cobra. Depois mande uma mensagem curta, com uma pergunta fácil de responder e uma saída concreta " +
      "(nova data, parcelamento ou desconto à vista), e tente outro canal e outro horário. Sem resposta depois de algumas tentativas espaçadas, parta para os passos formais: notificação por escrito, protesto, negativação ou o Juizado Especial Cível.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Por que o cliente some",
        lista: [
          "O número está errado ou é de outra pessoa da empresa.",
          "Ele não reconheceu quem mandou e ignorou a mensagem.",
          "Não tem o dinheiro agora e tem vergonha de dizer.",
          "Discorda do valor ou do serviço e está esperando você desistir.",
          "Recebeu tantas mensagens que parou de ler.",
        ],
        fecho: "Cada motivo pede uma resposta diferente. Por isso, o primeiro passo é conferir o básico.",
      },
      {
        titulo: "Confira antes de insistir",
        lista: [
          "O telefone é do responsável pelo pagamento? Confirme no cadastro, no contrato ou na nota.",
          "A mensagem foi entregue? Um tique só por dias costuma ser número errado ou fora de uso.",
          "A primeira linha diz o nome da sua empresa?",
          "O valor e o documento estão certos? Cobrança errada faz o cliente sumir.",
        ],
      },
      {
        titulo: "O que fazer, nesta ordem",
        numerada: true,
        lista: [
          "Mande uma mensagem curta, com uma pergunta simples de responder.",
          "Ofereça saídas concretas: nova data, parcelamento ou desconto para pagamento à vista.",
          "Mude o horário e o dia do contato.",
          "Mude o canal: ligação, e-mail ou carta.",
          "Espace as tentativas. Insistir todo dia aumenta a resistência e as denúncias do número.",
        ],
        rotuloModelo: "Modelo para quem não responde",
        modelo:
          "[Nome], aqui é o financeiro da [Empresa].\n" +
          "Tentei falar sobre o documento [número], de R$ [valor], e não tive retorno.\n\n" +
          "Consigo te ajudar de três jeitos:\n" +
          "1. pagar até [data] pelo boleto: [link]\n" +
          "2. parcelar em [quantidade] vezes\n" +
          "3. combinar outra data\n\n" +
          "É só responder com o número da opção.",
      },
      {
        titulo: "Esgotou as tentativas? Os passos formais",
        lista: [
          "Notificação por escrito: carta com aviso de recebimento ou notificação extrajudicial pelo cartório. Registra a cobrança e dá um prazo final.",
          "Protesto do título em cartório (Lei 9.492/1997): é prova do atraso e costuma fazer o devedor procurar você.",
          "Negativação em SPC ou Serasa: o consumidor precisa ser avisado por escrito antes (artigo 43, §2º, do CDC), e o aviso é feito pelo birô de crédito.",
          "Juizado Especial Cível (Lei 9.099/1995): para causas de até 40 salários mínimos; até 20, sem advogado. Empresa só pode entrar como autora se for microempresa ou empresa de pequeno porte.",
        ],
        fecho:
          "Não demore demais: a cobrança na Justiça de dívida que consta de contrato ou outro documento prescreve em 5 anos (artigo 206, §5º, inciso I, do Código Civil).",
      },
      {
        titulo: "O que não fazer",
        lista: [
          "Procurar o devedor por parentes, colegas ou pelo chefe dele: isso o expõe, e o artigo 42 do CDC proíbe.",
          "Cobrar em público, em grupo ou em comentário de rede social.",
          "Ameaçar com o que você não vai fazer ou com o que a lei não permite.",
          "Mandar várias mensagens no mesmo dia.",
        ],
      },
    ],
    noNcFinance: [
      "Importa os telefones de uma agenda (.vcf do iPhone ou Android) ou de uma planilha e casa com os clientes pelo nome, para corrigir números errados.",
      "Quatro tons de mensagem, e o texto pode ser ajustado antes de enviar.",
      "Cliente em negociação fica fora do lote e da automação; o cliente marcado em \"Não contatar\" não recebe mais mensagens.",
      "Histórico de envios, para ver quem já foi cobrado e quando.",
      "As regras automáticas não cobram o mesmo cliente duas vezes em menos de 20 horas.",
    ],
    perguntas: [
      {
        pergunta: "Quantas vezes devo tentar antes de partir para o protesto ou a negativação?",
        resposta:
          "Não há número fixo. Na prática, de 4 a 6 contatos espaçados ao longo de 3 a 6 semanas, mudando o tom, o canal e o horário, já mostram se o cliente vai responder. Depois disso, os passos formais costumam funcionar melhor do que mais mensagens.",
      },
      {
        pergunta: "Posso ligar para o trabalho ou para um parente do devedor?",
        resposta:
          "Para parentes, colegas ou o chefe, não: expor a dívida a terceiros é proibido pelo artigo 42 do CDC e pode ser crime (artigo 71). O contato deve ser feito só com o próprio devedor, sem atrapalhar o trabalho dele.",
      },
      {
        pergunta: "O que é notificação extrajudicial?",
        resposta:
          "É um aviso formal por escrito, enviado por carta com aviso de recebimento ou pelo cartório de títulos e documentos, dizendo o que é devido e o prazo para pagar. Não é processo, mas registra a cobrança e costuma ser o último passo antes do protesto ou da ação.",
      },
      {
        pergunta: "Vale a pena entrar no Juizado Especial Cível?",
        resposta:
          "Para dívidas de até 40 salários mínimos, o Juizado é o caminho mais simples e barato (Lei 9.099/1995); até 20 salários mínimos, nem é preciso advogado. Como autora, a empresa precisa ser microempresa ou empresa de pequeno porte.",
      },
    ],
  },
  {
    slug: "como-cobrar-empresa-cliente-pj",
    titulo: "Como cobrar uma empresa que está em atraso",
    tituloSeo: "Como cobrar empresa (cliente PJ) em atraso: passo a passo",
    descricao:
      "Como cobrar outra empresa em atraso: com quem falar, o que conferir, modelo de mensagem, juros e multa entre empresas, protesto de duplicata, execução e ação monitória.",
    resumo:
      "Para cobrar uma empresa, fale com o contas a pagar e não só com o comprador, confira se a nota e o boleto chegaram a quem paga e respeite o ciclo de pagamento dela. " +
      "Entre empresas, em geral não vale o Código de Defesa do Consumidor: multa e juros seguem o contrato. Se não houver pagamento, a duplicata pode ser protestada, " +
      "e a duplicata protestada com o comprovante de entrega da mercadoria vale como título executivo (artigo 15 da Lei 5.474/1968).",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Confira antes de cobrar",
        lista: [
          "A nota fiscal e o boleto chegaram ao setor que paga, e não só ao comprador?",
          "O cliente exige número de pedido de compra na nota? Sem ele, muitas empresas não lançam o pagamento.",
          "Os dados da nota (CNPJ, endereço, valor) estão certos?",
          "O vencimento respeita o prazo combinado e o dia de pagamento da empresa?",
        ],
        fecho: "Boa parte do atraso entre empresas é nota que não foi lançada, e não falta de dinheiro.",
      },
      {
        titulo: "Com quem falar",
        lista: [
          "Contas a pagar ou financeiro: é quem libera o pagamento.",
          "O comprador ou quem pediu o produto ou serviço: ajuda a destravar a aprovação interna.",
          "O sócio ou o dono, em empresa pequena e em atraso longo.",
        ],
      },
      {
        titulo: "Modelo de mensagem para empresa",
        modelo:
          "Olá, [Nome], aqui é o financeiro da [Empresa].\n" +
          "Consta em aberto a nota [número], com vencimento em [data], no valor de R$ [valor].\n\n" +
          "Boleto: [link]\n" +
          "Se a nota não chegou ou falta algum dado para o lançamento (pedido de compra, centro de custo), me avise que eu reenvio hoje.\n\n" +
          "Obrigado,\n" +
          "Financeiro [Empresa]",
      },
      {
        titulo: "Juros e multa entre empresas",
        paragrafos: [
          "Entre empresas, em geral não se aplica o Código de Defesa do Consumidor (a exceção é a empresa que compra como destinatária final e em situação de vulnerabilidade). " +
            "Por isso, o limite de 2% de multa do CDC não vale: vale o que o contrato diz. Mas a multa não pode passar do valor da dívida (artigo 412 do Código Civil), e o juiz pode reduzir uma multa excessiva (artigo 413).",
        ],
      },
      {
        titulo: "Se não pagar: protesto, execução e ação monitória",
        lista: [
          "Protesto da duplicata em cartório (Lei 9.492/1997 e Lei 5.474/1968): avisa o mercado e costuma resolver rápido.",
          "Negativação do CNPJ em birôs de crédito.",
          "Execução: a duplicata aceita, ou a não aceita que foi protestada e tem o comprovante de entrega da mercadoria ou da prestação do serviço, é título executivo (artigo 15 da Lei 5.474/1968). A execução é mais rápida do que um processo comum.",
          "Ação monitória (artigo 700 do Código de Processo Civil): para quem tem prova escrita da dívida, como e-mails, pedidos e notas, mas não tem um título executivo.",
        ],
      },
      {
        titulo: "Cuidado com a exposição",
        paragrafos: [
          "Empresa também pode sofrer dano moral (Súmula 227 do STJ). Expor o devedor em rede social, em grupo do setor ou para os clientes dele pode gerar indenização. Cobre de forma privada, com quem decide o pagamento.",
        ],
      },
    ],
    noNcFinance: [
      "Cobradores: você define quem cobra cada cliente, e a Carteira tem uma aba por cobrador.",
      "Títulos do mesmo cliente vão juntos numa mensagem só, com o vencimento mais antigo primeiro.",
      "O boleto em PDF vai como link na própria mensagem.",
      "Importa a carteira de Excel, CSV, PDF, TXT, foto do relatório ou Google Sheets, e o relatório de pagos dá baixa nos títulos.",
      "Quatro tons de mensagem, do amigável ao jurídico, assinados com o nome da sua empresa.",
    ],
    perguntas: [
      {
        pergunta: "O Código de Defesa do Consumidor vale na cobrança entre empresas?",
        resposta:
          "Em geral, não. O CDC protege o consumidor, e a empresa que compra para usar no próprio negócio normalmente não é consumidora. A exceção é a empresa que compra como destinatária final e está em situação de vulnerabilidade. Fora disso, vale o contrato e o Código Civil.",
      },
      {
        pergunta: "Qual a multa máxima por atraso entre empresas?",
        resposta:
          "Vale o que o contrato diz. O limite de 2% do CDC não se aplica, mas a multa não pode passar do valor da dívida (artigo 412 do Código Civil), e o juiz pode reduzi-la se for excessiva (artigo 413).",
      },
      {
        pergunta: "Como protestar uma duplicata?",
        resposta:
          "Leve o título ou a indicação da duplicata ao cartório de protesto da praça de pagamento (Lei 9.492/1997). O cartório intima o devedor, que tem um prazo para pagar. Sem pagamento, o título é protestado. Muitos bancos e sistemas de cobrança também enviam o boleto vencido a protesto.",
      },
      {
        pergunta: "Posso negativar o CNPJ de um cliente?",
        resposta:
          "Pode, se a dívida for certa e estiver vencida. A inclusão é feita pelos birôs de crédito, que avisam o devedor antes. Depois do pagamento, peça a retirada do registro.",
      },
    ],
  },
  {
    slug: "acordo-de-pagamento-com-cliente-inadimplente",
    titulo: "Como fazer acordo de pagamento com cliente inadimplente",
    tituloSeo: "Acordo de pagamento com cliente inadimplente: como fazer",
    descricao:
      "Como negociar e formalizar um acordo de pagamento com cliente em atraso: o que oferecer, o que o acordo precisa ter, confissão de dívida e o que fazer se ele não cumprir.",
    resumo:
      "Para fazer um acordo com cliente inadimplente, ofereça poucas opções claras (pagamento à vista com desconto, entrada mais parcelas ou nova data), feche valores e datas por escrito e mande o boleto ou o Pix de cada parcela. " +
      "O acordo deve dizer o valor total, as parcelas, os vencimentos e o que acontece se uma parcela atrasar. Assinado pelo devedor e por duas testemunhas, ou por assinatura eletrônica conferida por provedor, o termo de confissão de dívida vale como título executivo (artigo 784, inciso III e §4º, do Código de Processo Civil).",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Antes de negociar",
        lista: [
          "Saiba o valor atualizado, com multa e juros, e quanto você aceita receber no mínimo.",
          "Defina o desconto máximo para pagamento à vista e o número máximo de parcelas.",
          "Pergunte quanto o cliente consegue pagar por mês: acordo que não cabe no bolso dele vira novo atraso.",
        ],
      },
      {
        titulo: "O que oferecer",
        lista: [
          "À vista com desconto: tira os juros ou parte da multa para receber tudo agora.",
          "Entrada mais parcelas: a entrada mostra o compromisso do cliente.",
          "Nova data: para quem só precisa de alguns dias.",
        ],
        fecho:
          "Ofereça duas ou três opções, não mais. Pergunta aberta (\"quanto você pode pagar?\") costuma terminar em proposta baixa.",
      },
      {
        titulo: "O que o acordo precisa ter",
        lista: [
          "Nome e CPF ou CNPJ das duas partes.",
          "A dívida original: documentos, vencimentos e valores.",
          "O valor total do acordo, a entrada, o número de parcelas, o valor e o vencimento de cada uma.",
          "Como pagar: boleto, Pix ou cartão.",
          "O que acontece se uma parcela atrasar: por exemplo, vencimento antecipado do restante, com multa e juros.",
          "Que, pago o acordo, a dívida fica quitada.",
        ],
        rotuloModelo: "Modelo de confirmação pelo WhatsApp",
        modelo:
          "[Nome], confirmando nosso acordo para o documento [número]:\n\n" +
          "Total: R$ [valor]\n" +
          "Entrada: R$ [valor] até [data]\n" +
          "Restante: [quantidade] parcelas de R$ [valor], todo dia [dia]\n\n" +
          "Se alguma parcela atrasar mais de [dias] dias, o saldo vence de uma vez, com multa e juros.\n" +
          "Responda \"de acordo\" para confirmar que eu mando os boletos.",
      },
      {
        titulo: "Confissão de dívida: quando vale a pena",
        paragrafos: [
          "Para valores maiores, formalize num termo de confissão de dívida. Assinado pelo devedor e por duas testemunhas, ele é título executivo extrajudicial (artigo 784, inciso III, do CPC): se o cliente não pagar, você pode ir direto à execução, sem precisar provar a dívida num processo comum.",
          "Termo assinado eletronicamente também vale, e dispensa as testemunhas quando a integridade da assinatura é conferida por um provedor de assinatura (artigo 784, §4º, do CPC).",
        ],
      },
      {
        titulo: "Se o cliente não cumprir",
        numerada: true,
        lista: [
          "Cobre a parcela atrasada como qualquer título vencido, começando pelo tom amigável.",
          "Se o acordo prevê vencimento antecipado, avise por escrito que o saldo venceu.",
          "Com termo de confissão de dívida, a execução pode ser proposta direto. Sem ele, valem protesto, negativação e o Juizado Especial Cível.",
        ],
      },
    ],
    noNcFinance: [
      "Tipo \"Em negociação\": o título continua correndo multa e juros, mas sai do lote, do \"Enviar todos\" e da automação, e só recebe mensagem enviada um a um.",
      "Valor e vencimento podem ser editados direto na Carteira, para registrar as novas datas.",
      "Cada título aceita o boleto em PDF, que vai como link na mensagem.",
      "O valor atualizado do título aparece no painel, para saber de onde partir na negociação.",
    ],
    perguntas: [
      {
        pergunta: "Posso dar desconto nos juros e na multa para fechar o acordo?",
        resposta:
          "Pode. Multa e juros são direitos de quem cobra, e abrir mão de parte deles é decisão sua. Desconto para pagamento à vista costuma ser o jeito mais rápido de receber.",
      },
      {
        pergunta: "Acordo pelo WhatsApp tem validade?",
        resposta:
          "Sim, a conversa é prova escrita do que foi combinado. Para dar mais força, peça a confirmação do cliente na própria mensagem e guarde a conversa. Para valores maiores, prefira um termo de confissão de dívida assinado, que é título executivo.",
      },
      {
        pergunta: "O que é confissão de dívida?",
        resposta:
          "É um documento em que o devedor reconhece quanto deve e se compromete a pagar nas condições combinadas. Assinado pelo devedor e por duas testemunhas, ou eletronicamente com conferência por provedor de assinatura, vale como título executivo (artigo 784, III e §4º, do CPC).",
      },
      {
        pergunta: "Quantas parcelas oferecer?",
        resposta:
          "Depende do valor e do cliente, mas acordos curtos são cumpridos com mais frequência. Defina um teto antes de negociar e prefira parcelas que caibam no orçamento do cliente, com entrada.",
      },
    ],
  },
  {
    slug: "como-reduzir-inadimplencia",
    titulo: "Como reduzir a inadimplência dos clientes",
    tituloSeo: "Como reduzir a inadimplência: 10 práticas que funcionam",
    descricao:
      "Práticas para reduzir a inadimplência antes e depois do vencimento: análise de crédito, contrato claro, lembrete antes de vencer, meios de pagamento e régua de cobrança.",
    resumo:
      "A inadimplência cai quando a empresa age antes do vencimento, e não só depois: vende a prazo com critério, deixa multa, juros e datas claras no contrato, " +
      "manda um lembrete com o boleto ou o Pix alguns dias antes de vencer e facilita o pagamento. Depois do vencimento, uma régua de cobrança com tom que sobe aos poucos recupera a maior parte dos atrasos curtos.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "Antes da venda",
        numerada: true,
        lista: [
          "Consulte o CPF ou CNPJ antes de vender a prazo para cliente novo.",
          "Defina um limite de crédito por cliente e aumente conforme o histórico.",
          "Peça entrada nas vendas maiores.",
          "Deixe no contrato ou no pedido: vencimentos, multa, juros e o que acontece no atraso.",
        ],
      },
      {
        titulo: "Antes do vencimento",
        numerada: true,
        lista: [
          "Mande o boleto ou o Pix junto com a nota, para o setor que paga.",
          "Mande um lembrete 2 ou 3 dias antes de vencer: boa parte dos atrasos é esquecimento.",
          "Ofereça mais de um meio de pagamento: Pix, boleto e cartão.",
        ],
      },
      {
        titulo: "Depois do vencimento",
        numerada: true,
        lista: [
          "Cobre logo nos primeiros dias, com tom amigável: quanto mais tempo passa, menor a chance de receber.",
          "Siga uma régua de cobrança, com o tom subindo aos poucos e um passo formal no fim.",
          "Confira os pagamentos antes de cada rodada, para não cobrar quem já pagou.",
        ],
      },
      {
        titulo: "Acompanhe os números",
        paragrafos: [
          "Meça a taxa de inadimplência (valor vencido e não pago dividido pelo total que venceu no período) todo mês, e veja em que etapa da régua as pessoas pagam. " +
            "Cliente que atrasa sempre merece limite menor ou pagamento antecipado.",
        ],
      },
    ],
    noNcFinance: [
      "Regras automáticas (planos Pro e Premium) mandam o lembrete \"vencem em X dias\" e cobram os vencidos, cada uma com o seu tom.",
      "O boleto em PDF vai junto da mensagem, como link.",
      "Multa e juros calculados sozinhos, e a mensagem leva o valor atualizado.",
      "O painel mostra o que está em aberto, os vencidos corrigidos e as pendências críticas (atrasos acima do número de dias que você escolhe).",
      "O relatório de pagos importado dá baixa nos títulos, e quem pagou não é mais cobrado.",
    ],
    perguntas: [
      {
        pergunta: "O que mais reduz a inadimplência?",
        resposta:
          "Agir antes do vencimento: vender a prazo com critério e mandar um lembrete com o boleto ou o Pix alguns dias antes de vencer. Depois do vencimento, cobrar logo nos primeiros dias faz mais diferença do que cobrar com mais força mais tarde.",
      },
      {
        pergunta: "Vale a pena dar desconto para pagamento em dia?",
        resposta:
          "Pode valer, se a margem permitir: o desconto de pontualidade incentiva o pagamento até o vencimento. Ele precisa estar claro no boleto ou no contrato.",
      },
      {
        pergunta: "Lembrete antes do vencimento incomoda o cliente?",
        resposta:
          "Uma mensagem só, educada e com o boleto, costuma ser bem recebida: é um favor, e não uma cobrança. O que incomoda é repetir o lembrete ou mandar fora do horário comercial.",
      },
    ],
  },
  {
    slug: "taxa-de-inadimplencia-como-calcular",
    titulo: "Taxa de inadimplência: o que é e como calcular",
    tituloSeo: "Taxa de inadimplência: o que é, fórmula e exemplo",
    descricao:
      "O que é a taxa de inadimplência, a fórmula com exemplo, a diferença para a taxa de recuperação e como acompanhar esses números todo mês.",
    resumo:
      "Taxa de inadimplência é a parte do que venceu num período que não foi paga. Fórmula: valor vencido e não pago ÷ valor total que venceu no período × 100. " +
      "Exemplo: se venceram R$ 50.000,00 em março e R$ 4.000,00 continuam sem pagamento, a taxa é de 8%. Acompanhe também a taxa de recuperação: quanto do que estava atrasado foi recebido depois.",
    publicadoEm: "2026-11-12",
    atualizadoEm: "2026-11-12",
    secoes: [
      {
        titulo: "A fórmula",
        rotuloModelo: "Fórmula",
        modelo:
          "Taxa de inadimplência = valor vencido e não pago ÷ valor total que venceu no período × 100\n\n" +
          "Exemplo: venceram R$ 50.000,00 em março\n" +
          "Continuam sem pagamento: R$ 4.000,00\n" +
          "Taxa: 4.000 ÷ 50.000 × 100 = 8%",
        fecho:
          "Use sempre o valor original dos títulos, sem multa e juros, para comparar um mês com outro. E defina a data de corte (por exemplo, o dia 10 do mês seguinte) e use sempre a mesma.",
      },
      {
        titulo: "Por valor ou por cliente",
        paragrafos: [
          "A taxa por valor mostra o impacto no caixa. A taxa por cliente (clientes com atraso ÷ clientes com título vencido no período) mostra se o problema está espalhado ou concentrado em poucos clientes grandes. Vale olhar as duas.",
        ],
      },
      {
        titulo: "Taxa de recuperação",
        paragrafos: [
          "Mostra quanto do que atrasou foi recebido depois: valor recebido dos títulos atrasados ÷ valor que estava atrasado no início do período × 100. É o número que diz se a cobrança está funcionando.",
        ],
      },
      {
        titulo: "Outros números que ajudam",
        lista: [
          "Atraso médio: quantos dias, em média, os clientes levam para pagar depois do vencimento.",
          "Inadimplência por faixa de atraso: até 30, de 31 a 60, de 61 a 90 e mais de 90 dias. Quanto mais velha a dívida, menor a chance de receber.",
          "Inadimplência por cliente, vendedor ou cobrador: mostra onde agir primeiro.",
        ],
      },
    ],
    noNcFinance: [
      "O painel mostra o total em aberto, os vencidos corrigidos com multa e juros e as pendências críticas, a partir do número de dias de atraso que você escolhe.",
      "Na visão por cobrador, cada um tem o que está em aberto e o que foi recuperado.",
      "A Carteira separa os títulos por tipo: a vencer, vencidos, em negociação, pagos.",
    ],
    perguntas: [
      {
        pergunta: "Qual é uma taxa de inadimplência normal?",
        resposta:
          "Depende muito do setor, do tipo de cliente e do prazo de venda, e não há um número único. O mais útil é comparar a sua taxa com ela mesma, mês a mês, usando sempre o mesmo critério e a mesma data de corte.",
      },
      {
        pergunta: "Devo incluir multa e juros no cálculo?",
        resposta:
          "Para medir a inadimplência, não: use o valor original dos títulos, para que um mês seja comparável com outro. Multa e juros entram no valor que você cobra, não no indicador.",
      },
      {
        pergunta: "Qual a diferença entre inadimplência e atraso?",
        resposta:
          "Na prática, muitas empresas chamam de atraso o título vencido há poucos dias e de inadimplência o que passou de um prazo (por exemplo, 30 ou 90 dias). Defina o seu corte e use sempre o mesmo.",
      },
    ],
  },
];
