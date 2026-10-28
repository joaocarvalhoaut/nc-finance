/**
 * Copia os arquivos do OCR (tesseract.js) de node_modules para public/ocr, de
 * onde o próprio site os serve. Roda antes do `dev` e do `build`.
 *
 * Por que não a CDN padrão do tesseract: o CSP do site só aceita scripts e
 * conexões da própria origem — e não vamos abrir o CSP para uma CDN pública
 * numa tela que lê dados de clientes. Ver src/services/localDocumentExtraction/ocr.ts.
 *
 * public/ocr/ está no .gitignore: são ~13 MB gerados a partir das dependências.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const raiz = process.cwd();
const destino = resolve(raiz, "public", "ocr");

const pacote = (nome) => dirname(require.resolve(`${nome}/package.json`));
const tesseract = pacote("tesseract.js");
const core = pacote("tesseract.js-core");
const idioma = pacote("@tesseract.js-data/por");

// O worker escolhe a variante do núcleo conforme o navegador (SIMD ou não);
// usamos só o motor LSTM (oem 1), então bastam as variantes "-lstm".
const arquivos = [
  [resolve(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  ...["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"].map((n) => [
    resolve(core, `${n}.wasm.js`),
    `core/${n}.wasm.js`,
  ]),
  // "best_int": o mesmo que o tesseract usa por padrão no modo LSTM.
  [resolve(idioma, "4.0.0_best_int", "por.traineddata.gz"), "lang/por.traineddata.gz"],
];

let copiados = 0;
for (const [origem, relativo] of arquivos) {
  if (!existsSync(origem)) throw new Error(`[ocr-assets] arquivo não encontrado: ${origem}`);
  const alvo = resolve(destino, relativo);
  if (existsSync(alvo) && statSync(alvo).size === statSync(origem).size) continue;
  mkdirSync(dirname(alvo), { recursive: true });
  copyFileSync(origem, alvo);
  copiados++;
}
console.log(`[ocr-assets] ${copiados ? `${copiados} arquivo(s) copiado(s)` : "já atualizados"} em public/ocr.`);
