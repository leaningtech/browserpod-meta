// Writes one static landing page per entry in pages.config.mjs, using
// index.html as the template, plus public/sitemap.xml. Run with
// `npm run build:pages` after editing the config or the launcher markup.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, SITE_ORIGIN } from './pages.config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(path.join(root, 'index.html'), 'utf8');

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Replaces exactly one occurrence, so a change to index.html that breaks a
// landing page fails here instead of shipping.
function swap(html, pattern, replacement, label) {
  const matches = html.match(new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g')) ?? [];

  if (matches.length !== 1) {
    throw new Error(`${label}: expected one match in index.html, found ${matches.length}.`);
  }

  return html.replace(pattern, () => replacement);
}

const pageUrl = (page) => `${SITE_ORIGIN}/${page.slug}`;

function renderNotes(page) {
  const other = PAGES.filter((entry) => entry.slug !== page.slug);

  return `        <section class="launcher-notes">
          <div>
            <h2>${escapeHtml(page.stepsHeading)}</h2>
            <ol>
${page.steps.map((step) => `              <li>${escapeHtml(step)}</li>`).join('\n')}
            </ol>
          </div>
          <div>
            <h2>Good to know</h2>
            <ul>
${page.notes.map((note) => `              <li>${escapeHtml(note)}</li>`).join('\n')}
            </ul>
            <p class="launcher-notes-links">
${other
  .map((entry) => `              <a href="/${entry.slug}">${escapeHtml(entry.linkLabel)}</a>`)
  .join('\n')}
              <a href="/">PawnHub home</a>
            </p>
          </div>
        </section>
`;
}

function renderPage(page) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  let html = template;

  html = swap(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, 'title');
  html = swap(
    html,
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${description}" />`,
    'description'
  );
  html = swap(
    html,
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${pageUrl(page)}" />`,
    'canonical'
  );
  html = swap(
    html,
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${title}" />`,
    'og:title'
  );
  html = swap(
    html,
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${description}" />`,
    'og:description'
  );
  html = swap(
    html,
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${pageUrl(page)}" />`,
    'og:url'
  );
  html = swap(
    html,
    /<div class="launcher-overlay" id="launcher">/,
    `<div class="launcher-overlay has-notes" id="launcher" data-default-mode="${page.mode}">`,
    'launcher'
  );
  html = swap(
    html,
    /<h1 class="launcher-title">[^<]*<\/h1>/,
    `<h1 class="launcher-title">${escapeHtml(page.heading)}</h1>`,
    'heading'
  );
  html = swap(
    html,
    /<p class="launcher-copy">[^<]*<\/p>/,
    `<p class="launcher-copy">${escapeHtml(page.copy)}</p>`,
    'copy'
  );
  html = swap(
    html,
    /        <section class="launcher-notes">[\s\S]*?<\/section>\n/,
    renderNotes(page),
    'notes'
  );

  return html;
}

function renderSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [`${SITE_ORIGIN}/`, ...PAGES.map(pageUrl)];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => `  <url>\n    <loc>${url}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`)
  .join('\n')}
</urlset>
`;
}

for (const page of PAGES) {
  if (page.title.length > 60) {
    throw new Error(`${page.slug}: title is ${page.title.length} characters (limit 60).`);
  }

  if (page.description.length > 160) {
    throw new Error(`${page.slug}: description is ${page.description.length} characters (limit 160).`);
  }

  await writeFile(path.join(root, `${page.slug}.html`), renderPage(page));
  console.log(`wrote ${page.slug}.html (title ${page.title.length}, description ${page.description.length})`);
}

await writeFile(path.join(root, 'public', 'sitemap.xml'), renderSitemap());
console.log('wrote public/sitemap.xml');
