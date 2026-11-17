/**
 * Regras puras do cadastro de contatos — sem Supabase, sem rede, testáveis.
 *
 * Separado de contactsService.ts justamente para poder ser testado: o serviço
 * importa o cliente Supabase, que depende das variáveis de ambiente do Vite.
 */

import type { Debtor } from "../types";

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Normaliza o nome do cliente em uma chave estável de casamento. */
export function contactKeyFromName(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ") // pontuação → espaço
    .trim()
    .replace(/\s+/g, " ");
}

/** Considera válido um telefone com 10+ dígitos (DDD + número). */
export function hasValidPhone(phone: string | null | undefined): boolean {
  return Boolean(phone && phone.replace(/\D/g, "").length >= 10);
}

/** O mínimo de um contato que a sugestão de telefone usa. */
export interface ContatoConhecido {
  contactKey: string;
  clientName: string;
  phone: string;
}

/**
 * Chave do nome para SUGESTÃO de telefone: a de contactKeyFromName sem
 * CPF/CNPJ ou código colado no nome ("CARLOS MENDES ROCHA 123.456.789-09" =
 * "Carlos Mendes Rocha"). Sequência de números com 8+ dígitos sai; número
 * curto fica ("Loja 2" ≠ "Loja 3"). Tipo de empresa no fim (LTDA, ME,
 * EIRELI, S/A…) também sai. Não serve de contact_key no banco.
 */
export function chaveDeSugestao(nome: string): string {
  const out: string[] = [];
  let numeros: string[] = [];
  const fechar = () => {
    if (numeros.join("").length < 8) out.push(...numeros);
    numeros = [];
  };
  for (const t of contactKeyFromName(nome).split(" ")) {
    if (!t) continue;
    if (/^\d+$/.test(t)) { numeros.push(t); continue; }
    fechar();
    out.push(t);
  }
  fechar();
  // Tipo de empresa no fim não diferencia cliente: "Alfa Moveis LTDA" =
  // "Alfa Moveis ME". Fica ao menos uma palavra.
  while (out.length > 1 && TIPO_DE_EMPRESA.has(out[out.length - 1])) out.pop();
  if (out.length > 2 && out[out.length - 2] === "s" && out[out.length - 1] === "a") out.splice(-2); // S/A, S.A.
  return out.join(" ");
}

const TIPO_DE_EMPRESA = new Set(["ltda", "me", "epp", "eireli", "mei", "sa", "cia", "slu"]);

/**
 * Acha o telefone conhecido de um nome no mapa de mapaDeTelefonesConhecidos.
 *
 *  - exato: mesma chave (sem acento, caixa, pontuação e CPF/CNPJ);
 *  - parecido: um nome é o começo do outro — relatório que corta o nome
 *    ("CARLOS MENDES ROC") ou nome sem o último sobrenome. O mais curto
 *    precisa de 2+ palavras e 10+ letras, e só vale com UM candidato.
 */
export function acharTelefoneConhecido(
  mapa: Map<string, ContatoConhecido>,
  nome: string,
): { contato: ContatoConhecido; tipo: "exato" | "parecido" } | null {
  const k = chaveDeSugestao(nome);
  if (!k) return null;
  const exato = mapa.get(k);
  if (exato) return { contato: exato, tipo: "exato" };

  const serve = (curta: string) => curta.length >= 10 && curta.includes(" ");
  let achado: ContatoConhecido | null = null;
  for (const [ck, c] of mapa) {
    const parecido = (serve(k) && ck.startsWith(k)) || (serve(ck) && k.startsWith(ck));
    if (!parecido) continue;
    if (achado && achado.phone.replace(/\D/g, "") !== c.phone.replace(/\D/g, "")) return null; // ambíguo
    achado = achado ?? c;
  }
  return achado ? { contato: achado, tipo: "parecido" } : null;
}

/**
 * Telefones conhecidos por cliente, para sugerir em importação e cadastro.
 *
 * Duas fontes:
 *  - cadastro de contatos (`user_contatos`): vence quando tem telefone válido;
 *  - títulos da carteira (e arquivados) com telefone válido: cobrem o cliente
 *    que nunca entrou no cadastro — título importado pelo Importar ou telefone
 *    editado direto na Carteira não passam pelo aprendizado de contatos.
 *
 * Entre títulos do mesmo cliente com números diferentes vale o primeiro da
 * lista (quem chama passa a carteira antes dos arquivados).
 *
 * A chave do mapa é chaveDeSugestao — buscar com acharTelefoneConhecido.
 */
export function mapaDeTelefonesConhecidos(
  contatos: Iterable<ContatoConhecido>,
  titulos: Array<Pick<Debtor, "client" | "phone">>,
): Map<string, ContatoConhecido> {
  const mapa = new Map<string, ContatoConhecido>();
  for (const t of titulos) {
    if (!hasValidPhone(t.phone)) continue;
    const key = chaveDeSugestao(t.client);
    if (!key || mapa.has(key)) continue;
    mapa.set(key, { contactKey: contactKeyFromName(t.client), clientName: t.client.trim(), phone: t.phone.trim() });
  }
  for (const c of contatos) {
    const key = chaveDeSugestao(c.contactKey);
    if (key && hasValidPhone(c.phone)) mapa.set(key, c);
  }
  return mapa;
}

export interface ContactSyncRow {
  user_id: string;
  contact_key: string;
  client_name: string;
  phone: string;
  updated_at: string;
  /** Presente SÓ quando o boleto trouxe representante — ver abaixo. */
  representative_id?: string;
}

/**
 * Monta os lotes de upsert do aprendizado de contatos a partir de devedores.
 *
 * Dois lotes, cada um com colunas uniformes:
 *  - comRep: boletos que trouxeram representante → gravam o representante;
 *  - semRep: boletos sem representante → a coluna NEM APARECE no payload.
 *
 * No upsert do PostgREST, coluna ausente não entra no UPDATE do ON CONFLICT,
 * então o representante que o contato já tinha é preservado. Antes o null era
 * gravado por cima: cadastrar um segundo boleto sem representante — ou importar
 * uma planilha sem essa coluna — fazia o cliente perder o responsável.
 *
 * Dentro do mesmo lote, vale o último telefone válido de cada cliente, mas um
 * boleto sem representante não apaga o que um boleto anterior do mesmo cliente
 * trouxe.
 */
export function buildContactSyncBatches(
  userId: string,
  debtors: Debtor[],
  now: string,
): { comRep: ContactSyncRow[]; semRep: ContactSyncRow[] } {
  const porChave = new Map<string, { client_name: string; phone: string; representative_id: string | null }>();

  for (const d of debtors) {
    if (!hasValidPhone(d.phone)) continue;
    const key = contactKeyFromName(d.client);
    if (!key) continue;
    const repValido =
      d.representativeId && UUID_REGEX.test(d.representativeId) ? d.representativeId : null;
    porChave.set(key, {
      client_name: d.client.trim(),
      phone: d.phone.trim(),
      representative_id: repValido ?? porChave.get(key)?.representative_id ?? null,
    });
  }

  const comRep: ContactSyncRow[] = [];
  const semRep: ContactSyncRow[] = [];
  for (const [contact_key, v] of porChave) {
    const base: ContactSyncRow = {
      user_id: userId,
      contact_key,
      client_name: v.client_name,
      phone: v.phone,
      updated_at: now,
    };
    if (v.representative_id) comRep.push({ ...base, representative_id: v.representative_id });
    else semRep.push(base);
  }
  return { comRep, semRep };
}
