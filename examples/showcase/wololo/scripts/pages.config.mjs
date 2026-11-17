// Landing pages for single conversions. `npm run build:pages` writes one
// static HTML file per entry (plus sitemap.xml), and vite.config.mjs adds each
// file as a build input. All pairs listed here must exist in
// src/lib/conversion-registry.js.

export const SITE_ORIGIN = 'https://wololo.browserpod.io';

const IMAGE_NOTES = {
  png: 'PNG output is lossless and keeps transparency.',
  jpg: 'JPG output is saved at 92% quality. Transparent areas become white, because JPG has no transparency.',
  webp: 'WebP output is saved at 92% quality and keeps transparency.',
};

const imagePage = ({ slug, source, sourceLabel, target, targetLabel, why }) => ({
  slug,
  source,
  sourceLabel,
  target,
  targetLabel,
  title: `${sourceLabel} to ${targetLabel} Converter, Free and on Your Device | Wololo`,
  description: `Convert ${sourceLabel} to ${targetLabel} in your browser. Free, with zero uploads and zero sign-up: the image stays on your device. Powered by BrowserPod.`,
  heading: `${sourceLabel} to ${targetLabel} converter`,
  tagline: `Convert a ${sourceLabel} image to ${targetLabel} on your own device. Your file stays with you.`,
  steps: [
    `Drop a ${sourceLabel} file above, or choose one from your device.`,
    `Check that ${targetLabel} is selected, then press Convert.`,
    `Download the ${targetLabel} file.`,
  ],
  notes: [
    why,
    'The image keeps its original pixel dimensions.',
    IMAGE_NOTES[target],
    'The conversion runs in your browser tab, so the file stays on your device.',
  ],
});

const pdfPage = ({ slug, target, targetLabel, why }) => ({
  slug,
  source: 'pdf',
  sourceLabel: 'PDF',
  target,
  targetLabel,
  title: `PDF to ${targetLabel} Converter, Free and on Your Device | Wololo`,
  description: `Convert PDF pages to ${targetLabel} images in your browser. Free, with zero uploads and zero sign-up: the PDF stays on your device. Powered by BrowserPod.`,
  heading: `PDF to ${targetLabel} converter`,
  tagline: `Turn the pages of a PDF into ${targetLabel} images on your own device. Your file stays with you.`,
  steps: [
    'Drop a PDF above, or choose one from your device.',
    `Check that ${targetLabel} is selected, then press Convert.`,
    `Download the result: one ${targetLabel} image for a one-page PDF, or a ZIP of numbered images for a longer one.`,
  ],
  notes: [
    why,
    'Pages become separate images, rendered at about 133 DPI, or about 97 DPI for PDFs longer than 12 pages.',
    target === 'jpg'
      ? 'JPG images are saved at 92% quality on a white background.'
      : 'PNG images are lossless.',
    'The conversion runs in your browser tab, so the PDF stays on your device.',
  ],
});

const DEVICE_NOTE = 'The conversion runs in your browser tab, so the file stays on your device.';

const genericPage = ({ slug, source, sourceLabel, target, targetLabel, noun, tagline, steps, notes }) => ({
  slug,
  source,
  sourceLabel,
  target,
  targetLabel,
  title: `${sourceLabel} to ${targetLabel} Converter, Free and on Your Device | Wololo`,
  description: `Convert ${sourceLabel} to ${targetLabel} in your browser. Free, with zero uploads and zero sign-up: the ${noun} stays on your device. Powered by BrowserPod.`,
  heading: `${sourceLabel} to ${targetLabel} converter`,
  tagline,
  steps: steps ?? [
    `Drop a ${sourceLabel} file above, or choose one from your device.`,
    `Check that ${targetLabel} is selected, then press Convert.`,
    `Download the ${targetLabel} file.`,
  ],
  notes: [...notes, DEVICE_NOTE],
});

const audioPage = ({ slug, source, sourceLabel, target, targetLabel, notes }) =>
  genericPage({
    slug,
    source,
    sourceLabel,
    target,
    targetLabel,
    noun: 'audio',
    tagline: `Convert a ${sourceLabel} recording to ${targetLabel} on your own device. Your file stays with you.`,
    notes: [
      ...notes,
      'The audio engine (FFmpeg) is downloaded the first time you convert, so the first conversion takes a little longer.',
    ],
  });

const dataPage = ({ slug, source, sourceLabel, target, targetLabel, noun = 'data', notes }) =>
  genericPage({
    slug,
    source,
    sourceLabel,
    target,
    targetLabel,
    noun,
    tagline: `Convert a ${sourceLabel} file to ${targetLabel} on your own device. Your file stays with you.`,
    notes,
  });

export const PAGES = [
  imagePage({
    slug: 'webp-to-png',
    source: 'webp',
    sourceLabel: 'WebP',
    target: 'png',
    targetLabel: 'PNG',
    why: 'PNG opens in most image editors and viewers, which makes it a safe choice when a program refuses a WebP file.',
  }),
  pdfPage({
    slug: 'pdf-to-jpg',
    target: 'jpg',
    targetLabel: 'JPG',
    why: 'JPG images are small and open everywhere, which suits sharing a page in a message or placing it in a slide.',
  }),
  imagePage({
    slug: 'webp-to-jpg',
    source: 'webp',
    sourceLabel: 'WebP',
    target: 'jpg',
    targetLabel: 'JPG',
    why: 'JPG is accepted by most websites, forms and photo apps, which helps when an upload field rejects WebP.',
  }),
  pdfPage({
    slug: 'pdf-to-png',
    target: 'png',
    targetLabel: 'PNG',
    why: 'PNG keeps text and line art crisp, which suits screenshots of documents, diagrams and slides.',
  }),
  imagePage({
    slug: 'png-to-jpg',
    source: 'png',
    sourceLabel: 'PNG',
    target: 'jpg',
    targetLabel: 'JPG',
    why: 'JPG files are much smaller than PNG for photographs, which helps with email attachments and upload size limits.',
  }),
  imagePage({
    slug: 'jpg-to-png',
    source: 'jpg',
    sourceLabel: 'JPG',
    target: 'png',
    targetLabel: 'PNG',
    why: 'PNG is lossless, so the image can be edited and saved again while keeping its quality as it stands.',
  }),
  audioPage({
    slug: 'wav-to-mp3',
    source: 'wav',
    sourceLabel: 'WAV',
    target: 'mp3',
    targetLabel: 'MP3',
    notes: [
      'MP3 files are a fraction of the size of WAV, which suits sharing, streaming and phones.',
      'The MP3 is encoded with LAME at variable bitrate quality 2, about 190 kbps on average.',
    ],
  }),
  audioPage({
    slug: 'mp3-to-wav',
    source: 'mp3',
    sourceLabel: 'MP3',
    target: 'wav',
    targetLabel: 'WAV',
    notes: [
      'WAV is uncompressed, which audio editors, samplers and some hardware players expect.',
      'The WAV is written as 16-bit PCM. Converting from MP3 keeps the audio as it sounds today and adds nothing back.',
    ],
  }),
  imagePage({
    slug: 'png-to-webp',
    source: 'png',
    sourceLabel: 'PNG',
    target: 'webp',
    targetLabel: 'WebP',
    why: 'WebP files are smaller than PNG at similar quality, which makes web pages load faster.',
  }),
  imagePage({
    slug: 'jpg-to-webp',
    source: 'jpg',
    sourceLabel: 'JPG',
    target: 'webp',
    targetLabel: 'WebP',
    why: 'WebP files are usually smaller than JPG at similar quality, which makes web pages load faster.',
  }),
  dataPage({
    slug: 'json-to-csv',
    source: 'json',
    sourceLabel: 'JSON',
    target: 'csv',
    targetLabel: 'CSV',
    notes: [
      'A JSON array of objects becomes one row per object, with the object keys as column headers.',
      'For a JSON object that holds several lists, the first list is used.',
      'The CSV opens in Excel, Google Sheets and Numbers.',
    ],
  }),
  dataPage({
    slug: 'xlsx-to-csv',
    source: 'xlsx',
    sourceLabel: 'XLSX',
    target: 'csv',
    targetLabel: 'CSV',
    noun: 'spreadsheet',
    notes: [
      'The first worksheet of the Excel file is converted.',
      'Cell values are exported as they appear, with commas separating the columns.',
    ],
  }),
  dataPage({
    slug: 'xml-to-json',
    source: 'xml',
    sourceLabel: 'XML',
    target: 'json',
    targetLabel: 'JSON',
    notes: [
      'Elements become JSON objects, and attributes are kept.',
      'The JSON is formatted with two-space indentation, ready to read or paste into code.',
    ],
  }),
  dataPage({
    slug: 'csv-to-json',
    source: 'csv',
    sourceLabel: 'CSV',
    target: 'json',
    targetLabel: 'JSON',
    notes: [
      'The first row is read as column names, and the remaining rows become an array of JSON objects.',
      'Empty cells become null.',
      'The JSON is formatted with two-space indentation.',
    ],
  }),
  dataPage({
    slug: 'markdown-to-html',
    source: 'md',
    sourceLabel: 'Markdown',
    target: 'html',
    targetLabel: 'HTML',
    noun: 'document',
    notes: [
      'The result is a complete HTML document that opens in a browser.',
      'Headings, lists, links, tables and code blocks are converted.',
    ],
  }),
];
