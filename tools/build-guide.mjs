// Generates the crawlable guide (HTML) and JSON-LD from parts.js and writes them into index.html.
// Run after you edit parts.js:   node tools/build-guide.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const { PARTS, GROUPS } = await import(join(root, 'parts.js'));

const SITE_URL = 'https://jonlaw19.github.io/microreactor/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INTRO = [
  'A microreactor is a small nuclear reactor, usually under 20 megawatts of electricity, that a factory builds and a truck delivers. This model shows a representative sodium-cooled, pool-type design of about 10 MWe, the building around it, the switchyard and transmission line, and the data center it powers.',
  'Liquid sodium carries heat from a compact core to heat exchangers at near atmospheric pressure. Control drums in the reflector set the power. Shutdown rods and passive air cooling keep the core safe with no pumps and no operator action. The whole module ships on one skid and sets into a concrete shield silo.',
  'Use the 3D model to cut the reactor open, explode it, search every part, run the start-up sequence, and change the physics live. The guide below lists every labeled component with its role and typical specifications.',
];

let html = '';
html += `<header class="gHead"><div class="eyebrow"><span class="dot"></span>Guide</div><h1>How a sodium-cooled microreactor works, and how it powers a data center</h1>${INTRO.map((p) => `<p class="lead">${esc(p)}</p>`).join('')}</header>\n`;
GROUPS.forEach((g) => {
  const parts = PARTS.filter((p) => p.group === g.id);
  if (!parts.length) return;
  html += `<section class="gGroup" id="guide-group-${g.id}"><h2>${esc(g.name)}</h2>\n`;
  parts.forEach((p) => {
    html += `<article class="gPart" id="guide-${p.id}"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p><dl>${p.specs.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><a class="tlink gShow" href="#${p.id}" data-part="${p.id}">Show in 3D →</a></article>\n`;
  });
  html += `</section>\n`;
});
html += `<footer class="gFoot"><p>A representative design for education. Values are typical of a 10 MWe class pool-type sodium-cooled microreactor and of a data center of about 8 MW. They do not describe a specific product. Model and text by microreactors.org.</p></footer>\n`;

const jsonld = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: 'How a sodium-cooled microreactor works, and how it powers a data center',
  description: 'An interactive 3D explainer of a 10 MWe sodium-cooled microreactor: core, control drums, sodium pool, passive safety, power conversion, grid connection, and the data center it powers.',
  url: SITE_URL,
  inLanguage: 'en',
  publisher: { '@type': 'Organization', name: 'microreactors.org', url: 'https://microreactors.org/' },
  about: [
    { '@type': 'Thing', name: 'Microreactor' },
    { '@type': 'Thing', name: 'Sodium-cooled fast reactor' },
    { '@type': 'Thing', name: 'Nuclear power for data centers' },
  ],
  hasPart: PARTS.map((p) => ({
    '@type': 'DefinedTerm',
    name: p.name,
    description: p.desc,
    url: `${SITE_URL}#${p.id}`,
    inDefinedTermSet: GROUPS.find((g) => g.id === p.group).name,
  })),
};

let index = readFileSync(join(root, 'index.html'), 'utf8');
const put = (start, end, body) => {
  const a = index.indexOf(start), b = index.indexOf(end);
  if (a < 0 || b < 0) throw new Error('markers missing: ' + start);
  index = index.slice(0, a + start.length) + '\n' + body + index.slice(b);
};
put('<!-- GUIDE:START -->', '<!-- GUIDE:END -->', html);
put('<!-- JSONLD:START -->', '<!-- JSONLD:END -->', `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`);
writeFileSync(join(root, 'index.html'), index);
console.log(`guide: ${PARTS.length} parts in ${GROUPS.length} groups written into index.html`);
