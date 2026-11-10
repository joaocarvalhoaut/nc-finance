/**
 * Importar telefones — lê nome + telefone de uma agenda (.vcf, exportada do
 * iPhone ou do Android) ou de uma planilha (Excel/ODS/CSV/TXT) e cruza com os
 * clientes da carteira. Tudo no navegador: o arquivo não sai do aparelho; só
 * o que o usuário confirmar é gravado (telefone no título e na agenda de
 * contatos — user_contatos).
 *
 * Regras puras, sem Supabase: testadas em __tests__/importarTelefones.test.ts.
 */

import type { Debtor } from "../types";
import { contactKeyFromName } from "./contactSync";
import { normalizarDigitosTelefone } from "./localDocumentExtraction/regexExtractors";

export interface ContatoLido {
  nome: string;
  /** Só dígitos, DDD + número (10 ou 11), como o resto do app grava. */
  telefone: string;
}

export interface LeituraDeContatos {
  contatos: ContatoLido[];
  /** Entradas com nome mas sem telefone brasileiro válido. */
  semTelefoneValido: number;
  /** Mesmo nome repetido no arquivo (fica o primeiro). */
  repetidos: number;
}

// ── vCard (.vcf) ─────────────────────────────────────────────────────────────

/** Quoted-printable (vCard 2.1 do Android): "=C3=A7" → "ç", "=" no fim junta linhas. */
function decodificarQP(valor: string): string {
  const bytes: number[] = [];
  const s = valor.replace(/=\r?\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...new TextEncoder().encode(s[i]));
    }
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

const desescapar = (v: string) => v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

/** Linhas lógicas do vCard: desfaz a dobra (linha que começa com espaço/tab continua a anterior). */
function linhasLogicas(texto: string): string[] {
  const brutas = texto.replace(/\r\n?/g, "\n").split("\n");
  const saida: string[] = [];
  for (const l of brutas) {
    if (/^[ \t]/.test(l) && saida.length) saida[saida.length - 1] += l.slice(1);
    // Quoted-printable com "=" no fim também continua na próxima linha.
    else if (saida.length && /ENCODING=QUOTED-PRINTABLE/i.test(saida[saida.length - 1]) && saida[saida.length - 1].endsWith("=")) {
      saida[saida.length - 1] = saida[saida.length - 1].slice(0, -1) + l;
    } else saida.push(l);
  }
  return saida;
}

function valorDaLinha(linha: string): { prop: string; params: string; valor: string } | null {
  const i = linha.indexOf(":");
  if (i < 0) return null;
  const cab = linha.slice(0, i);
  let valor = linha.slice(i + 1);
  const [propBruta, ...params] = cab.split(";");
  const prop = propBruta.replace(/^item\d+\./i, "").toUpperCase();
  const p = params.join(";");
  if (/ENCODING=QUOTED-PRINTABLE/i.test(p)) valor = decodificarQP(valor);
  return { prop, params: p.toUpperCase(), valor };
}

export function lerVcf(texto: string): LeituraDeContatos {
  const brutos: { nome: string; telefones: { numero: string; pref: boolean; celular: boolean }[] }[] = [];
  let atual: (typeof brutos)[number] & { fn?: string; n?: string; org?: string } | null = null;

  for (const linha of linhasLogicas(texto)) {
    const l = valorDaLinha(linha);
    if (!l) continue;
    if (l.prop === "BEGIN" && /VCARD/i.test(l.valor)) { atual = { nome: "", telefones: [] }; continue; }
    if (!atual) continue;
    if (l.prop === "END" && /VCARD/i.test(l.valor)) {
      // N vem como Sobrenome;Nome;Meio;Prefixo;Sufixo.
      const partesN = (atual.n ?? "").split(";").map(desescapar);
      const doN = [partesN[3], partesN[1], partesN[2], partesN[0], partesN[4]].filter(Boolean).join(" ");
      atual.nome = desescapar(atual.fn ?? "") || doN || desescapar((atual.org ?? "").split(";")[0] ?? "");
      brutos.push({ nome: atual.nome, telefones: atual.telefones });
      atual = null;
      continue;
    }
    if (l.prop === "FN") atual.fn = l.valor;
    else if (l.prop === "N") atual.n = l.valor;
    else if (l.prop === "ORG") atual.org = l.valor;
    else if (l.prop === "TEL") {
      atual.telefones.push({ numero: l.valor, pref: /PREF/.test(l.params), celular: /CELL|MOBILE/.test(l.params) });
    }
  }

  return consolidar(brutos.map((b) => {
    // Preferido > celular > o primeiro; só vale número brasileiro válido.
    const ordem = [...b.telefones].sort((x, y) => Number(y.pref) - Number(x.pref) || Number(y.celular) - Number(x.celular));
    const valido = ordem.map((t) => normalizarDigitosTelefone(t.numero)).find(Boolean) ?? null;
    return { nome: b.nome, telefone: valido };
  }));
}

// ── Planilha / CSV ───────────────────────────────────────────────────────────

const TITULO_NOME = /\b(nome|cliente|raz[aã]o|contato|sacado|devedor|empresa|fantasia|pagador)\b/i;
const TITULO_FONE = /\b(telefone|celular|whats?app|whats|fone|tel|cel|n[uú]mero)\b/i;

const pareceTelefone = (v: string) => Boolean(normalizarDigitosTelefone(v));
const pareceNome = (v: string) => /[A-Za-zÀ-ÿ]{2,}/.test(v) && !/@/.test(v) && v.replace(/\D/g, "").length < 6;

/**
 * Acha as colunas de nome e telefone: pelo título (nas 5 primeiras linhas) ou,
 * sem título, pelo conteúdo (a coluna com mais telefones válidos e a com mais
 * nomes). Devolve null quando não há coluna de telefone.
 */
export function contatosDaTabela(rows: string[][]): LeituraDeContatos | null {
  if (!rows.length) return null;
  const largura = Math.max(...rows.map((r) => r.length));
  let inicio = 0;
  let colNome = -1;
  let colFone = -1;

  for (let r = 0; r < Math.min(5, rows.length) && (colNome < 0 || colFone < 0); r++) {
    const row = rows[r];
    const fone = row.findIndex((c) => TITULO_FONE.test(c) && !pareceTelefone(c));
    const nome = row.findIndex((c, i) => i !== fone && TITULO_NOME.test(c) && !pareceTelefone(c));
    if (fone >= 0) { colFone = fone; colNome = nome; inicio = r + 1; }
  }

  const amostra = rows.slice(inicio, inicio + 200);
  const contar = (col: number, teste: (v: string) => boolean) => amostra.filter((r) => teste(r[col] ?? "")).length;
  if (colFone < 0) {
    let melhor = 0;
    for (let c = 0; c < largura; c++) { const n = contar(c, pareceTelefone); if (n > melhor) { melhor = n; colFone = c; } }
    if (melhor < Math.max(1, amostra.length * 0.3)) return null;
    // Linha 1 com texto onde a coluna de telefone não é telefone = cabeçalho sem palavra conhecida.
    if (rows[0] && !pareceTelefone(rows[0][colFone] ?? "")) inicio = Math.max(inicio, 1);
  }
  if (colNome < 0) {
    let melhor = 0;
    for (let c = 0; c < largura; c++) {
      if (c === colFone) continue;
      const n = contar(c, pareceNome);
      if (n > melhor) { melhor = n; colNome = c; }
    }
    if (colNome < 0) return null;
  }

  return consolidar(rows.slice(inicio).map((r) => ({
    nome: (r[colNome] ?? "").replace(/\s+/g, " ").trim(),
    telefone: normalizarDigitosTelefone(r[colFone] ?? ""),
  })));
}

function consolidar(lidos: { nome: string; telefone: string | null }[]): LeituraDeContatos {
  const vistos = new Set<string>();
  const contatos: ContatoLido[] = [];
  let semTelefoneValido = 0;
  let repetidos = 0;
  for (const l of lidos) {
    const chave = contactKeyFromName(l.nome);
    if (!chave) continue;
    if (!l.telefone) { semTelefoneValido++; continue; }
    if (vistos.has(chave)) { repetidos++; continue; }
    vistos.add(chave);
    contatos.push({ nome: l.nome.trim(), telefone: l.telefone });
  }
  return { contatos, semTelefoneValido, repetidos };
}

// ── Cruzamento com a carteira ────────────────────────────────────────────────

export interface CasamentoDeContato {
  contato: ContatoLido;
  /** Nome do cliente como está na carteira. */
  cliente: string;
  /** exato = mesmo nome (sem acento/caixa); parecido = o nome do arquivo é o começo do nome do cliente. */
  tipo: "exato" | "parecido";
  /** Títulos ativos desse cliente sem WhatsApp válido. */
  semTelefone: string[];
  /** Títulos ativos com outro número (só trocam se o usuário pedir). */
  outroNumero: string[];
  /** Títulos que já têm este mesmo número. */
  jaIguais: number;
}

export interface CruzamentoDeContatos {
  casados: CasamentoDeContato[];
  /** Contatos do arquivo que não são clientes da carteira. */
  fora: ContatoLido[];
}

/**
 * Casa cada contato com um cliente da carteira. Exato: mesmo nome normalizado.
 * Parecido (pede confirmação na tela): o contato tem 2+ palavras e o nome do
 * cliente começa exatamente por elas — "Oscar Santana" → "OSCAR SANTANA DO
 * CARMO" — e só um cliente começa assim. Liquidados não entram na conta.
 */
export function cruzarComCarteira(contatos: ContatoLido[], debtors: Debtor[]): CruzamentoDeContatos {
  const porCliente = new Map<string, { nome: string; titulos: Debtor[] }>();
  for (const d of debtors) {
    if (d.category === "liquidado" || d.category === "pago_banco") continue;
    const k = contactKeyFromName(d.client);
    if (!k) continue;
    const g = porCliente.get(k) ?? { nome: d.client.trim(), titulos: [] };
    g.titulos.push(d);
    porCliente.set(k, g);
  }
  const chaves = [...porCliente.keys()];
  const usados = new Set<string>();
  const casados: CasamentoDeContato[] = [];
  const fora: ContatoLido[] = [];

  const montar = (contato: ContatoLido, chave: string, tipo: "exato" | "parecido"): CasamentoDeContato => {
    const g = porCliente.get(chave)!;
    const semTelefone: string[] = [];
    const outroNumero: string[] = [];
    let jaIguais = 0;
    for (const d of g.titulos) {
      const atual = normalizarDigitosTelefone(d.phone || "");
      if (!atual) semTelefone.push(d.id);
      else if (atual === contato.telefone) jaIguais++;
      else outroNumero.push(d.id);
    }
    return { contato, cliente: g.nome, tipo, semTelefone, outroNumero, jaIguais };
  };

  // Exatos primeiro, para um "parecido" não roubar o cliente de um exato.
  const pendentes: ContatoLido[] = [];
  for (const c of contatos) {
    const k = contactKeyFromName(c.nome);
    if (porCliente.has(k) && !usados.has(k)) { usados.add(k); casados.push(montar(c, k, "exato")); }
    else pendentes.push(c);
  }
  for (const c of pendentes) {
    const k = contactKeyFromName(c.nome);
    const candidatos = k.split(" ").length >= 2
      ? chaves.filter((ck) => !usados.has(ck) && ck.startsWith(k + " "))
      : [];
    if (candidatos.length === 1) { usados.add(candidatos[0]); casados.push(montar(c, candidatos[0], "parecido")); }
    else fora.push(c);
  }

  casados.sort((a, b) => Number(a.tipo === "parecido") - Number(b.tipo === "parecido")
    || b.semTelefone.length - a.semTelefone.length || a.cliente.localeCompare(b.cliente, "pt-BR"));
  return { casados, fora };
}
