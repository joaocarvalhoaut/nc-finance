/**
 * Arquivos de texto (CSV, TXT) e texto colado: decodificação e divisão em células.
 * Puro (sem DOM) — roda no navegador e nos testes em Node.
 */

import { detectDelimiter } from "./tableParser";

/**
 * Bytes do arquivo → texto, na codificação certa.
 *
 * Sistemas brasileiros (ERPs, bancos, Excel no Windows) exportam CSV em
 * Windows-1252, não em UTF-8. Lido como UTF-8, "JOSÉ" virava "JOS�" e o nome ia
 * assim para a mensagem de cobrança. Regra: BOM manda; sem BOM, tenta UTF-8
 * estrito e, se houver byte inválido, cai para Windows-1252.
 */
export function decodificarTexto(buffer: ArrayBuffer | Uint8Array): string {
  const b = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let texto: string;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    texto = new TextDecoder("utf-8").decode(b.subarray(3));
  } else if (b[0] === 0xff && b[1] === 0xfe) {
    texto = new TextDecoder("utf-16le").decode(b.subarray(2));
  } else if (b[0] === 0xfe && b[1] === 0xff) {
    texto = new TextDecoder("utf-16be").decode(b.subarray(2));
  } else if (pareceUtf16SemBom(b)) {
    texto = new TextDecoder("utf-16le").decode(b);
  } else {
    try {
      texto = new TextDecoder("utf-8", { fatal: true }).decode(b);
    } catch {
      texto = new TextDecoder("windows-1252").decode(b);
    }
  }
  return texto.replace(/\r\n?/g, "\n");
}

/** UTF-16 LE sem BOM (raro, mas o "Unicode Text" do Excel gera): metade dos bytes é zero. */
function pareceUtf16SemBom(b: Uint8Array): boolean {
  const n = Math.min(b.length, 400);
  if (n < 8) return false;
  let zerosImpares = 0;
  for (let i = 1; i < n; i += 2) if (b[i] === 0) zerosImpares++;
  return zerosImpares / (n / 2) > 0.6;
}

/**
 * Divide texto delimitado em linhas e células, no padrão CSV (RFC 4180): campo
 * entre aspas pode ter o delimitador e até quebra de linha dentro, e "" vira ".
 * O parser por linha antigo quebrava um endereço com quebra de linha em dois
 * registros.
 */
export function dividirDelimitado(texto: string, delimitador: string): string[][] {
  const linhas: string[][] = [];
  let celula = "";
  let linha: string[] = [];
  let entreAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (entreAspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { celula += '"'; i++; }
        else entreAspas = false;
      } else {
        celula += ch;
      }
      continue;
    }
    if (ch === '"' && celula.trim() === "") {
      celula = "";
      entreAspas = true;
    } else if (ch === delimitador) {
      linha.push(celula);
      celula = "";
    } else if (ch === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else if (ch !== "\r") {
      celula += ch;
    }
  }
  if (celula !== "" || linha.length > 0) {
    linha.push(celula);
    linhas.push(linha);
  }

  return linhas
    .map((l) => l.map((c) => c.replace(/\s+/g, " ").trim()))
    .filter((l) => l.some((c) => c !== ""));
}

/**
 * Se o texto for uma tabela delimitada (CSV, colagem do Excel, export de ERP),
 * devolve as linhas já divididas; senão, null.
 *
 * Critério: a maioria das linhas tem o mesmo número de células (2 ou mais) com
 * o delimitador escolhido.
 */
export function comoTabela(texto: string): string[][] | null {
  const amostra = texto.split("\n").filter((l) => l.trim()).slice(0, 30);
  if (amostra.length < 2) return null;
  const delimitador = detectDelimiter(amostra);
  const linhas = dividirDelimitado(texto, delimitador);
  if (linhas.length < 2) return null;

  const contagem = new Map<number, number>();
  for (const l of linhas.slice(0, 200)) contagem.set(l.length, (contagem.get(l.length) ?? 0) + 1);
  const [largura, vezes] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  const total = Math.min(linhas.length, 200);
  if (largura < 2 || vezes / total < 0.6) return null;
  return linhas;
}
