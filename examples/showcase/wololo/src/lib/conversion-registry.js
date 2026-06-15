export const CONVERSION_REGISTRY = [
  {
    id: 'json',
    sourceExtensions: ['json'],
    targetExtensions: ['xml', 'csv', 'xlsx', 'txt'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'xml',
    sourceExtensions: ['xml'],
    targetExtensions: ['json', 'csv', 'xlsx'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'csv',
    sourceExtensions: ['csv'],
    targetExtensions: ['json', 'xlsx', 'xml'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'xlsx',
    sourceExtensions: ['xlsx'],
    targetExtensions: ['csv', 'json', 'html', 'xml'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'markdown',
    sourceExtensions: ['md', 'markdown'],
    targetExtensions: ['html', 'txt'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'html',
    sourceExtensions: ['html', 'htm'],
    targetExtensions: ['md', 'txt'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'docx',
    sourceExtensions: ['docx'],
    targetExtensions: ['html', 'txt', 'md'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'text',
    sourceExtensions: ['txt'],
    targetExtensions: ['html', 'md'],
    executionMode: 'pod',
    outputKind: 'file',
  },
  {
    id: 'pdf',
    sourceExtensions: ['pdf'],
    targetExtensions: ['png', 'jpg'],
    executionMode: 'host',
    outputKind: 'file',
  },
  {
    id: 'audio',
    sourceExtensions: ['wav'],
    targetExtensions: ['mp3'],
    executionMode: 'host',
    outputKind: 'file',
  },
  {
    id: 'audio',
    sourceExtensions: ['mp3'],
    targetExtensions: ['wav'],
    executionMode: 'host',
    outputKind: 'file',
  },
  {
    id: 'image',
    sourceExtensions: ['png'],
    targetExtensions: ['jpg', 'webp'],
    executionMode: 'host',
    outputKind: 'file',
  },
  {
    id: 'image',
    sourceExtensions: ['jpg', 'jpeg'],
    targetExtensions: ['png', 'webp'],
    executionMode: 'host',
    outputKind: 'file',
  },
  {
    id: 'image',
    sourceExtensions: ['webp'],
    targetExtensions: ['png', 'jpg'],
    executionMode: 'host',
    outputKind: 'file',
  },
];

const MIME_TYPES = {
  csv: 'text/csv;charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  htm: 'text/html;charset=utf-8',
  html: 'text/html;charset=utf-8',
  jpg: 'image/jpeg',
  json: 'application/json;charset=utf-8',
  jpeg: 'image/jpeg',
  md: 'text/markdown;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain;charset=utf-8',
  wav: 'audio/wav',
  webp: 'image/webp',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xml: 'application/xml;charset=utf-8',
  zip: 'application/zip',
};

const SUPPORTED_SOURCE_EXTENSIONS = Array.from(
  new Set(CONVERSION_REGISTRY.flatMap((entry) => entry.sourceExtensions))
);

export function getSupportedSourceExtensions() {
  return [...SUPPORTED_SOURCE_EXTENSIONS];
}

export function getFileExtension(filename = '') {
  const match = /\.([^.]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

export function getTargetsForSource(sourceExt) {
  const seen = new Set();

  return CONVERSION_REGISTRY
    .filter((entry) => entry.sourceExtensions.includes(sourceExt))
    .flatMap((entry) => entry.targetExtensions)
    .filter((targetExt) => {
      if (seen.has(targetExt)) {
        return false;
      }

      seen.add(targetExt);
      return true;
    });
}

export function findConversion(sourceExt, targetExt) {
  return (
    CONVERSION_REGISTRY.find(
      (entry) =>
        entry.sourceExtensions.includes(sourceExt) &&
        entry.targetExtensions.includes(targetExt)
    ) ?? null
  );
}

export function getMimeTypeForExtension(extension = '') {
  return MIME_TYPES[extension] ?? 'application/octet-stream';
}

export function sanitizeBaseName(filename = '') {
  const withoutExtension = filename.replace(/\.[^.]+$/, '').trim();
  const sanitized = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return sanitized || 'file';
}

export function formatTargetLabel(extension = '') {
  return extension.toUpperCase();
}
