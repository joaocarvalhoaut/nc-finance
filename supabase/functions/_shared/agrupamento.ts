/**
 * agrupamento.ts — vários títulos do mesmo cliente numa mensagem só.
 *
 * Regra do dono: títulos do mesmo cliente (mesmo nome e mesmo WhatsApp) e do
 * MESMO tipo vão juntos — 3 vencidos viram uma mensagem, 3 a vencer viram
 * outra. Tipos diferentes nunca se misturam.
 *
 * Puro (sem Deno/npm): roda no navegador (Preparar envios), nas Edge Functions
 * (lote e automação) e nos testes com tsx — o texto sai igual nos três envios.
 */

import { aplicarEmpresa } from "./assinatura.ts";

/** Tipos que recebem cobrança. Liquidado e desabilitado nunca agrupam. */
const TIPOS_COBRAVEIS = new Set(["vencidos", "a_vencer", "recompra"]);

/**
 * Chave do grupo: nome sem acento/caixa/espaços extras + últimos 8 dígitos do
 * WhatsApp (ignora 55, DDD com ou sem 0 e o nono dígito) + tipo.
 * null = título que não agrupa (sem telefone ou tipo que não é cobrado).
 */
export function chaveDeAgrupamento(nome: string, telefone: string, categoria: string): string | null {
  if (!TIPOS_COBRAVEIS.has(categoria)) return null;
  const fone = (telefone || "").replace(/\D/g, "").slice(-8);
  if (fone.length < 8) return null;
  const n = (nome || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
  if (!n) return null;
  return `${n}|${fone}|${categoria}`;
}

export interface TituloDaMensagem {
  documento:  string;
  vencimento: string; // DD/MM/AAAA
  valor:      number; // valor que vai na mensagem (já atualizado)
  diasAtraso: number;
}

/** 1250.5 → "1.250,50" (sem Intl: o Deno não garante o locale pt-BR). */
export const formatarValor = (valor: number): string => {
  const [int, dec] = valor.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
};

const VAR_DO_TITULO = /\{(documento|documento_boleto|vencimento|valor_atualizado|dias_atraso)\}/;

/** Linha de campo do modelo ("Valor: R$ {valor_atualizado}"): repete por título. */
const ehLinhaDeCampo = (linha: string) =>
  VAR_DO_TITULO.test(linha) && /^[^{:]{1,25}:\s/.test(linha.trim());

const listar = (itens: string[]): string =>
  itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;

const preencherTitulo = (texto: string, t: TituloDaMensagem) =>
  texto
    .replace(/\{documento\}/g, t.documento || "—")
    .replace(/\{documento_boleto\}/g, t.documento || "—")
    .replace(/\{vencimento\}/g, t.vencimento)
    .replace(/\{valor_atualizado\}/g, formatarValor(t.valor))
    .replace(/\{dias_atraso\}/g, String(t.diasAtraso));

// Frases dos modelos prontos no singular → plural, quando vai mais de um título.
const PLURAIS: Array<[RegExp, string]> = [
  [/\b([Oo]) boleto abaixo, que segue\b/g, "$1s boletos abaixo, que seguem"],
  [/\b([Oo]) boleto abaixo\b/g, "$1s boletos abaixo"],
  [/\bdo título abaixo\b/g, "dos títulos abaixo"],
  [/\b([Oo]) título abaixo\b/g, "$1s títulos abaixo"],
  [/\bO título consta\b/g, "Os títulos constam"],
  [/\bO título acumula \{dias_atraso\}/g, "Os títulos acumulam até {dias_atraso}"],
  [/\batraso de \{dias_atraso\}/g, "atraso de até {dias_atraso}"],
  [/\b([Aa]) pendência financeira abaixo\b/g, "$1s pendências financeiras abaixo"],
  [/\b([Aa]) pendência descrita abaixo\b/g, "$1s pendências descritas abaixo"],
  [/\bao documento \{documento\}/g, "aos documentos {documento}"],
];

/**
 * Preenche o modelo para um ou mais títulos do mesmo cliente.
 * Um título: substituição simples, como sempre foi. Vários: o bloco de campos
 * (Documento/Vencimento/Valor…) se repete por título, seguido do total; nas
 * frases, os campos viram a lista de documentos/vencimentos, o total e o maior
 * atraso, e o texto pronto passa para o plural.
 */
export function preencherMensagem(
  modelo: string,
  dados: { nomeCliente: string; titulos: TituloDaMensagem[]; empresa?: string | null },
): string {
  const { titulos } = dados;
  let texto: string;

  if (titulos.length <= 1) {
    texto = preencherTitulo(modelo, titulos[0] ?? { documento: "", vencimento: "", valor: 0, diasAtraso: 0 });
  } else {
    const total = titulos.reduce((s, t) => s + t.valor, 0);
    const agregado: TituloDaMensagem = {
      documento:  listar(titulos.map((t) => t.documento || "—")),
      vencimento: listar([...new Set(titulos.map((t) => t.vencimento))]),
      valor:      total,
      diasAtraso: Math.max(...titulos.map((t) => t.diasAtraso)),
    };

    let modeloPlural = modelo;
    for (const [re, por] of PLURAIS) modeloPlural = modeloPlural.replace(re, por);

    const linhas = modeloPlural.split("\n");
    const saida: string[] = [];
    let blocoFeito = false;
    for (let i = 0; i < linhas.length; i++) {
      if (!blocoFeito && ehLinhaDeCampo(linhas[i])) {
        // Junta as linhas de campo seguidas e repete o bloco por título.
        let fim = i;
        while (fim + 1 < linhas.length && ehLinhaDeCampo(linhas[fim + 1])) fim++;
        const bloco = linhas.slice(i, fim + 1).join("\n");
        saida.push(titulos.map((t) => preencherTitulo(bloco, t)).join("\n\n"));
        saida.push("", `Total: R$ ${formatarValor(total)}`);
        blocoFeito = true;
        i = fim;
      } else {
        saida.push(preencherTitulo(linhas[i], agregado));
      }
    }
    texto = saida.join("\n");
  }

  return aplicarEmpresa(texto.replace(/\{nome_cliente\}/g, dados.nomeCliente || "Cliente"), dados.empresa);
}

/** Linhas com o link do boleto de cada título (o número só aparece se houver mais de um). */
export function linhasDeBoleto(boletos: Array<{ documento: string; url: string }>): string {
  if (boletos.length === 0) return "";
  if (boletos.length === 1) return `📎 Boleto: ${boletos[0].url}`;
  return boletos.map((b) => `📎 Boleto ${b.documento}: ${b.url}`).join("\n");
}
