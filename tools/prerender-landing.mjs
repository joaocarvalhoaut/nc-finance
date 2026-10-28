/**
 * Pré-render da landing (SEO + GEO). Roda no `npm run build`, depois do
 * build do navegador e do build SSR de src/landing-prerender.tsx.
 *
 * Por quê: o site é uma SPA — sem isso o index.html chega com <div id="root">
 * vazio. O Google até executa JavaScript, mas os robôs dos buscadores de IA
 * (GPTBot, ClaudeBot, PerplexityBot…) em geral não: para eles a página não
 * tinha texto nenhum.
 *
 * O que faz em dist/:
 *   - index.html: HTML da landing dentro do #root (o React substitui ao montar;
 *     quem tem sessão salva nem vê — ver public/session-hint.js) e JSON-LD
 *     (Organization, WebSite, SoftwareApplication com os planos, FAQPage);
 *   - llms.txt: resumo em Markdown para IAs, da mesma fonte;
 *   - sitemap.xml: com a data do build.
 *
 * Fonte única do conteúdo: src/content/landing.ts e src/config/plans.ts.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raiz = process.cwd();
const ssrDir = resolve(raiz, "dist-ssr");
const entrada = resolve(ssrDir, "landing-prerender.js");
const indexPath = resolve(raiz, "dist", "index.html");

if (!existsSync(entrada)) throw new Error(`[prerender] build SSR não encontrado: ${entrada}`);

const { renderLanding, conteudo } = await import(pathToFileURL(entrada).href);
const c = conteudo;
const site = c.siteUrl;
const hoje = new Date().toISOString().slice(0, 10);

// ── HTML da landing ──────────────────────────────────────────────────────────
const html = renderLanding();
if (!html || html.length < 1000) throw new Error("[prerender] HTML da landing veio vazio.");

// ── JSON-LD ──────────────────────────────────────────────────────────────────
const orgId = `${site}#organizacao`;
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": orgId,
      name: "NC Finance",
      url: site,
      logo: `${site}favicon.png`,
      email: c.email,
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: c.email, availableLanguage: ["pt-BR"] },
    },
    {
      "@type": "WebSite",
      "@id": `${site}#site`,
      url: site,
      name: "NC Finance",
      inLanguage: "pt-BR",
      publisher: { "@id": orgId },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${site}#software`,
      name: "NC Finance",
      url: site,
      description: c.definicao,
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Cobrança pelo WhatsApp",
      operatingSystem: "Web",
      inLanguage: "pt-BR",
      publisher: { "@id": orgId },
      featureList: [...c.passos.map((p) => p.titulo), ...c.diferenciais.map((d) => d.titulo)],
      offers: c.planos.map((p) => ({
        "@type": "Offer",
        name: `Plano ${p.nome}`,
        description: `${p.descricao} ${p.recursos.join("; ")}.`,
        price: p.preco.toFixed(2),
        priceCurrency: "BRL",
        url: `${site}#planos`,
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: p.preco.toFixed(2),
          priceCurrency: "BRL",
          billingDuration: "P1M",
          unitText: "mês",
        },
      })),
    },
    {
      "@type": "FAQPage",
      "@id": `${site}#perguntas`,
      inLanguage: "pt-BR",
      mainEntity: c.perguntas.map((q) => ({
        "@type": "Question",
        name: q.pergunta,
        acceptedAnswer: { "@type": "Answer", text: q.resposta },
      })),
    },
  ],
};
// "<" escapado: o JSON vai dentro de <script> e não pode fechar a tag.
const ldScript = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;

// ── index.html ───────────────────────────────────────────────────────────────
let index = readFileSync(indexPath, "utf8");
const raizVazia = '<div id="root"></div>';
if (!index.includes(raizVazia)) throw new Error('[prerender] <div id="root"></div> não encontrado em dist/index.html.');
if (!index.includes("</head>")) throw new Error("[prerender] </head> não encontrado em dist/index.html.");
index = index
  .replace(raizVazia, `<div id="root"><div data-prerender>${html}</div></div>`)
  .replace("</head>", `    ${ldScript}\n  </head>`);
writeFileSync(indexPath, index, "utf8");

// ── llms.txt ─────────────────────────────────────────────────────────────────
const llms = [
  "# NC Finance",
  "",
  `> ${c.definicao}`,
  "",
  `- Site: ${site}`,
  "- Idioma: português (Brasil)",
  `- Contato: ${c.email}`,
  `- Atualizado em: ${hoje}`,
  "",
  "## Como funciona",
  ...c.passos.map((p, i) => `${i + 1}. **${p.titulo}** — ${p.texto}`),
  "",
  "## Diferenciais",
  ...c.diferenciais.map((d) => `- **${d.titulo}** (${d.planos}): ${d.texto}`),
  "",
  "## Planos (mensalidade)",
  ...c.planos.map((p) => `- **${p.nome} — R$ ${p.preco}/mês**: ${p.descricao} Inclui: ${p.recursos.join("; ")}.`),
  "",
  `Todos os planos têm ${c.diasTeste} dias grátis, sem cartão de crédito, e não têm fidelidade. A assinatura é cobrada pelo Asaas, por boleto ou cartão. As cobranças saem do número de WhatsApp do próprio cliente.`,
  "",
  "## Perguntas frequentes",
  ...c.perguntas.flatMap((q) => ["", `### ${q.pergunta}`, q.resposta]),
  "",
  "## Links",
  `- Página principal: ${site}`,
  `- Planos e preços: ${site}#planos`,
  `- Perguntas frequentes: ${site}#perguntas`,
  "",
].join("\n");
writeFileSync(resolve(raiz, "dist", "llms.txt"), llms, "utf8");

// ── sitemap.xml ──────────────────────────────────────────────────────────────
writeFileSync(
  resolve(raiz, "dist", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${site}</loc>
    <lastmod>${hoje}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
  "utf8",
);

rmSync(ssrDir, { recursive: true, force: true });
console.log(`[prerender] landing pré-renderizada (${Math.round(html.length / 1024)} KB de HTML), JSON-LD, llms.txt e sitemap.xml gerados.`);
