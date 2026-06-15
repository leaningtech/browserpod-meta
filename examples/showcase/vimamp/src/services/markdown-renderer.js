function escapeHtml(raw) {
  return String(raw || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(raw) {
  let html = escapeHtml(raw);

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");

  return html;
}

function renderMarkdownBlock(block) {
  const lines = String(block || "").split("\n");
  const html = [];
  let paragraph = [];
  let index = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    html.push(`<p>${paragraph.map((line) => renderInlineMarkdown(line)).join("<br />")}</p>`);
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      index += 1;
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      html.push(`<blockquote><p>${renderInlineMarkdown(quoteMatch[1])}</p></blockquote>`);
      index += 1;
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      html.push("<ol>");
      while (index < lines.length) {
        const next = lines[index].match(/^\s*\d+\.\s+(.+)$/);
        if (!next) {
          break;
        }
        html.push(`<li>${renderInlineMarkdown(next[1])}</li>`);
        index += 1;
      }
      html.push("</ol>");
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      html.push("<ul>");
      while (index < lines.length) {
        const next = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!next) {
          break;
        }
        html.push(`<li>${renderInlineMarkdown(next[1])}</li>`);
        index += 1;
      }
      html.push("</ul>");
      continue;
    }

    paragraph.push(trimmed);
    index += 1;
  }

  flushParagraph();
  return html.join("");
}

export function renderMarkdownToHtml(markdown) {
  const parts = String(markdown || "")
    .replaceAll("\r\n", "\n")
    .split(/(```[\s\S]*?```)/g);

  const html = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.replace(/^```/, "").replace(/```$/, "").replace(/^\n/, "");
      html.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      continue;
    }

    html.push(renderMarkdownBlock(part));
  }

  return html.join("");
}
