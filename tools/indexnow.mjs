/**
 * IndexNow — avisa Bing (e Yandex, Seznam, Naver…) das URLs do sitemap, para
 * as páginas novas ou alteradas serem lidas na hora. O Bing alimenta o
 * ChatGPT Search e o Copilot: importa para o GEO.
 *
 * Rodar DEPOIS que o deploy da Vercel estiver no ar (lê o sitemap publicado):
 *   node tools/indexnow.mjs
 *
 * A chave é pública por desenho: fica em public/<chave>.txt, servida na raiz
 * do site, e só prova que quem avisa é dono do domínio.
 */

const SITE = "https://ncfinance.com.br";
const CHAVE = "7c395650ba456f02b4b5b5cd3ba174a5";

const sitemap = await fetch(`${SITE}/sitemap.xml`).then((r) => {
  if (!r.ok) throw new Error(`sitemap.xml: HTTP ${r.status}`);
  return r.text();
});
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
if (!urls.length) throw new Error("Nenhuma URL no sitemap.");

const chaveNoAr = await fetch(`${SITE}/${CHAVE}.txt`).then((r) => (r.ok ? r.text() : ""));
if (chaveNoAr.trim() !== CHAVE) throw new Error(`Chave não está no ar em ${SITE}/${CHAVE}.txt — o deploy terminou?`);

const resp = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: CHAVE,
    keyLocation: `${SITE}/${CHAVE}.txt`,
    urlList: urls,
  }),
});
// 200 = recebido; 202 = recebido, chave ainda em validação.
console.log(`[indexnow] ${urls.length} URL(s) enviadas — HTTP ${resp.status}`);
if (resp.status >= 400) process.exit(1);
