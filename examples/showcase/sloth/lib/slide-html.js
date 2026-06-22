// Render a slide's markdown lines to clean HTML for the audience portal.
//
// This is a small, deliberately limited markdown subset matching what SLOTH
// decks use: headings (# / ##), -> centering <-, bullet and numbered lists,
// blockquotes, fenced code, images, and inline bold/italic/code/links. It is
// not a full markdown engine; it covers the deck dialect.

function esc (s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline (s) {
  // escape first, then add markup so our tags survive
  s = esc(s)
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<a>$1</a>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<u>$2</u>')
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  return s
}

// lines: the slide's text lines. Returns an HTML string. `centered` is set if
// any -> <- centering appears. Directive comments (<!-- ... -->), including
// multi-line ones like surveys, are stripped here and never displayed; the
// caller renders forms/attachments/etc. separately.
module.exports = function slideHtml (lines) {
  var out = []
  var inCode = false
  var inComment = false
  var listType = null // 'ul' | 'ol' | null
  var centered = false

  function closeList () {
    if (listType) { out.push('</' + listType + '>'); listType = null }
  }

  // First drop HTML comment blocks (single or multi line) so directive text
  // never leaks into the rendered slide.
  var text = lines.join('\n').replace(/<!--[\s\S]*?-->/g, '')
  lines = text.split('\n')

  lines.forEach(function (raw) {
    var line = raw
    // any stray comment fragments (defensive)
    if (inComment) { if (line.indexOf('-->') !== -1) inComment = false; return }
    if (/<!--/.test(line) && line.indexOf('-->') === -1) { inComment = true; return }

    // fenced code
    if (/^```/.test(line)) {
      if (!inCode) { closeList(); out.push('<pre><code>'); inCode = true } else { out.push('</code></pre>'); inCode = false }
      return
    }
    if (inCode) { out.push(esc(line)); return }

    // centering -> text <-
    var cm = /^->\s?(.*?)\s?<-\s*$/.exec(line)
    if (cm) { line = cm[1]; centered = true }

    if (/^#\s+/.test(line)) { closeList(); out.push('<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>'); return }
    if (/^#{2,}\s+/.test(line)) { closeList(); out.push('<h2>' + inline(line.replace(/^#{2,}\s+/, '')) + '</h2>'); return }

    // images ![alt](src)
    var im = /^!\[(.*?)\]\((.*)\)\s*$/.exec(line)
    if (im) { closeList(); out.push('<img alt="' + esc(im[1]) + '" src="' + esc(im[2]) + '" style="max-width:100%">'); return }

    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); out.push('<ul>'); listType = 'ul' }
      out.push('<li>' + inline(line.replace(/^\s*[-*+]\s+/, '')) + '</li>')
      return
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); out.push('<ol>'); listType = 'ol' }
      out.push('<li>' + inline(line.replace(/^\s*\d+\.\s+/, '')) + '</li>')
      return
    }
    if (/^>+/.test(line.trim())) {
      closeList()
      out.push('<blockquote>' + inline(line.replace(/^\s*>+\s?/, '')) + '</blockquote>')
      return
    }
    if (line.trim() === '') { closeList(); return }

    closeList()
    out.push('<p>' + inline(line) + '</p>')
  })
  if (inCode) out.push('</code></pre>')
  closeList()

  var html = out.join('\n')
  return { html: html, centered: centered }
}
