// Builds the static, crawlable guide: /guide/, one page per system, the reactor-types page,
// plus llms.txt, llms-full.txt, and sitemap.xml. Run after you edit parts.js or tools/content.mjs:
//   node tools/build-pages.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { PARTS, GROUPS } = await import(join(root, 'parts.js'));
const { INTRO_SCRIPT } = await import(join(root, 'cine.js'));
const { SITE, OVERVIEW, FAQ, GROUP_INTRO, GROUP_META, TYPES } = await import(join(here, 'content.mjs'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const url = (path) => SITE.url + path.replace(/^\//, '');
const groupOf = (id) => GROUPS.find((g) => g.id === id);
const partsOf = (gid) => PARTS.filter((p) => p.group === gid);
const pageUrl = (gid) => url(`guide/${GROUP_META[gid].slug}/`);

// ---------------------------------------------------------------- layout
function layout({ title, description, path, body, jsonld, crumbs, ogTitle }) {
  const canonical = url(path);
  const crumbLd = crumbs && {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: url(c[1]) })),
  };
  const nav = `<nav class="gnav" aria-label="Site"><a class="brand" href="/"><span class="dot"></span>microreactors.org</a><div class="links"><a href="/">3D model</a><a href="/guide/">Guide</a><a href="/guide/reactor-types/">Reactor types</a><a href="/guide/#faq">FAQ</a><a class="cta" href="/#intro">Watch the 60-second tour</a></div></nav>`;
  const crumbHtml = crumbs ? `<ol class="crumbs">${crumbs.map((c, i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(c[0])}</li>` : `<li><a href="${c[1]}">${esc(c[0])}</a></li>`)).join('')}</ol>` : '';
  const foot = `<footer class="gfoot"><div class="fgrid"><div><div class="eyebrow"><span class="dot"></span>Explore</div><ul>${GROUPS.map((g) => `<li><a href="/guide/${GROUP_META[g.id].slug}/">${esc(GROUP_META[g.id].short)}</a></li>`).join('')}<li><a href="/guide/reactor-types/">Reactor types compared</a></li></ul></div><div><div class="eyebrow"><span class="dot"></span>In 3D</div><ul><li><a href="/">Open the interactive plant</a></li><li><a href="/#intro">Watch the 60-second tour</a></li><li><a href="/#walk">Walk the site on foot</a></li><li><a href="/#view-datacenter">Fly to the data center</a></li><li><a href="/#view-park">Fly to the reactor park</a></li></ul></div><div><div class="eyebrow"><span class="dot"></span>About</div><p>A representative design for education. Values are typical of a 10 MWe class pool-type sodium-cooled microreactor and of a data center of about 8 MW. They do not describe a specific product.</p><p>Last updated ${SITE.updated}. <a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">Sitemap</a></p></div></div></footer>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | ${SITE.name}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta name="theme-color" content="#0d0a05">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${url('og.png')}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle || title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${url('og.png')}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/guide.css">
${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
${crumbLd ? `<script type="application/ld+json">${JSON.stringify(crumbLd)}</script>` : ''}
</head>
<body>
${nav}
<main class="gmain">
${crumbHtml}
${body}
</main>
${foot}
</body>
</html>
`;
}

const publisher = { '@type': 'Organization', name: SITE.name, url: SITE.url, logo: { '@type': 'ImageObject', url: url('icon-512.png') } };
const article = ({ headline, description, path, about }) => ({
  '@context': 'https://schema.org', '@type': 'TechArticle', headline, description, url: url(path), inLanguage: 'en',
  dateModified: SITE.updated, datePublished: '2026-11-01', author: publisher, publisher, image: url('og.png'), isAccessibleForFree: true,
  mainEntityOfPage: url(path), about: (about || []).map((n) => ({ '@type': 'Thing', name: n })),
});
const specTable = (p) => `<table class="specs"><tbody>${p.specs.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;
const open3d = (id, label = 'Open in 3D') => `<a class="tlink" href="/#${id}">${esc(label)} →</a>`;

const out = [];
function write(path, html) { const dir = join(root, path); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'index.html'), html); out.push(path); }

// ---------------------------------------------------------------- /guide/
{
  const path = 'guide/';
  const toc = GROUPS.map((g) => `<li><a href="/guide/${GROUP_META[g.id].slug}/"><b>${esc(GROUP_META[g.id].short)}</b><span>${partsOf(g.id).length} parts</span></a></li>`).join('');
  const body = `
<header class="hero"><div class="eyebrow"><span class="dot"></span>Guide · plain language</div><h1>${esc(OVERVIEW.title)}</h1><p class="lead">${esc(OVERVIEW.description)}</p>
<p class="actions"><a class="btn" href="/">Open the 3D model</a><a class="btn ghost" href="/#intro">Watch the 60-second tour</a></p></header>
${OVERVIEW.sections.map((s, i) => `<section class="prose" id="${s.h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}"><h2>${esc(s.h)}</h2>${s.p.map((t) => `<p>${esc(t)}</p>`).join('')}${i === 1 ? `<p class="actions"><a class="tlink" href="/guide/reactor-core/">Reactor core →</a><a class="tlink" href="/guide/sodium-primary-system/">Primary system →</a><a class="tlink" href="/guide/power-conversion/">Power conversion →</a></p>` : ''}${i === 4 ? `<p class="actions"><a class="tlink" href="/guide/reactor-types/">Compare the four reactor types →</a></p>` : ''}</section>`).join('')}
<section class="toc" id="systems"><h2>Every system in the model</h2><p>Each page lists the parts of one system with its role and typical specifications, and links to the same part in 3D.</p><ul class="tocList">${toc}<li><a href="/guide/reactor-types/"><b>Reactor types compared</b><span>4 designs</span></a></li></ul></section>
<section class="script" id="tour"><h2>The 60-second tour, in words</h2><p>The site opens with a short camera flight over the plant, the data center, and the town. These are its ten captions.</p><ol>${INTRO_SCRIPT.map((l) => `<li><b>${esc(l.title)}</b> ${esc(l.text)}</li>`).join('')}</ol><p class="actions">${open3d('intro', 'Play the tour')}</p></section>
<section class="faq" id="faq"><h2>Frequently asked questions</h2>${FAQ.map(([q, a]) => `<details open><summary><h3>${esc(q)}</h3></summary><p>${esc(a)}</p></details>`).join('')}</section>`;
  const jsonld = [
    article({ headline: OVERVIEW.title, description: OVERVIEW.description, path, about: ['Microreactor', 'Sodium-cooled fast reactor', 'Nuclear power for data centers', 'Passive nuclear safety'] }),
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE.name, url: SITE.url, description: SITE.tagline, publisher },
  ];
  write(path, layout({ title: OVERVIEW.title, ogTitle: 'What is a microreactor? A plain-language guide', description: OVERVIEW.description, path, body, jsonld, crumbs: [['Home', '/'], ['Guide', '/guide/']] }));
}

// ---------------------------------------------------------------- one page per system
GROUPS.forEach((g) => {
  const meta = GROUP_META[g.id], parts = partsOf(g.id), path = `guide/${meta.slug}/`;
  const full = `${GROUP_INTRO[g.id]} ${parts.length} parts: ${parts.map((p) => p.name.toLowerCase()).join(', ')}.`;
  const description = full.length > 290 ? full.slice(0, 290).replace(/,?\s+\S*$/, '') + '.' : full;
  const body = `
<header class="hero"><div class="eyebrow"><span class="dot"></span>${esc(g.name)}</div><h1>${esc(meta.title)}</h1><p class="lead">${esc(GROUP_INTRO[g.id])}</p>
<p class="actions"><a class="btn" href="/#${parts[0].id}">Open this system in 3D</a>${g.id.startsWith('h') || g.id === 'msr' ? `<a class="btn ghost" href="/#view-park">Fly to the park</a>` : ''}</p>
<nav class="inpage" aria-label="Parts on this page"><ul>${parts.map((p) => `<li><a href="#${p.id}">${esc(p.name)}</a></li>`).join('')}</ul></nav></header>
${parts.map((p) => `<article class="part" id="${p.id}"><h2>${esc(p.name)}</h2><p>${esc(p.desc)}</p>${specTable(p)}<p class="actions">${open3d(p.id)}${p.id === 'control' ? open3d('walk', 'Walk into the control room') : ''}</p></article>`).join('')}
<section class="next"><h2>Keep going</h2><ul class="tocList">${GROUPS.filter((x) => x.id !== g.id).slice(0, 4).map((x) => `<li><a href="/guide/${GROUP_META[x.id].slug}/"><b>${esc(GROUP_META[x.id].short)}</b><span>${partsOf(x.id).length} parts</span></a></li>`).join('')}<li><a href="/guide/reactor-types/"><b>Reactor types compared</b><span>4 designs</span></a></li><li><a href="/guide/"><b>Back to the guide</b><span>overview and FAQ</span></a></li></ul></section>`;
  const jsonld = [
    article({ headline: meta.title, description, path, about: [g.name, 'Microreactor'] }),
    { '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: g.name, url: url(path), hasDefinedTerm: parts.map((p) => ({ '@type': 'DefinedTerm', name: p.name, description: p.desc, url: url(path) + '#' + p.id })) },
  ];
  write(path, layout({ title: meta.title, description, path, body, jsonld, crumbs: [['Home', '/'], ['Guide', '/guide/'], [meta.short, `/guide/${meta.slug}/`]] }));
});

// ---------------------------------------------------------------- reactor types
{
  const path = 'guide/reactor-types/';
  const body = `
<header class="hero"><div class="eyebrow"><span class="dot"></span>Comparison</div><h1>${esc(TYPES.title)}</h1>${TYPES.intro.map((t) => `<p class="lead">${esc(t)}</p>`).join('')}
<p class="actions"><a class="btn" href="/#view-park">See the park in 3D</a><a class="btn ghost" href="/#core">Open the sodium plant</a></p></header>
<div class="tableWrap"><table class="compare"><thead><tr><th scope="col">Feature</th>${TYPES.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${TYPES.rows.map((r) => `<tr><th scope="row">${esc(r[0])}</th>${r.slice(1).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<section class="prose">${TYPES.outro.map((t) => `<p>${esc(t)}</p>`).join('')}</section>
<section class="next"><h2>Read each design</h2><ul class="tocList"><li><a href="/guide/sodium-primary-system/"><b>Sodium pool</b><span>the main plant</span></a></li><li><a href="/guide/heat-pipe-microreactor/"><b>Heat pipe</b><span>park plot A</span></a></li><li><a href="/guide/gas-cooled-microreactor/"><b>Gas-cooled</b><span>park plot B</span></a></li><li><a href="/guide/molten-salt-microreactor/"><b>Molten salt</b><span>park plot C</span></a></li></ul></section>`;
  const jsonld = [article({ headline: TYPES.title, description: TYPES.description, path, about: ['Sodium-cooled fast reactor', 'Heat-pipe reactor', 'High-temperature gas-cooled reactor', 'Molten salt reactor'] })];
  write(path, layout({ title: TYPES.title, description: TYPES.description, path, body, jsonld, crumbs: [['Home', '/'], ['Guide', '/guide/'], ['Reactor types', '/guide/reactor-types/']] }));
}

// ---------------------------------------------------------------- llms.txt and llms-full.txt
{
  const md = [];
  md.push(`# ${SITE.name}`, '', `> ${SITE.tagline}. An interactive 3D model of a 10 MWe sodium-cooled microreactor, the data center it powers, and a demonstration park with heat-pipe, gas-cooled, and molten-salt designs. Representative, vendor-neutral, for education.`, '');
  md.push('## Pages', '', `- [What is a microreactor? (guide overview and FAQ)](${url('guide/')}): the plain-language explainer`, `- [Four kinds of microreactor compared](${url('guide/reactor-types/')}): sodium pool, heat pipe, gas-cooled, molten salt`);
  GROUPS.forEach((g) => md.push(`- [${GROUP_META[g.id].title}](${pageUrl(g.id)}): ${GROUP_INTRO[g.id].split('. ')[0]}.`));
  md.push(`- [Interactive 3D model](${SITE.url}): cut the reactor open, run its physics, walk the site`, '', '## Full text', '', `- [llms-full.txt](${url('llms-full.txt')}): every page as plain text`, '');
  writeFileSync(join(root, 'llms.txt'), md.join('\n'));

  const full = [];
  full.push(`# ${SITE.name}: ${SITE.tagline}`, '', `Source: ${SITE.url}  Updated: ${SITE.updated}`, '', 'A representative, vendor-neutral educational model. Values are typical of a 10 MWe class pool-type sodium-cooled microreactor and of a data center of about 8 MW. They do not describe a specific product.', '');
  full.push(`## ${OVERVIEW.title}`, '');
  OVERVIEW.sections.forEach((s) => { full.push(`### ${s.h}`, '', ...s.p.flatMap((t) => [t, ''])); });
  full.push('### The 60-second tour, in words', '', ...INTRO_SCRIPT.map((l, i) => `${i + 1}. ${l.title}. ${l.text}`), '');
  full.push('### Frequently asked questions', '', ...FAQ.flatMap(([q, a]) => [`Q: ${q}`, `A: ${a}`, '']));
  full.push(`## ${TYPES.title}`, '', ...TYPES.intro, '');
  full.push(`| Feature | ${TYPES.cols.join(' | ')} |`, `|---|${TYPES.cols.map(() => '---').join('|')}|`, ...TYPES.rows.map((r) => `| ${r.join(' | ')} |`), '', ...TYPES.outro, '');
  GROUPS.forEach((g) => {
    full.push(`## ${GROUP_META[g.id].title}`, '', `Page: ${pageUrl(g.id)}`, '', GROUP_INTRO[g.id], '');
    partsOf(g.id).forEach((p) => { full.push(`### ${p.name}`, '', p.desc, '', ...p.specs.map(([k, v]) => `- ${k}: ${v}`), '', `In 3D: ${SITE.url}#${p.id}`, ''); });
  });
  writeFileSync(join(root, 'llms-full.txt'), full.join('\n'));
}

// ---------------------------------------------------------------- sitemap
{
  const urls = [
    { loc: SITE.url, pri: '1.0', img: true },
    { loc: url('guide/'), pri: '0.9' },
    { loc: url('guide/reactor-types/'), pri: '0.8' },
    ...GROUPS.map((g) => ({ loc: pageUrl(g.id), pri: '0.7' })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${SITE.updated}</lastmod>\n    <changefreq>${u.pri === '1.0' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${u.pri}</priority>${u.img ? `\n    <image:image><image:loc>${url('og.png')}</image:loc><image:title>Interactive 3D microreactor</image:title></image:image>` : ''}\n  </url>`).join('\n')}
</urlset>
`;
  writeFileSync(join(root, 'sitemap.xml'), xml);
}

console.log(`pages: ${out.length} written (${out.join(', ')}); llms.txt, llms-full.txt, sitemap.xml updated`);
