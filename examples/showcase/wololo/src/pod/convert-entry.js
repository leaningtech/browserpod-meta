import { promises as fs } from 'node:fs';
import path from 'node:path';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import { convert as htmlToText } from 'html-to-text';
import { DOMParser, parseHTML } from 'linkedom';
import mammoth from 'mammoth';
import { marked } from 'marked';
import * as XLSX from 'xlsx';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  trimValues: true,
});

const builder = new XMLBuilder({
  format: true,
  ignoreAttributes: false,
  suppressBooleanAttributes: false,
});

const MIME_TYPES = {
  csv: 'text/csv;charset=utf-8',
  html: 'text/html;charset=utf-8',
  json: 'application/json;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  txt: 'text/plain;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml;charset=utf-8',
};

const jobDir = process.argv[2] || '/project';
const requestPath = path.join(jobDir, 'request.json');
const progressPath = path.join(jobDir, '.progress.json');
const resultPath = path.join(jobDir, 'result.json');
const outDir = path.join(jobDir, 'out');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeBaseName(filename = '') {
  const withoutExtension = filename.replace(/\.[^.]+$/, '').trim();
  const sanitized = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'file';
}

function sanitizeSheetName(name) {
  const sanitized = String(name)
    .replace(/[\\/?*:[\]]/g, ' ')
    .trim()
    .slice(0, 31);

  return sanitized || 'Sheet1';
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function getMimeType(extension) {
  return MIME_TYPES[extension] || 'application/octet-stream';
}

function decodeText(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapHtmlDocument(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
      }

      body {
        margin: 32px;
        color: #11110f;
        background: #fffdf9;
        font-family: Georgia, 'Times New Roman', serif;
        line-height: 1.55;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
      }

      section + section {
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid #d6cfc2;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        border: 1px solid #d6cfc2;
        padding: 8px 10px;
        text-align: left;
        vertical-align: top;
      }

      pre {
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>
    <main>
${body}
    </main>
  </body>
</html>
`;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [{ value: rows }];
  }

  if (rows.length === 0) {
    return [];
  }

  if (rows.every(isPlainObject)) {
    return rows;
  }

  return rows.map((value) => ({ value }));
}

function sheetsFromJson(value) {
  if (Array.isArray(value)) {
    return [{ name: 'Sheet1', rows: normalizeRows(value) }];
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    const listEntries = entries.filter(([, entryValue]) => Array.isArray(entryValue));

    if (entries.length > 0 && listEntries.length === entries.length) {
      return listEntries.map(([name, rows]) => ({
        name: sanitizeSheetName(name),
        rows: normalizeRows(rows),
      }));
    }

    return [{ name: 'Sheet1', rows: normalizeRows([value]) }];
  }

  return [{ name: 'Sheet1', rows: [{ value }] }];
}

function workbookFromJson(value) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheetsFromJson(value)) {
    const worksheet =
      sheet.rows.length > 0
        ? XLSX.utils.json_to_sheet(sheet.rows)
        : XLSX.utils.aoa_to_sheet([]);

    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return workbook;
}

function workbookToStructuredJson(workbook) {
  const sheets = workbook.SheetNames.map((sheetName) => [
    sheetName,
    XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null }),
  ]);

  if (sheets.length === 1) {
    return sheets[0][1];
  }

  return Object.fromEntries(sheets);
}

function workbookToHtml(workbook, title) {
  const body = workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const table = XLSX.utils.sheet_to_html(worksheet);

    return `      <section>
        <h2>${escapeHtml(sheetName)}</h2>
        ${table}
      </section>`;
  }).join('\n');

  return wrapHtmlDocument(title, body);
}

function toXmlPayload(value) {
  if (isPlainObject(value) && Object.keys(value).length === 1) {
    return value;
  }

  return { root: value };
}

function structuredDataToXml(value) {
  return ensureTrailingNewline(builder.build(toXmlPayload(value)));
}

function htmlToPlainText(html) {
  return ensureTrailingNewline(
    htmlToText(html, {
      wordwrap: false,
      selectors: [
        {
          selector: 'a',
          options: {
            hideLinkHrefIfSameAsText: true,
          },
        },
      ],
    }).trimEnd()
  );
}

function installDomGlobals() {
  const { document, window } = parseHTML(
    '<!doctype html><html><body></body></html>'
  );

  globalThis.window = window;
  globalThis.document = document;
  globalThis.DOMParser = DOMParser;
  globalThis.Node = window.Node;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLAnchorElement = window.HTMLAnchorElement;
  globalThis.HTMLCollection = window.HTMLCollection;
  globalThis.NodeList = window.NodeList;
}

async function convertHtmlToMarkdown(html) {
  installDomGlobals();
  const { default: TurndownService } = await import('turndown');
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
  });

  return ensureTrailingNewline(service.turndown(html).trimEnd());
}

async function writeProgress(percent) {
  await fs.writeFile(progressPath, JSON.stringify({ percent: Math.round(percent) }), 'utf8');
}

async function writeResult(result) {
  await fs.writeFile(resultPath, JSON.stringify(result, null, 2), 'utf8');
}

async function writeOutput(fileName, extension, content) {
  await fs.mkdir(outDir, { recursive: true });

  const outputPath = path.join(outDir, fileName);

  if (typeof content === 'string') {
    await fs.writeFile(outputPath, content, 'utf8');
  } else {
    await fs.writeFile(outputPath, content);
  }

  return {
    path: outputPath,
    name: fileName,
    mime: getMimeType(extension),
  };
}

async function convertRequest(request) {
  const transition = `${request.sourceExt}->${request.targetExt}`;
  const inputBuffer = await fs.readFile(request.sourcePath);
  const baseName = sanitizeBaseName(request.sourceName);

  await writeProgress(28);

  switch (transition) {
    case 'json->xml': {
      const parsed = JSON.parse(decodeText(inputBuffer));
      const output = structuredDataToXml(parsed);

      await writeProgress(76);
      return writeOutput(`${baseName}.xml`, 'xml', output);
    }

    case 'json->csv': {
      const parsed = JSON.parse(decodeText(inputBuffer));
      const workbook = workbookFromJson(parsed);
      const csv = ensureTrailingNewline(
        XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]])
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.csv`, 'csv', csv);
    }

    case 'json->xlsx': {
      const parsed = JSON.parse(decodeText(inputBuffer));
      const workbook = workbookFromJson(parsed);
      const bytes = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      });

      await writeProgress(76);
      return writeOutput(`${baseName}.xlsx`, 'xlsx', bytes);
    }

    case 'json->txt': {
      const parsed = JSON.parse(decodeText(inputBuffer));
      const output = ensureTrailingNewline(JSON.stringify(parsed, null, 2));

      await writeProgress(76);
      return writeOutput(`${baseName}.txt`, 'txt', output);
    }

    case 'xml->json': {
      const parsed = parser.parse(decodeText(inputBuffer));
      const json = ensureTrailingNewline(JSON.stringify(parsed, null, 2));

      await writeProgress(76);
      return writeOutput(`${baseName}.json`, 'json', json);
    }

    case 'xml->csv': {
      const parsed = parser.parse(decodeText(inputBuffer));
      const workbook = workbookFromJson(parsed);
      const csv = ensureTrailingNewline(
        XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]])
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.csv`, 'csv', csv);
    }

    case 'xml->xlsx': {
      const parsed = parser.parse(decodeText(inputBuffer));
      const workbook = workbookFromJson(parsed);
      const bytes = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      });

      await writeProgress(76);
      return writeOutput(`${baseName}.xlsx`, 'xlsx', bytes);
    }

    case 'csv->json': {
      const workbook = XLSX.read(decodeText(inputBuffer), { type: 'string' });
      const data = workbookToStructuredJson(workbook);
      const json = ensureTrailingNewline(JSON.stringify(data, null, 2));

      await writeProgress(76);
      return writeOutput(`${baseName}.json`, 'json', json);
    }

    case 'csv->xlsx': {
      const workbook = XLSX.read(decodeText(inputBuffer), { type: 'string' });
      const bytes = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      });

      await writeProgress(76);
      return writeOutput(`${baseName}.xlsx`, 'xlsx', bytes);
    }

    case 'csv->xml': {
      const workbook = XLSX.read(decodeText(inputBuffer), { type: 'string' });
      const data = workbookToStructuredJson(workbook);
      const output = structuredDataToXml(data);

      await writeProgress(76);
      return writeOutput(`${baseName}.xml`, 'xml', output);
    }

    case 'xlsx->csv': {
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const csv = ensureTrailingNewline(
        XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]])
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.csv`, 'csv', csv);
    }

    case 'xlsx->json': {
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const json = ensureTrailingNewline(
        JSON.stringify(workbookToStructuredJson(workbook), null, 2)
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.json`, 'json', json);
    }

    case 'xlsx->html': {
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const html = workbookToHtml(workbook, baseName);

      await writeProgress(76);
      return writeOutput(`${baseName}.html`, 'html', html);
    }

    case 'xlsx->xml': {
      const workbook = XLSX.read(inputBuffer, { type: 'buffer' });
      const data = workbookToStructuredJson(workbook);
      const output = structuredDataToXml(data);

      await writeProgress(76);
      return writeOutput(`${baseName}.xml`, 'xml', output);
    }

    case 'md->html':
    case 'markdown->html': {
      const markdown = decodeText(inputBuffer);
      const rendered = await marked.parse(markdown);
      const html = wrapHtmlDocument(
        baseName,
        `      <section>\n        ${rendered}\n      </section>`
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.html`, 'html', html);
    }

    case 'md->txt':
    case 'markdown->txt': {
      const markdown = decodeText(inputBuffer);
      const rendered = await marked.parse(markdown);
      const output = htmlToPlainText(rendered);

      await writeProgress(76);
      return writeOutput(`${baseName}.txt`, 'txt', output);
    }

    case 'html->md':
    case 'htm->md': {
      const html = decodeText(inputBuffer);
      const markdown = await convertHtmlToMarkdown(html);

      await writeProgress(76);
      return writeOutput(`${baseName}.md`, 'md', markdown);
    }

    case 'html->txt':
    case 'htm->txt': {
      const html = decodeText(inputBuffer);
      const output = htmlToPlainText(html);

      await writeProgress(76);
      return writeOutput(`${baseName}.txt`, 'txt', output);
    }

    case 'docx->html': {
      const { value } = await mammoth.convertToHtml({ buffer: inputBuffer });
      const html = wrapHtmlDocument(
        baseName,
        `      <section>\n        ${value}\n      </section>`
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.html`, 'html', html);
    }

    case 'docx->txt': {
      const { value } = await mammoth.convertToHtml({ buffer: inputBuffer });
      const output = htmlToPlainText(value);

      await writeProgress(76);
      return writeOutput(`${baseName}.txt`, 'txt', output);
    }

    case 'docx->md': {
      const { value } = await mammoth.convertToHtml({ buffer: inputBuffer });
      const markdown = await convertHtmlToMarkdown(value);

      await writeProgress(76);
      return writeOutput(`${baseName}.md`, 'md', markdown);
    }

    case 'txt->html': {
      const text = decodeText(inputBuffer);
      const html = wrapHtmlDocument(
        baseName,
        `      <section>\n        <pre>${escapeHtml(text)}</pre>\n      </section>`
      );

      await writeProgress(76);
      return writeOutput(`${baseName}.html`, 'html', html);
    }

    case 'txt->md': {
      const text = decodeText(inputBuffer);
      const output = ensureTrailingNewline(text.trimEnd());

      await writeProgress(76);
      return writeOutput(`${baseName}.md`, 'md', output);
    }

    default:
      throw new Error('Unsupported conversion.');
  }
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  await writeProgress(8);

  const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
  const output = await convertRequest(request);

  await writeProgress(92);
  await writeResult({
    ok: true,
    outputKind: 'file',
    outputs: [output],
  });
  await writeProgress(100);
}

main().catch(async (error) => {
  const message = error instanceof Error && error.message ? error.message : String(error);

  await writeResult({
    ok: false,
    outputKind: 'file',
    outputs: [],
    error: message,
  });
  await writeProgress(100);
  process.exitCode = 1;
});
