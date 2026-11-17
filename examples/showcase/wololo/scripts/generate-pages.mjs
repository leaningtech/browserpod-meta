// Writes one static landing page per entry in pages.config.mjs, plus
// public/sitemap.xml. Run with `npm run build:pages` after editing the config.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES, SITE_ORIGIN } from './pages.config.mjs';
import { CONVERSION_REGISTRY } from '../src/lib/conversion-registry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isSupported = (page) =>
  CONVERSION_REGISTRY.some(
    (entry) =>
      entry.sourceExtensions.includes(page.source) &&
      entry.targetExtensions.includes(page.target)
  );

const pageUrl = (page) => `${SITE_ORIGIN}/${page.slug}`;

function renderPage(page) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const others = PAGES.filter((other) => other.slug !== page.slug);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#f5f1e8" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${pageUrl(page)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Wololo" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${pageUrl(page)}" />
    <meta name="twitter:card" content="summary" />
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body class="has-notes">
    <div
      id="app"
      data-heading="${escapeHtml(page.heading)}"
      data-tagline="${escapeHtml(page.tagline)}"
      data-source-label="${escapeHtml(page.sourceLabel)}"
      data-target="${escapeHtml(page.target)}"
    >
      <main class="shell">
        <section class="mast">
          <a class="mast-home" href="/">Wololo</a>
          <h1 class="mast-title mast-title-page">${escapeHtml(page.heading)}</h1>
          <p class="mast-tagline">${escapeHtml(page.tagline)}</p>
        </section>
      </main>
    </div>
    <article class="notes">
      <section class="notes-block">
        <h2>How to convert ${escapeHtml(page.sourceLabel)} to ${escapeHtml(page.targetLabel)}</h2>
        <ol>
${page.steps.map((step) => `          <li>${escapeHtml(step)}</li>`).join('\n')}
        </ol>
      </section>
      <section class="notes-block">
        <h2>What to expect</h2>
        <ul>
${page.notes.map((note) => `          <li>${escapeHtml(note)}</li>`).join('\n')}
        </ul>
      </section>
      <section class="notes-block">
        <h2>More conversions</h2>
        <ul class="notes-links">
${others
  .map(
    (other) =>
      `          <li><a href="/${other.slug}">${escapeHtml(other.sourceLabel)} to ${escapeHtml(other.targetLabel)}</a></li>`
  )
  .join('\n')}
          <li><a href="/">All supported formats</a></li>
        </ul>
      </section>
      <p class="meta-note">
        <a href="https://browserpod.io" target="_blank" rel="noopener">Powered by BrowserPod</a>
      </p>
    </article>
    <div id="terminal-host" aria-hidden="true"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
`;
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
  if (!isSupported(page)) {
    throw new Error(`${page.slug}: ${page.source} to ${page.target} is missing from the conversion registry.`);
  }

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
