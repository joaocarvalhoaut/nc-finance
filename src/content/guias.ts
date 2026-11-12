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
];
