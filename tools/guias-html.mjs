/**
 * HTML estático dos guias (/guias e /guias/<slug>) — usado por
 * tools/prerender-landing.mjs no build. Conteúdo em src/content/guias.ts.
 *
 * Página sem JavaScript nenhum: o robô (Google, GPTBot, ClaudeBot…) lê tudo de
 * primeira, e o CSP não precisa mudar (estilo inline já é permitido). Mesma
 * cara do site: fundo zinc escuro, verde esmeralda, Schibsted Grotesk.
 */

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const dataBr = (iso) => iso.split("-").reverse().join("/");

const jsonLdScript = (obj) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

const CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#09090b;color:#d4d4d8;font-family:"Schibsted Grotesk",ui-sans-serif,system-ui,sans-serif;font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:#34d399;text-decoration-thickness:1px;text-underline-offset:3px}
a:hover{color:#6ee7b7}
.topo{border-bottom:1px solid #27272a;background:#09090b}
.topo-in{max-width:760px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.marca{color:#fff;font-weight:800;letter-spacing:-.02em;text-decoration:none;font-size:18px}
.marca span{color:#34d399}
.topo nav{display:flex;align-items:center;gap:16px;font-size:15px}
.topo nav a.l{color:#a1a1aa;text-decoration:none}
.topo nav a.l:hover{color:#fff}
.btn{display:inline-block;background:#10b981;color:#000;font-weight:700;text-decoration:none;padding:9px 14px;border-radius:6px;font-size:15px;line-height:1.2}
.btn:hover{background:#34d399;color:#000}
main{max-width:760px;margin:0 auto;padding:28px 20px 56px}
.trilha{font-size:14px;color:#71717a;margin:0 0 18px}
.trilha a{color:#a1a1aa;text-decoration:none}
.trilha a:hover{color:#fff}
h1{color:#fff;font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.025em;margin:0 0 10px;font-weight:800}
.data{font-size:14px;color:#71717a;margin:0 0 26px}
.resumo{border:1px solid #065f46;background:rgba(16,185,129,.07);border-radius:6px;padding:16px 18px;margin:0 0 34px}
.resumo strong{display:block;color:#34d399;font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
.resumo p{margin:0;color:#e4e4e7}
h2{color:#fff;font-size:24px;line-height:1.25;letter-spacing:-.015em;margin:40px 0 12px;font-weight:750}
h3{color:#fff;font-size:18px;line-height:1.35;margin:26px 0 6px}
p{margin:0 0 14px}
ul,ol{margin:0 0 14px;padding-left:22px}
li{margin:0 0 8px}
li::marker{color:#34d399}
.cta{margin:44px 0 8px;border:1px solid #27272a;background:#18181b;border-radius:6px;padding:20px}
.cta h2{margin-top:0}
.cta .btn{margin-top:6px}
.lista-guias{list-style:none;padding:0}
.lista-guias li{border:1px solid #27272a;border-radius:6px;padding:16px 18px;margin:0 0 12px;background:#0f0f12}
.lista-guias a{font-weight:700;font-size:19px;text-decoration:none}
.lista-guias p{margin:6px 0 0;color:#a1a1aa;font-size:15px}
.rodape{border-top:1px solid #27272a;color:#71717a;font-size:14px}
.rodape-in{max-width:760px;margin:0 auto;padding:22px 20px;display:flex;flex-wrap:wrap;gap:8px 18px}
.rodape a{color:#a1a1aa;text-decoration:none}
.rodape a:hover{color:#fff}
@media (max-width:520px){.topo nav a.l{display:none}body{font-size:16px}}
`.trim();

const cabecalho = ({ titulo, descricao, url, publicado, atualizado, tipo }) => `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(titulo)}</title>
    <meta name="description" content="${esc(descricao)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="${tipo}" />
    <meta property="og:locale" content="pt_BR" />
    <meta property="og:site_name" content="NC Finance" />
    <meta property="og:title" content="${esc(titulo)}" />
    <meta property="og:description" content="${esc(descricao)}" />
    <meta property="og:url" content="${esc(url)}" />
    <meta property="og:image" content="https://ncfinance.com.br/og.png" />
    <meta name="twitter:card" content="summary_large_image" />
    ${publicado ? `<meta property="article:published_time" content="${publicado}" />` : ""}
    ${atualizado ? `<meta property="article:modified_time" content="${atualizado}" />` : ""}
    <meta name="theme-color" content="#09090b" />
    <link rel="icon" type="image/png" href="/favicon.png" />
    <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400..800&display=swap" rel="stylesheet" />
    <style>${CSS}</style>`;

const topo = (diasTeste) => `
    <header class="topo"><div class="topo-in">
      <a class="marca" href="/">N<span>C Finance</span></a>
      <nav><a class="l" href="/guias">Guias</a><a class="l" href="/#planos">Planos</a><a class="btn" href="/#planos">Testar ${diasTeste} dias grátis</a></nav>
    </div></header>`;

const rodape = (c) => `
    <footer class="rodape"><div class="rodape-in">
      <span>© NC Finance</span>
      <a href="/">Página inicial</a>
      <a href="/guias">Guias</a>
      <a href="/#perguntas">Perguntas frequentes</a>
      <a href="mailto:${esc(c.email)}">${esc(c.email)}</a>
      <span>WhatsApp ${esc(c.whatsapp)}</span>
    </div></footer>`;

const secaoHtml = (s) => {
  const partes = [`<h2>${esc(s.titulo)}</h2>`];
  for (const p of s.paragrafos ?? []) partes.push(`<p>${esc(p)}</p>`);
  if (s.lista?.length) {
    const tag = s.numerada ? "ol" : "ul";
    partes.push(`<${tag}>${s.lista.map((i) => `<li>${esc(i)}</li>`).join("")}</${tag}>`);
  }
  if (s.fecho) partes.push(`<p>${esc(s.fecho)}</p>`);
  return partes.join("\n");
};

/** URL pública de um guia (sem barra no fim). */
export const urlGuia = (site, slug) => `${site}guias/${slug}`;

export function renderGuia(g, c) {
  const site = c.siteUrl;
  const url = urlGuia(site, g.slug);
  const orgId = `${site}#organizacao`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#artigo`,
        headline: g.titulo,
        description: g.descricao,
        inLanguage: "pt-BR",
        datePublished: g.publicadoEm,
        dateModified: g.atualizadoEm,
        mainEntityOfPage: url,
        image: `${site}og.png`,
        author: { "@type": "Organization", "@id": orgId, name: "NC Finance", url: site },
        publisher: { "@type": "Organization", "@id": orgId, name: "NC Finance", url: site, logo: { "@type": "ImageObject", url: `${site}favicon.png` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: site },
          { "@type": "ListItem", position: 2, name: "Guias", item: `${site}guias` },
          { "@type": "ListItem", position: 3, name: g.titulo, item: url },
        ],
      },
      ...(g.perguntas.length
        ? [{
            "@type": "FAQPage",
            "@id": `${url}#perguntas`,
            inLanguage: "pt-BR",
            mainEntity: g.perguntas.map((q) => ({ "@type": "Question", name: q.pergunta, acceptedAnswer: { "@type": "Answer", text: q.resposta } })),
          }]
        : []),
    ],
  };

  const outros = c.guias.filter((o) => o.slug !== g.slug);

  return `${cabecalho({ titulo: g.tituloSeo, descricao: g.descricao, url, publicado: g.publicadoEm, atualizado: g.atualizadoEm, tipo: "article" })}
    ${jsonLdScript(ld)}
  </head>
  <body>${topo(c.diasTeste)}
    <main>
      <p class="trilha"><a href="/">Início</a> › <a href="/guias">Guias</a></p>
      <article>
        <h1>${esc(g.titulo)}</h1>
        <p class="data">Atualizado em <time datetime="${g.atualizadoEm}">${dataBr(g.atualizadoEm)}</time> · NC Finance</p>
        <div class="resumo"><strong>Resposta rápida</strong><p>${esc(g.resumo)}</p></div>
        ${g.secoes.map(secaoHtml).join("\n        ")}
        <section class="cta">
          <h2>Fazendo isso no NC Finance</h2>
          <ul>${g.noNcFinance.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
          <a class="btn" href="/#planos">Testar ${c.diasTeste} dias grátis</a>
        </section>
        ${g.perguntas.length
          ? `<h2>Perguntas frequentes</h2>\n        ${g.perguntas.map((q) => `<h3>${esc(q.pergunta)}</h3><p>${esc(q.resposta)}</p>`).join("\n        ")}`
          : ""}
      </article>
      ${outros.length
        ? `<h2>Outros guias</h2><ul class="lista-guias">${outros.map((o) => `<li><a href="/guias/${o.slug}">${esc(o.titulo)}</a><p>${esc(o.descricao)}</p></li>`).join("")}</ul>`
        : ""}
    </main>${rodape(c)}
  </body>
</html>
`;
}

export function renderIndiceGuias(c) {
  const site = c.siteUrl;
  const url = `${site}guias`;
  const titulo = "Guias de cobrança pelo WhatsApp | NC Finance";
  const descricao = "Guias práticos para cobrar clientes em atraso pelo WhatsApp: mensagens, juros e multa, régua de cobrança, o que a lei permite e como proteger o seu número.";
  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#colecao`,
    name: titulo,
    description: descricao,
    url,
    inLanguage: "pt-BR",
    hasPart: c.guias.map((g) => ({ "@type": "Article", headline: g.titulo, url: urlGuia(site, g.slug) })),
  };
  return `${cabecalho({ titulo, descricao, url, tipo: "website" })}
    ${jsonLdScript(ld)}
  </head>
  <body>${topo(c.diasTeste)}
    <main>
      <p class="trilha"><a href="/">Início</a> › Guias</p>
      <h1>Guias de cobrança pelo WhatsApp</h1>
      <p>${esc(descricao)}</p>
      <ul class="lista-guias">${c.guias.map((g) => `<li><a href="/guias/${g.slug}">${esc(g.titulo)}</a><p>${esc(g.descricao)}</p></li>`).join("")}</ul>
    </main>${rodape(c)}
  </body>
</html>
`;
}
