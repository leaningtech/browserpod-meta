const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees
} = require('pdf-lib');

const app = express();
const port = 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

const PAGE_PRESETS = {
  A4: { label: 'A4 Portrait', width: 595.28, height: 841.89 },
  LETTER: { label: 'US Letter', width: 612, height: 792 },
  LANDSCAPE_A4: { label: 'A4 Landscape', width: 841.89, height: 595.28 }
};

const REPEAT_MODES = ['all', 'first', 'last', 'odd', 'even'];
const REPEAT_ROLES = ['header', 'footer', 'watermark'];
const BRAND_ROLES = ['logo', 'signature', 'stamp'];
const STAMP_LABELS = ['APPROVED', 'DRAFT', 'CONFIDENTIAL', 'PAID', 'VOID'];

const store = {
  workspace: createEmptyWorkspace(),
  assetData: new Map(),
  library: {
    templates: []
  }
};

hydrateFromSessionFile();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/workspace', (_req, res) => {
  res.json({ workspace: cloneWorkspace() });
});

app.get('/api/templates', (_req, res) => {
  res.json({
    builtInTemplates: createBuiltInTemplates(),
    customTemplates: cloneTemplates(store.library.templates)
  });
});

app.get('/api/assets/:assetId', (req, res) => {
  const asset = findAsset(req.params.assetId);

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const bytes = store.assetData.get(asset.id);

  if (!bytes) {
    return res.status(404).json({ error: 'Asset data missing' });
  }

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Content-Length', String(bytes.length));
  res.send(bytes);
});

app.post('/api/import/pdf', upload.array('files'), async (req, res) => {
  try {
    if (!req.files?.length) {
      return res.status(400).json({ error: 'Upload at least one PDF file.' });
    }

    for (const file of req.files) {
      const pdf = await PDFDocument.load(file.buffer);
      const pages = pdf.getPages().map((page) => ({
        width: page.getWidth(),
        height: page.getHeight()
      }));

      const asset = {
        id: createId('asset'),
        kind: 'pdf',
        name: file.originalname,
        mimeType: file.mimetype || 'application/pdf',
        pages,
        pageCount: pages.length
      };

      store.workspace.assets.push(asset);
      store.assetData.set(asset.id, Buffer.from(file.buffer));

      const newPages = pages.map((pageInfo, index) => ({
        id: createId('page'),
        kind: 'imported',
        width: pageInfo.width,
        height: pageInfo.height,
        rotation: 0,
        sourceAssetId: asset.id,
        sourcePageIndex: index
      }));

      store.workspace.pages.push(...newPages);
      store.workspace.selection.pageId = newPages[0]?.id ?? store.workspace.selection.pageId;
    }

    cleanupWorkspaceSelection();
    res.json({ workspace: cloneWorkspace() });
  } catch (error) {
    console.error('PDF import failed:', error);
    res.status(400).json({ error: 'Could not read one or more PDF files.' });
  }
});

app.post('/api/import/image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Choose an image to upload.' });
    }

    if (!['image/png', 'image/jpeg'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PNG and JPEG images are supported.' });
    }

    const width = Number(req.body.width) || 300;
    const height = Number(req.body.height) || 160;

    const asset = {
      id: createId('asset'),
      kind: 'image',
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      width,
      height
    };

    store.workspace.assets.push(asset);
    store.assetData.set(asset.id, Buffer.from(req.file.buffer));

    res.json({
      asset,
      brandEligible: true
    });
  } catch (error) {
    console.error('Image import failed:', error);
    res.status(400).json({ error: 'Could not import that image.' });
  }
});

app.post('/api/workspace/view', (req, res) => {
  mergeClientState(req.body);
  res.status(204).send();
});

app.post('/api/workspace/commands', (req, res) => {
  try {
    const { type, payload = {}, clientState } = req.body || {};

    if (!type) {
      return res.status(400).json({ error: 'Command type is required.' });
    }

    applyCommand(type, payload);
    mergeClientState(clientState);
    cleanupWorkspaceSelection();

    res.json({ workspace: cloneWorkspace() });
  } catch (error) {
    console.error('Command failed:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/session/export', (_req, res) => {
  res.json(serializeSessionBundle());
});

app.post('/api/templates/instantiate', (req, res) => {
  try {
    const template = findTemplate(req.body?.templateId);

    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    instantiateTemplate(template, req.body?.values || {});
    cleanupWorkspaceSelection();
    res.json({ workspace: cloneWorkspace() });
  } catch (error) {
    console.error('Template instantiation failed:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/templates/save', (req, res) => {
  try {
    const template = saveCurrentWorkspaceAsTemplate(req.body || {});
    res.json({
      template,
      customTemplates: cloneTemplates(store.library.templates)
    });
  } catch (error) {
    console.error('Saving template failed:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/templates/:templateId', (req, res) => {
  const index = store.library.templates.findIndex((template) => template.id === req.params.templateId);

  if (index === -1) {
    return res.status(404).json({ error: 'Template not found.' });
  }

  store.library.templates.splice(index, 1);
  res.json({ customTemplates: cloneTemplates(store.library.templates) });
});

app.post('/api/export/pdf', async (_req, res) => {
  try {
    const pdfBytes = await buildExportedPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="browserpod-pdf-studio.pdf"');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ error: 'Failed to export the PDF.' });
  }
});

app.listen(port, () => {
  console.log(`PDF Studio running on port ${port}`);
});

function createDefaultPresets() {
  return {
    textPresets: [
      {
        id: 'text_title',
        name: 'Title',
        patch: {
          payload: {
            font: 'TimesRoman',
            fontSize: 30,
            color: '#6b2f1c',
            align: 'left'
          }
        }
      },
      {
        id: 'text_body',
        name: 'Body',
        patch: {
          payload: {
            font: 'Helvetica',
            fontSize: 14,
            color: '#2d2620',
            align: 'left'
          }
        }
      },
      {
        id: 'text_caption',
        name: 'Caption',
        patch: {
          payload: {
            font: 'Helvetica',
            fontSize: 10,
            color: '#7a6d65',
            align: 'left'
          }
        }
      },
      {
        id: 'text_footer',
        name: 'Footer',
        patch: {
          payload: {
            font: 'Courier',
            fontSize: 10,
            color: '#574e48',
            align: 'right'
          }
        }
      }
    ],
    shapePresets: [
      {
        id: 'shape_brand_accent',
        name: 'Brand Accent',
        patch: {
          payload: {
            strokeColor: '#b6532f',
            fillColor: 'transparent',
            strokeWidth: 3
          }
        }
      },
      {
        id: 'shape_neutral_outline',
        name: 'Neutral Outline',
        patch: {
          payload: {
            strokeColor: '#665b52',
            fillColor: 'transparent',
            strokeWidth: 2
          }
        }
      },
      {
        id: 'shape_highlight',
        name: 'Highlight',
        patch: {
          opacity: 0.35,
          payload: {
            strokeColor: '#d59b00',
            fillColor: '#ffd95e',
            strokeWidth: 1.5
          }
        }
      }
    ],
    stampPresets: [
      {
        id: 'stamp_approval_red',
        name: 'Approval Red',
        patch: {
          payload: {
            label: 'APPROVED',
            textColor: '#8f2b21',
            strokeColor: '#8f2b21',
            fillColor: 'transparent',
            borderShape: 'rect',
            fontSize: 22
          },
          rotation: -12
        }
      },
      {
        id: 'stamp_review_blue',
        name: 'Review Blue',
        patch: {
          payload: {
            label: 'DRAFT',
            textColor: '#21548f',
            strokeColor: '#21548f',
            fillColor: 'transparent',
            borderShape: 'oval',
            fontSize: 20
          },
          rotation: -10
        }
      },
      {
        id: 'stamp_muted_gray',
        name: 'Muted Gray',
        patch: {
          payload: {
            label: 'CONFIDENTIAL',
            textColor: '#6a6460',
            strokeColor: '#6a6460',
            fillColor: 'transparent',
            borderShape: 'rect',
            fontSize: 18
          },
          rotation: -8
        }
      }
    ]
  };
}

function createBuiltInTemplates() {
  return [
    {
      id: 'builtin_letterhead',
      source: 'built-in',
      name: 'Letterhead',
      description: 'A polished first page with header, body copy, and footer details.',
      category: 'Business',
      version: 1,
      variables: [
        { key: 'companyName', label: 'Company name', type: 'text', defaultValue: 'Northwind Studio' },
        { key: 'tagline', label: 'Tagline', type: 'text', defaultValue: 'Designing practical systems for modern teams' },
        { key: 'bodyCopy', label: 'Body copy', type: 'multiline', defaultValue: 'Write your letter here.' },
        { key: 'contactLine', label: 'Footer contact line', type: 'text', defaultValue: 'hello@northwind.example · +1 (555) 010-2000 · northwind.example' }
      ],
      recommendedBrandRoles: ['logo'],
      defaultPresets: createDefaultPresets(),
      pageBlueprints: [
        {
          role: 'cover',
          page: { kind: 'blank', width: PAGE_PRESETS.A4.width, height: PAGE_PRESETS.A4.height, rotation: 0 },
          objects: [
            {
              type: 'image',
              bounds: { x: 48, y: 34, width: 120, height: 60 },
              opacity: 1,
              payload: {
                assetBinding: { kind: 'brandRole', role: 'logo' }
              }
            },
            {
              type: 'text',
              bounds: { x: 48, y: 112, width: 360, height: 48 },
              payload: {
                text: '{{companyName}}',
                font: 'TimesRoman',
                fontSize: 28,
                color: '#6b2f1c',
                align: 'left'
              },
              presetId: 'text_title'
            },
            {
              type: 'text',
              bounds: { x: 48, y: 156, width: 420, height: 30 },
              payload: {
                text: '{{tagline}}',
                font: 'Helvetica',
                fontSize: 14,
                color: '#665b52',
                align: 'left'
              },
              presetId: 'text_body'
            },
            {
              type: 'line',
              bounds: { x: 48, y: 204, width: 500, height: 18 },
              payload: {
                strokeColor: '#b6532f',
                strokeWidth: 2,
                start: { x: 0, y: 0.5 },
                end: { x: 1, y: 0.5 }
              },
              presetId: 'shape_brand_accent'
            },
            {
              type: 'text',
              bounds: { x: 48, y: 252, width: 500, height: 260 },
              payload: {
                text: '{{bodyCopy}}',
                font: 'Helvetica',
                fontSize: 15,
                color: '#2d2620',
                align: 'left'
              },
              presetId: 'text_body'
            }
          ]
        }
      ],
      repeatedObjects: [
        {
          type: 'text',
          target: { kind: 'repeat', repeatMode: 'all' },
          bounds: { x: 48, y: PAGE_PRESETS.A4.height - 42, width: 500, height: 20 },
          opacity: 0.92,
          payload: {
            text: '{{contactLine}}  ·  Page {{pageNumber}} of {{pageCount}}',
            font: 'Courier',
            fontSize: 10,
            color: '#574e48',
            align: 'right',
            repeatRole: 'footer'
          },
          presetId: 'text_footer'
        }
      ]
    },
    {
      id: 'builtin_invoice',
      source: 'built-in',
      name: 'Invoice',
      description: 'A client-ready invoice starter with headline figures and payment block.',
      category: 'Finance',
      version: 1,
      variables: [
        { key: 'companyName', label: 'Company name', type: 'text', defaultValue: 'Northwind Studio' },
        { key: 'invoiceNumber', label: 'Invoice number', type: 'text', defaultValue: 'INV-2026-001' },
        { key: 'invoiceDate', label: 'Invoice date', type: 'date', defaultValue: '2026-03-14' },
        { key: 'billTo', label: 'Bill to', type: 'multiline', defaultValue: 'Acme Industries\n47 Orchard Lane\nDenver, CO 80202' },
        { key: 'summaryLine', label: 'Summary line', type: 'text', defaultValue: 'Strategy workshop and implementation support' },
        { key: 'totalAmount', label: 'Total amount', type: 'currency', defaultValue: '$4,200.00' },
        { key: 'paymentTerms', label: 'Payment terms', type: 'text', defaultValue: 'Net 14 · ACH preferred' }
      ],
      recommendedBrandRoles: ['logo'],
      defaultPresets: createDefaultPresets(),
      pageBlueprints: [
        {
          role: 'invoice',
          page: { kind: 'blank', width: PAGE_PRESETS.LETTER.width, height: PAGE_PRESETS.LETTER.height, rotation: 0 },
          objects: [
            {
              type: 'image',
              bounds: { x: 44, y: 36, width: 110, height: 54 },
              payload: {
                assetBinding: { kind: 'brandRole', role: 'logo' }
              }
            },
            {
              type: 'text',
              bounds: { x: 44, y: 112, width: 260, height: 44 },
              payload: {
                text: '{{companyName}}',
                font: 'TimesRoman',
                fontSize: 24,
                color: '#6b2f1c',
                align: 'left'
              },
              presetId: 'text_title'
            },
            {
              type: 'stamp',
              bounds: { x: 424, y: 42, width: 138, height: 70 },
              rotation: -8,
              opacity: 1,
              payload: {
                stampKind: 'text',
                label: 'INVOICE',
                borderShape: 'rect',
                strokeColor: '#8f2b21',
                textColor: '#8f2b21',
                fillColor: 'transparent',
                strokeWidth: 2,
                fontSize: 20,
                font: 'HelveticaBold'
              },
              presetId: 'stamp_approval_red'
            },
            {
              type: 'text',
              bounds: { x: 44, y: 182, width: 240, height: 52 },
              payload: {
                text: 'Bill To\n{{billTo}}',
                font: 'Helvetica',
                fontSize: 14,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'rect',
              bounds: { x: 320, y: 164, width: 242, height: 126 },
              payload: {
                strokeColor: '#b6532f',
                fillColor: 'transparent',
                strokeWidth: 2
              },
              presetId: 'shape_brand_accent'
            },
            {
              type: 'text',
              bounds: { x: 338, y: 182, width: 200, height: 24 },
              payload: {
                text: 'Invoice #: {{invoiceNumber}}',
                font: 'HelveticaBold',
                fontSize: 14,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 338, y: 214, width: 200, height: 24 },
              payload: {
                text: 'Date: {{invoiceDate}}',
                font: 'Helvetica',
                fontSize: 13,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 338, y: 246, width: 200, height: 32 },
              payload: {
                text: 'Total Due: {{totalAmount}}',
                font: 'HelveticaBold',
                fontSize: 18,
                color: '#6b2f1c',
                align: 'left'
              }
            },
            {
              type: 'line',
              bounds: { x: 44, y: 332, width: 518, height: 20 },
              payload: {
                strokeColor: '#d2c3ba',
                strokeWidth: 1.5,
                start: { x: 0, y: 0.5 },
                end: { x: 1, y: 0.5 }
              }
            },
            {
              type: 'text',
              bounds: { x: 44, y: 364, width: 360, height: 30 },
              payload: {
                text: '{{summaryLine}}',
                font: 'HelveticaBold',
                fontSize: 16,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 44, y: 402, width: 500, height: 100 },
              payload: {
                text: 'Thank you for your business.\nPayment terms: {{paymentTerms}}',
                font: 'Helvetica',
                fontSize: 14,
                color: '#2d2620',
                align: 'left'
              }
            }
          ]
        }
      ],
      repeatedObjects: [
        {
          type: 'text',
          target: { kind: 'repeat', repeatMode: 'all' },
          bounds: { x: 44, y: PAGE_PRESETS.LETTER.height - 34, width: 520, height: 20 },
          payload: {
            text: 'Invoice {{invoiceNumber}}  ·  Page {{pageNumber}} of {{pageCount}}',
            font: 'Courier',
            fontSize: 10,
            color: '#574e48',
            align: 'right',
            repeatRole: 'footer'
          },
          presetId: 'text_footer'
        }
      ]
    },
    {
      id: 'builtin_certificate',
      source: 'built-in',
      name: 'Certificate',
      description: 'A formal certificate layout with title, recipient, and signature line.',
      category: 'Recognition',
      version: 1,
      variables: [
        { key: 'certificateTitle', label: 'Certificate title', type: 'text', defaultValue: 'Certificate of Completion' },
        { key: 'recipientName', label: 'Recipient', type: 'text', defaultValue: 'Jordan Avery' },
        { key: 'awardReason', label: 'Award text', type: 'multiline', defaultValue: 'In recognition of outstanding completion of the Brand Pack workshop.' },
        { key: 'awardDate', label: 'Date', type: 'date', defaultValue: '2026-03-14' },
        { key: 'signatoryName', label: 'Signatory', type: 'text', defaultValue: 'Morgan Lee' },
        { key: 'signatoryTitle', label: 'Signatory title', type: 'text', defaultValue: 'Program Director' }
      ],
      recommendedBrandRoles: ['signature', 'logo'],
      defaultPresets: createDefaultPresets(),
      pageBlueprints: [
        {
          role: 'certificate',
          page: { kind: 'blank', width: PAGE_PRESETS.LANDSCAPE_A4.width, height: PAGE_PRESETS.LANDSCAPE_A4.height, rotation: 0 },
          objects: [
            {
              type: 'rect',
              bounds: { x: 22, y: 22, width: PAGE_PRESETS.LANDSCAPE_A4.width - 44, height: PAGE_PRESETS.LANDSCAPE_A4.height - 44 },
              payload: {
                strokeColor: '#b6532f',
                fillColor: 'transparent',
                strokeWidth: 3
              },
              presetId: 'shape_brand_accent'
            },
            {
              type: 'text',
              bounds: { x: 140, y: 74, width: 560, height: 40 },
              payload: {
                text: '{{certificateTitle}}',
                font: 'TimesRoman',
                fontSize: 30,
                color: '#6b2f1c',
                align: 'center'
              },
              presetId: 'text_title'
            },
            {
              type: 'text',
              bounds: { x: 140, y: 184, width: 560, height: 42 },
              payload: {
                text: '{{recipientName}}',
                font: 'TimesRoman',
                fontSize: 28,
                color: '#2d2620',
                align: 'center'
              }
            },
            {
              type: 'text',
              bounds: { x: 160, y: 236, width: 520, height: 70 },
              payload: {
                text: '{{awardReason}}',
                font: 'Helvetica',
                fontSize: 16,
                color: '#2d2620',
                align: 'center'
              }
            },
            {
              type: 'line',
              bounds: { x: 154, y: 398, width: 220, height: 16 },
              payload: {
                strokeColor: '#665b52',
                strokeWidth: 1.5,
                start: { x: 0, y: 0.5 },
                end: { x: 1, y: 0.5 }
              }
            },
            {
              type: 'text',
              bounds: { x: 154, y: 414, width: 220, height: 44 },
              payload: {
                text: '{{signatoryName}}\n{{signatoryTitle}}',
                font: 'Helvetica',
                fontSize: 12,
                color: '#2d2620',
                align: 'center'
              }
            },
            {
              type: 'image',
              bounds: { x: 184, y: 338, width: 160, height: 48 },
              payload: {
                assetBinding: { kind: 'brandRole', role: 'signature' }
              }
            },
            {
              type: 'text',
              bounds: { x: 586, y: 414, width: 130, height: 24 },
              payload: {
                text: '{{awardDate}}',
                font: 'Courier',
                fontSize: 12,
                color: '#574e48',
                align: 'right'
              }
            }
          ]
        }
      ],
      repeatedObjects: []
    },
    {
      id: 'builtin_proposal_cover',
      source: 'built-in',
      name: 'Proposal Cover',
      description: 'A clean opening page for proposals, decks, and project briefs.',
      category: 'Sales',
      version: 1,
      variables: [
        { key: 'proposalTitle', label: 'Proposal title', type: 'text', defaultValue: 'Q2 Brand Experience Proposal' },
        { key: 'clientName', label: 'Client', type: 'text', defaultValue: 'Acme Industries' },
        { key: 'subtitle', label: 'Subtitle', type: 'text', defaultValue: 'Prepared by Northwind Studio' },
        { key: 'proposalDate', label: 'Date', type: 'date', defaultValue: '2026-03-14' }
      ],
      recommendedBrandRoles: ['logo'],
      defaultPresets: createDefaultPresets(),
      pageBlueprints: [
        {
          role: 'cover',
          page: { kind: 'blank', width: PAGE_PRESETS.A4.width, height: PAGE_PRESETS.A4.height, rotation: 0 },
          objects: [
            {
              type: 'ellipse',
              bounds: { x: 352, y: 48, width: 220, height: 220 },
              opacity: 0.15,
              payload: {
                strokeColor: '#b6532f',
                fillColor: '#e8c7b2',
                strokeWidth: 1
              }
            },
            {
              type: 'image',
              bounds: { x: 48, y: 48, width: 120, height: 52 },
              payload: {
                assetBinding: { kind: 'brandRole', role: 'logo' }
              }
            },
            {
              type: 'text',
              bounds: { x: 48, y: 236, width: 470, height: 86 },
              payload: {
                text: '{{proposalTitle}}',
                font: 'TimesRoman',
                fontSize: 34,
                color: '#6b2f1c',
                align: 'left'
              },
              presetId: 'text_title'
            },
            {
              type: 'text',
              bounds: { x: 48, y: 344, width: 420, height: 30 },
              payload: {
                text: '{{clientName}}',
                font: 'HelveticaBold',
                fontSize: 20,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 48, y: 390, width: 420, height: 26 },
              payload: {
                text: '{{subtitle}}',
                font: 'Helvetica',
                fontSize: 15,
                color: '#665b52',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 48, y: 692, width: 220, height: 20 },
              payload: {
                text: '{{proposalDate}}',
                font: 'Courier',
                fontSize: 12,
                color: '#574e48',
                align: 'left'
              }
            }
          ]
        }
      ],
      repeatedObjects: []
    },
    {
      id: 'builtin_approval_memo',
      source: 'built-in',
      name: 'Approval Memo',
      description: 'A decision memo starter with signoff and approval stamp space.',
      category: 'Operations',
      version: 1,
      variables: [
        { key: 'memoTitle', label: 'Memo title', type: 'text', defaultValue: 'Approval Memo' },
        { key: 'memoOwner', label: 'Prepared by', type: 'text', defaultValue: 'Alex Parker' },
        { key: 'memoDate', label: 'Date', type: 'date', defaultValue: '2026-03-14' },
        { key: 'memoBody', label: 'Memo body', type: 'multiline', defaultValue: 'Summarize the request, rationale, and decision needed.' }
      ],
      recommendedBrandRoles: ['signature'],
      defaultPresets: createDefaultPresets(),
      pageBlueprints: [
        {
          role: 'memo',
          page: { kind: 'blank', width: PAGE_PRESETS.LETTER.width, height: PAGE_PRESETS.LETTER.height, rotation: 0 },
          objects: [
            {
              type: 'text',
              bounds: { x: 44, y: 52, width: 320, height: 40 },
              payload: {
                text: '{{memoTitle}}',
                font: 'TimesRoman',
                fontSize: 28,
                color: '#6b2f1c',
                align: 'left'
              },
              presetId: 'text_title'
            },
            {
              type: 'text',
              bounds: { x: 44, y: 104, width: 240, height: 42 },
              payload: {
                text: 'Prepared by: {{memoOwner}}\nDate: {{memoDate}}',
                font: 'Helvetica',
                fontSize: 13,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'text',
              bounds: { x: 44, y: 186, width: 520, height: 220 },
              payload: {
                text: '{{memoBody}}',
                font: 'Helvetica',
                fontSize: 14,
                color: '#2d2620',
                align: 'left'
              }
            },
            {
              type: 'stamp',
              bounds: { x: 394, y: 446, width: 150, height: 80 },
              rotation: -10,
              opacity: 1,
              payload: {
                stampKind: 'text',
                label: 'APPROVED',
                borderShape: 'oval',
                strokeColor: '#8f2b21',
                textColor: '#8f2b21',
                fillColor: 'transparent',
                strokeWidth: 2,
                fontSize: 18,
                font: 'HelveticaBold'
              },
              presetId: 'stamp_approval_red'
            },
            {
              type: 'line',
              bounds: { x: 44, y: 610, width: 220, height: 16 },
              payload: {
                strokeColor: '#665b52',
                strokeWidth: 1.5,
                start: { x: 0, y: 0.5 },
                end: { x: 1, y: 0.5 }
              }
            },
            {
              type: 'image',
              bounds: { x: 72, y: 556, width: 160, height: 46 },
              payload: {
                assetBinding: { kind: 'brandRole', role: 'signature' }
              }
            }
          ]
        }
      ],
      repeatedObjects: []
    }
  ];
}

function createEmptyWorkspace() {
  const defaultPage = createBlankWorkspacePage();

  return {
    version: 2,
    pages: [defaultPage],
    assets: [],
    brandAssets: [],
    objects: [],
    selection: {
      pageId: defaultPage.id,
      objectId: null
    },
    viewState: {
      zoom: 1
    },
    presets: createDefaultPresets()
  };
}

function cloneWorkspace() {
  return JSON.parse(JSON.stringify(store.workspace));
}

function cloneTemplates(templates = []) {
  return JSON.parse(JSON.stringify(templates));
}

function normalizeWorkspace(input = {}) {
  const defaults = createDefaultPresets();
  const workspace = {
    version: input.version || 2,
    pages: Array.isArray(input.pages) ? input.pages : [],
    assets: Array.isArray(input.assets) ? input.assets : [],
    brandAssets: Array.isArray(input.brandAssets) ? input.brandAssets : [],
    objects: Array.isArray(input.objects) ? input.objects.map(normalizeObject) : [],
    selection: {
      pageId: input.selection?.pageId || null,
      objectId: input.selection?.objectId || null
    },
    viewState: {
      zoom: Number(input.viewState?.zoom) || 1
    },
    presets: {
      textPresets: Array.isArray(input.presets?.textPresets) && input.presets.textPresets.length
        ? input.presets.textPresets
        : defaults.textPresets,
      shapePresets: Array.isArray(input.presets?.shapePresets) && input.presets.shapePresets.length
        ? input.presets.shapePresets
        : defaults.shapePresets,
      stampPresets: Array.isArray(input.presets?.stampPresets) && input.presets.stampPresets.length
        ? input.presets.stampPresets
        : defaults.stampPresets
    }
  };

  if (!workspace.pages.length) {
    const defaultPage = createBlankWorkspacePage();
    workspace.pages = [defaultPage];
    workspace.selection.pageId = defaultPage.id;
  }

  return workspace;
}

function createBlankWorkspacePage() {
  return {
    id: createId('page'),
    kind: 'blank',
    width: PAGE_PRESETS.A4.width,
    height: PAGE_PRESETS.A4.height,
    rotation: 0
  };
}

function normalizeTemplate(template = {}) {
  return {
    id: template.id || createId('tpl'),
    source: template.source === 'built-in' ? 'built-in' : 'custom',
    name: template.name || 'Untitled Template',
    description: template.description || '',
    category: template.category || 'General',
    version: template.version || 1,
    variables: Array.isArray(template.variables) ? template.variables.map(normalizeTemplateVariable) : [],
    pageBlueprints: Array.isArray(template.pageBlueprints) ? template.pageBlueprints.map(normalizePageBlueprint) : [],
    repeatedObjects: Array.isArray(template.repeatedObjects) ? template.repeatedObjects.map(normalizeTemplateObject) : [],
    defaultPresets: template.defaultPresets || createDefaultPresets(),
    recommendedBrandRoles: Array.isArray(template.recommendedBrandRoles)
      ? template.recommendedBrandRoles.filter((role) => BRAND_ROLES.includes(role))
      : []
  };
}

function normalizeTemplateVariable(variable = {}) {
  return {
    key: variable.key || createId('var'),
    label: variable.label || variable.key || 'Field',
    type: variable.type || 'text',
    defaultValue: variable.defaultValue ?? '',
    required: Boolean(variable.required),
    scope: variable.scope || 'document'
  };
}

function normalizePageBlueprint(pageBlueprint = {}) {
  return {
    role: pageBlueprint.role || 'page',
    page: {
      kind: pageBlueprint.page?.kind || 'blank',
      width: Number(pageBlueprint.page?.width) || PAGE_PRESETS.A4.width,
      height: Number(pageBlueprint.page?.height) || PAGE_PRESETS.A4.height,
      rotation: Number(pageBlueprint.page?.rotation) || 0,
      sourceAssetId: pageBlueprint.page?.sourceAssetId || null,
      sourcePageIndex: Number.isInteger(pageBlueprint.page?.sourcePageIndex) ? pageBlueprint.page.sourcePageIndex : null
    },
    objects: Array.isArray(pageBlueprint.objects) ? pageBlueprint.objects.map(normalizeTemplateObject) : []
  };
}

function normalizeTemplateObject(object = {}) {
  const normalized = normalizeObject({
    ...object,
    target: object.target || { kind: 'page', pageId: 'template' }
  });

  if (object.target?.kind === 'repeat') {
    normalized.target = normalizeTarget(object.target);
  } else {
    normalized.target = { kind: 'page', pageId: 'template' };
  }

  return normalized;
}

function normalizeObject(object = {}) {
  const target = object.target
    ? normalizeTarget(object.target)
    : normalizeTarget({ kind: 'page', pageId: object.pageId || null });

  return {
    id: object.id || createId('obj'),
    type: object.type || 'text',
    target,
    bounds: {
      x: Number(object.bounds?.x) || 0,
      y: Number(object.bounds?.y) || 0,
      width: Math.max(Number(object.bounds?.width) || 0, 24),
      height: Math.max(Number(object.bounds?.height) || 0, 24)
    },
    rotation: Number(object.rotation) || 0,
    opacity: object.opacity ?? 1,
    zIndex: Number(object.zIndex) || 1,
    payload: object.payload || {},
    locked: Boolean(object.locked),
    hidden: Boolean(object.hidden),
    presetId: object.presetId || null
  };
}

function normalizeTarget(target = {}) {
  if (target.kind === 'repeat') {
    return {
      kind: 'repeat',
      repeatMode: REPEAT_MODES.includes(target.repeatMode) ? target.repeatMode : 'all'
    };
  }

  return {
    kind: 'page',
    pageId: target.pageId || null
  };
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function findAsset(assetId) {
  return store.workspace.assets.find((asset) => asset.id === assetId) || null;
}

function findBrandAsset(brandAssetId) {
  return store.workspace.brandAssets.find((brandAsset) => brandAsset.id === brandAssetId) || null;
}

function findPage(pageId) {
  return store.workspace.pages.find((page) => page.id === pageId) || null;
}

function findObject(objectId) {
  return store.workspace.objects.find((object) => object.id === objectId) || null;
}

function findPreset(presetId) {
  const presets = store.workspace.presets;
  return [
    ...presets.textPresets,
    ...presets.shapePresets,
    ...presets.stampPresets
  ].find((preset) => preset.id === presetId) || null;
}

function findTemplate(templateId) {
  return [
    ...createBuiltInTemplates(),
    ...store.library.templates
  ].map(normalizeTemplate).find((template) => template.id === templateId) || null;
}

function resolveAssetBinding(assetBinding) {
  if (!assetBinding) {
    return null;
  }

  if (assetBinding.kind === 'brandRole') {
    const brandAsset = store.workspace.brandAssets.find((candidate) => candidate.role === assetBinding.role);
    return brandAsset?.assetId || null;
  }

  if (assetBinding.kind === 'assetId') {
    return findAsset(assetBinding.assetId)?.id || null;
  }

  return null;
}

function getObjectPageId(object) {
  return object.target?.kind === 'page' ? object.target.pageId : null;
}

function getObjectsForPage(page, pageIndex) {
  const objects = store.workspace.objects.filter((object) => !object.hidden && objectMatchesPage(object, page, pageIndex));
  const local = [];
  const repeatedWatermarks = [];
  const repeatedForeground = [];

  for (const object of objects) {
    if (object.target.kind === 'repeat') {
      if ((object.payload.repeatRole || 'header') === 'watermark') {
        repeatedWatermarks.push(object);
      } else {
        repeatedForeground.push(object);
      }
    } else {
      local.push(object);
    }
  }

  const sortByZ = (left, right) => (left.zIndex || 0) - (right.zIndex || 0);
  return {
    repeatedWatermarks: repeatedWatermarks.sort(sortByZ),
    local: local.sort(sortByZ),
    repeatedForeground: repeatedForeground.sort(sortByZ)
  };
}

function objectMatchesPage(object, page, pageIndex) {
  if (object.target.kind === 'page') {
    return object.target.pageId === page.id;
  }

  switch (object.target.repeatMode) {
    case 'first':
      return pageIndex === 0;
    case 'last':
      return pageIndex === store.workspace.pages.length - 1;
    case 'odd':
      return pageIndex % 2 === 0;
    case 'even':
      return pageIndex % 2 === 1;
    case 'all':
    default:
      return true;
  }
}

function cleanupWorkspaceSelection() {
  if (!store.workspace.pages.some((page) => page.id === store.workspace.selection.pageId)) {
    store.workspace.selection.pageId = store.workspace.pages[0]?.id || null;
  }

  if (!store.workspace.objects.some((object) => object.id === store.workspace.selection.objectId)) {
    store.workspace.selection.objectId = null;
  }
}

function mergeClientState(clientState = {}) {
  if (clientState.selection) {
    store.workspace.selection = {
      ...store.workspace.selection,
      ...clientState.selection
    };
  }

  if (clientState.viewState) {
    store.workspace.viewState = {
      ...store.workspace.viewState,
      ...clientState.viewState
    };
  }
}

function serializeSessionBundle() {
  return {
    version: 2,
    workspace: cloneWorkspace(),
    library: {
      templates: cloneTemplates(store.library.templates)
    },
    assets: store.workspace.assets.map((asset) => ({
      ...asset,
      dataBase64: store.assetData.get(asset.id)?.toString('base64') || ''
    }))
  };
}

function hydrateFromSessionFile() {
  const sessionPath = path.join(__dirname, 'session', 'session.json');

  if (!fs.existsSync(sessionPath)) {
    return;
  }

  try {
    const raw = fs.readFileSync(sessionPath, 'utf8');
    const bundle = JSON.parse(raw);
    store.workspace = normalizeWorkspace(bundle.workspace || createEmptyWorkspace());
    store.library.templates = Array.isArray(bundle.library?.templates)
      ? bundle.library.templates.map(normalizeTemplate)
      : [];
    store.assetData = new Map();

    for (const asset of bundle.assets || []) {
      const { dataBase64 = '', ...metadata } = asset;
      store.assetData.set(metadata.id, Buffer.from(dataBase64, 'base64'));
    }

    store.workspace.assets = (bundle.assets || []).map(({ dataBase64, ...asset }) => asset);
    cleanupWorkspaceSelection();
    console.log('Session restored from /project/session/session.json');
  } catch (error) {
    console.error('Failed to restore saved session:', error);
    store.workspace = createEmptyWorkspace();
    store.assetData = new Map();
    store.library.templates = [];
  }
}

function instantiateTemplate(templateSource, values = {}) {
  const template = normalizeTemplate(templateSource);
  const nextWorkspace = createEmptyWorkspace();
  nextWorkspace.assets = cloneWorkspace().assets;
  nextWorkspace.brandAssets = cloneWorkspace().brandAssets;
  nextWorkspace.presets = template.defaultPresets || cloneWorkspace().presets;

  for (const pageBlueprint of template.pageBlueprints) {
    const nextPage = {
      id: createId('page'),
      kind: pageBlueprint.page.kind || 'blank',
      width: pageBlueprint.page.width,
      height: pageBlueprint.page.height,
      rotation: pageBlueprint.page.rotation || 0
    };

    if (nextPage.kind === 'imported') {
      nextPage.sourceAssetId = pageBlueprint.page.sourceAssetId || null;
      nextPage.sourcePageIndex = pageBlueprint.page.sourcePageIndex || 0;
    }

    nextWorkspace.pages.push(nextPage);

    for (const objectBlueprint of pageBlueprint.objects) {
      const object = instantiateTemplateObject(objectBlueprint, values, nextPage.id);

      if (object) {
        nextWorkspace.objects.push(object);
      }
    }
  }

  for (const objectBlueprint of template.repeatedObjects) {
    const object = instantiateTemplateObject(objectBlueprint, values, null);

    if (object) {
      nextWorkspace.objects.push(object);
    }
  }

  nextWorkspace.selection.pageId = nextWorkspace.pages[0]?.id || null;
  nextWorkspace.selection.objectId = null;
  store.workspace = normalizeWorkspace(nextWorkspace);
}

function instantiateTemplateObject(sourceObject, values, pageId) {
  const target = sourceObject.target?.kind === 'repeat'
    ? normalizeTarget(sourceObject.target)
    : { kind: 'page', pageId };

  if (target.kind === 'page' && !pageId) {
    return null;
  }

  const payload = resolveTemplatePayload(sourceObject.payload || {}, values);

  if ((sourceObject.type === 'image' || (sourceObject.type === 'stamp' && payload.stampKind === 'image')) && !payload.assetId) {
    return null;
  }

  return normalizeObject({
    ...sourceObject,
    id: createId('obj'),
    target,
    payload
  });
}

function resolveTemplatePayload(payload, values) {
  const nextPayload = resolveTemplateValue(payload, values);

  if (nextPayload.assetBinding) {
    nextPayload.assetId = resolveAssetBinding(nextPayload.assetBinding);
    delete nextPayload.assetBinding;
  }

  return nextPayload;
}

function resolveTemplateValue(value, values) {
  if (typeof value === 'string') {
    return replaceTemplateTokens(value, values);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveTemplateValue(entry, values));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveTemplateValue(entry, values)])
    );
  }

  return value;
}

function replaceTemplateTokens(text, values) {
  return text.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    if (key === 'date') {
      return values.date || new Date().toISOString().slice(0, 10);
    }

    return values[key] ?? `{{${key}}}`;
  });
}

function createRenderContext(pageIndex) {
  return {
    pageNumber: String(pageIndex + 1),
    pageCount: String(store.workspace.pages.length)
  };
}

function resolveRenderTokens(text, templateContext = {}) {
  return String(text || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => templateContext[key] ?? `{{${key}}}`);
}

function saveCurrentWorkspaceAsTemplate(payload) {
  if (!store.workspace.pages.length) {
    throw new Error('Create a document before saving a template.');
  }

  const template = normalizeTemplate({
    id: createId('tpl'),
    source: 'custom',
    name: payload.name || `Template ${store.library.templates.length + 1}`,
    description: payload.description || '',
    category: payload.category || 'Custom',
    variables: inferWorkspaceVariables(store.workspace),
    pageBlueprints: store.workspace.pages.map((page) => ({
      role: 'page',
      page: {
        kind: page.kind,
        width: page.width,
        height: page.height,
        rotation: page.rotation || 0,
        sourceAssetId: page.sourceAssetId || null,
        sourcePageIndex: page.sourcePageIndex ?? null
      },
      objects: store.workspace.objects
        .filter((object) => object.target.kind === 'page' && object.target.pageId === page.id)
        .map((object) => stripObjectForTemplate(object))
    })),
    repeatedObjects: store.workspace.objects
      .filter((object) => object.target.kind === 'repeat')
      .map((object) => stripObjectForTemplate(object)),
    defaultPresets: store.workspace.presets,
    recommendedBrandRoles: Array.from(new Set((store.workspace.brandAssets || []).map((asset) => asset.role)))
  });

  const existingIndex = store.library.templates.findIndex((candidate) => candidate.name === template.name);

  if (existingIndex >= 0) {
    store.library.templates[existingIndex] = template;
  } else {
    store.library.templates.unshift(template);
  }

  return JSON.parse(JSON.stringify(template));
}

function stripObjectForTemplate(object) {
  const nextObject = {
    type: object.type,
    bounds: object.bounds,
    rotation: object.rotation || 0,
    opacity: object.opacity ?? 1,
    zIndex: object.zIndex || 1,
    payload: object.payload,
    locked: Boolean(object.locked),
    hidden: Boolean(object.hidden),
    presetId: object.presetId || null
  };

  if (object.target.kind === 'repeat') {
    nextObject.target = object.target;
  }

  return JSON.parse(JSON.stringify(nextObject));
}

function inferWorkspaceVariables(workspace) {
  const matches = new Map();
  const matcher = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

  for (const object of workspace.objects) {
    const texts = [
      object.payload?.text,
      object.payload?.label
    ].filter(Boolean);

    for (const text of texts) {
      let match = matcher.exec(text);
      while (match) {
        const key = match[1];
        if (!matches.has(key) && !['pageNumber', 'pageCount'].includes(key)) {
          matches.set(key, {
            key,
            label: humanizeTemplateKey(key),
            type: 'text',
            defaultValue: ''
          });
        }
        match = matcher.exec(text);
      }
      matcher.lastIndex = 0;
    }
  }

  return Array.from(matches.values());
}

function humanizeTemplateKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (char) => char.toUpperCase());
}

function applyCommand(type, payload) {
  switch (type) {
    case 'insertPagesFromPdf':
      insertPagesFromPdf(payload);
      return;
    case 'addBlankPage':
      addBlankPage(payload);
      return;
    case 'reorderPages':
      reorderPages(payload);
      return;
    case 'rotatePage':
      rotatePage(payload);
      return;
    case 'duplicatePage':
      duplicatePage(payload);
      return;
    case 'deletePage':
      deletePage(payload);
      return;
    case 'createObject':
      createObject(payload);
      return;
    case 'createRepeatedObject':
      createRepeatedObject(payload);
      return;
    case 'updateObject':
      updateObject(payload);
      return;
    case 'deleteObject':
      deleteObject(payload);
      return;
    case 'setObjectTarget':
      setObjectTarget(payload);
      return;
    case 'toggleObjectLocked':
      toggleObjectLocked(payload);
      return;
    case 'toggleObjectHidden':
      toggleObjectHidden(payload);
      return;
    case 'saveBrandAsset':
      saveBrandAsset(payload);
      return;
    case 'applyPreset':
      applyPreset(payload);
      return;
    case 'detachPreset':
      detachPreset(payload);
      return;
    default:
      throw new Error(`Unsupported command: ${type}`);
  }
}

function insertPagesFromPdf(payload) {
  const asset = findAsset(payload.assetId);

  if (!asset || asset.kind !== 'pdf') {
    throw new Error('The selected PDF asset is missing.');
  }

  const pageIndices = Array.isArray(payload.pageIndices)
    ? payload.pageIndices
    : asset.pages.map((_page, index) => index);

  const insertionPoint = Number.isInteger(payload.atIndex)
    ? clamp(payload.atIndex, 0, store.workspace.pages.length)
    : store.workspace.pages.length;

  const newPages = pageIndices.map((index) => {
    const pageInfo = asset.pages[index];

    if (!pageInfo) {
      throw new Error('One of the requested PDF pages is out of range.');
    }

    return {
      id: createId('page'),
      kind: 'imported',
      width: pageInfo.width,
      height: pageInfo.height,
      rotation: 0,
      sourceAssetId: asset.id,
      sourcePageIndex: index
    };
  });

  store.workspace.pages.splice(insertionPoint, 0, ...newPages);
  store.workspace.selection.pageId = newPages[0]?.id || store.workspace.selection.pageId;
}

function addBlankPage(payload) {
  const preset = PAGE_PRESETS[payload.preset] || PAGE_PRESETS.A4;
  const width = Number(payload.width) || preset.width;
  const height = Number(payload.height) || preset.height;
  const insertAt = Number.isInteger(payload.atIndex)
    ? clamp(payload.atIndex, 0, store.workspace.pages.length)
    : store.workspace.pages.length;

  const page = {
    id: createId('page'),
    kind: 'blank',
    width,
    height,
    rotation: 0
  };

  store.workspace.pages.splice(insertAt, 0, page);
  store.workspace.selection.pageId = page.id;
}

function reorderPages(payload) {
  const fromIndex = store.workspace.pages.findIndex((page) => page.id === payload.pageId);

  if (fromIndex === -1) {
    throw new Error('Page not found.');
  }

  const targetIndex = clamp(Number(payload.toIndex), 0, store.workspace.pages.length - 1);
  const [page] = store.workspace.pages.splice(fromIndex, 1);
  store.workspace.pages.splice(targetIndex, 0, page);
  store.workspace.selection.pageId = page.id;
}

function rotatePage(payload) {
  const page = findPage(payload.pageId);

  if (!page) {
    throw new Error('Page not found.');
  }

  const delta = Number(payload.delta) || 90;
  const steps = normalizeQuarterTurns(delta);

  for (let step = 0; step < Math.abs(steps); step += 1) {
    rotatePageGeometry(page, steps > 0);
  }
}

function rotatePageGeometry(page, clockwise) {
  const pageObjects = store.workspace.objects.filter((object) => getObjectPageId(object) === page.id);
  const oldWidth = page.width;
  const oldHeight = page.height;

  for (const object of pageObjects) {
    const { x, y, width, height } = object.bounds;

    if (clockwise) {
      object.bounds = {
        x: oldHeight - (y + height),
        y: x,
        width: height,
        height: width
      };
    } else {
      object.bounds = {
        x: y,
        y: oldWidth - (x + width),
        width: height,
        height: width
      };
    }
  }

  page.width = oldHeight;
  page.height = oldWidth;
  page.rotation = normalizeRotation(page.rotation + (clockwise ? 90 : -90));
}

function duplicatePage(payload) {
  const index = store.workspace.pages.findIndex((page) => page.id === payload.pageId);

  if (index === -1) {
    throw new Error('Page not found.');
  }

  const page = store.workspace.pages[index];
  const duplicate = {
    ...page,
    id: createId('page')
  };

  const duplicateObjects = store.workspace.objects
    .filter((object) => getObjectPageId(object) === page.id)
    .map((object) => ({
      ...object,
      id: createId('obj'),
      target: {
        kind: 'page',
        pageId: duplicate.id
      }
    }));

  store.workspace.pages.splice(index + 1, 0, duplicate);
  store.workspace.objects.push(...duplicateObjects);
  store.workspace.selection.pageId = duplicate.id;
}

function deletePage(payload) {
  const index = store.workspace.pages.findIndex((page) => page.id === payload.pageId);

  if (index === -1) {
    throw new Error('Page not found.');
  }

  store.workspace.pages.splice(index, 1);
  store.workspace.objects = store.workspace.objects.filter((object) => getObjectPageId(object) !== payload.pageId);

  if (!store.workspace.pages.length) {
    const fallbackPage = createBlankWorkspacePage();
    store.workspace.pages.push(fallbackPage);
    store.workspace.selection.pageId = fallbackPage.id;
    return;
  }

  store.workspace.selection.pageId = store.workspace.pages[Math.max(0, index - 1)]?.id || store.workspace.pages[0]?.id || null;
}

function createObject(payload) {
  const page = findPage(payload.pageId);

  if (!page) {
    throw new Error('Select a page before adding an object.');
  }

  const object = buildObject(payload.object, {
    kind: 'page',
    pageId: page.id
  });

  store.workspace.objects.push(object);
  store.workspace.selection.pageId = page.id;
  store.workspace.selection.objectId = object.id;
}

function createRepeatedObject(payload) {
  const repeatMode = REPEAT_MODES.includes(payload.repeatMode) ? payload.repeatMode : 'all';
  const object = buildObject(payload.object, {
    kind: 'repeat',
    repeatMode
  });

  object.payload.repeatRole = REPEAT_ROLES.includes(payload.repeatRole || object.payload.repeatRole)
    ? (payload.repeatRole || object.payload.repeatRole)
    : 'header';

  if ((object.payload.repeatRole || 'header') === 'watermark' && object.opacity === 1) {
    object.opacity = 0.18;
  }

  store.workspace.objects.push(object);
  store.workspace.selection.objectId = object.id;
}

function buildObject(source, target) {
  if (!source?.type || !source?.bounds) {
    throw new Error('Object type and bounds are required.');
  }

  const nextZ = getNextZIndex(target);

  return normalizeObject({
    id: createId('obj'),
    type: source.type,
    target,
    bounds: source.bounds,
    rotation: source.rotation || 0,
    opacity: source.opacity ?? 1,
    zIndex: source.zIndex || nextZ,
    payload: source.payload || {},
    locked: Boolean(source.locked),
    hidden: Boolean(source.hidden),
    presetId: source.presetId || null
  });
}

function getNextZIndex(target) {
  const targetKey = JSON.stringify(normalizeTarget(target));
  const matchingObjects = store.workspace.objects.filter((object) => JSON.stringify(object.target) === targetKey);
  return matchingObjects.reduce((max, object) => Math.max(max, object.zIndex || 0), 0) + 1;
}

function updateObject(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  if (payload.updates.bounds) {
    object.bounds = {
      ...object.bounds,
      ...payload.updates.bounds
    };
  }

  if (payload.updates.payload) {
    object.payload = {
      ...object.payload,
      ...payload.updates.payload
    };
  }

  if (payload.updates.opacity !== undefined) {
    object.opacity = Number(payload.updates.opacity);
  }

  if (payload.updates.rotation !== undefined) {
    object.rotation = Number(payload.updates.rotation);
  }

  if (payload.updates.presetId !== undefined) {
    object.presetId = payload.updates.presetId || null;
  }
}

function deleteObject(payload) {
  const index = store.workspace.objects.findIndex((object) => object.id === payload.objectId);

  if (index === -1) {
    throw new Error('Object not found.');
  }

  store.workspace.objects.splice(index, 1);
  if (store.workspace.selection.objectId === payload.objectId) {
    store.workspace.selection.objectId = null;
  }
}

function setObjectTarget(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  object.target = normalizeTarget(payload.target);

  if (object.target.kind === 'page' && !findPage(object.target.pageId)) {
    throw new Error('Selected page not found.');
  }

  if (payload.repeatRole) {
    object.payload.repeatRole = REPEAT_ROLES.includes(payload.repeatRole) ? payload.repeatRole : 'header';
  }

  if (object.target.kind === 'page') {
    store.workspace.selection.pageId = object.target.pageId;
  }
}

function toggleObjectLocked(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  object.locked = payload.locked !== undefined ? Boolean(payload.locked) : !object.locked;
}

function toggleObjectHidden(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  object.hidden = payload.hidden !== undefined ? Boolean(payload.hidden) : !object.hidden;
}

function saveBrandAsset(payload) {
  const asset = findAsset(payload.assetId);

  if (!asset || asset.kind !== 'image') {
    throw new Error('Only image assets can be saved as brand assets.');
  }

  const role = BRAND_ROLES.includes(payload.role) ? payload.role : 'logo';
  const existing = store.workspace.brandAssets.find((brandAsset) => brandAsset.assetId === asset.id && brandAsset.role === role);

  if (existing) {
    existing.name = payload.name || existing.name;
    return;
  }

  store.workspace.brandAssets.push({
    id: createId('brand'),
    assetId: asset.id,
    role,
    name: payload.name || asset.name
  });
}

function applyPreset(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  const preset = findPreset(payload.presetId);

  if (!preset) {
    throw new Error('Preset not found.');
  }

  object.presetId = preset.id;
  applyObjectPatch(object, preset.patch);
}

function detachPreset(payload) {
  const object = findObject(payload.objectId);

  if (!object) {
    throw new Error('Object not found.');
  }

  object.presetId = null;
}

function applyObjectPatch(object, patch = {}) {
  if (patch.opacity !== undefined) {
    object.opacity = patch.opacity;
  }

  if (patch.rotation !== undefined) {
    object.rotation = patch.rotation;
  }

  if (patch.payload) {
    object.payload = {
      ...object.payload,
      ...patch.payload
    };
  }
}

function normalizeRotation(angle) {
  return ((angle % 360) + 360) % 360;
}

function normalizeQuarterTurns(angle) {
  const normalized = Math.round(angle / 90);
  return normalized === 0 ? 1 : normalized;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function buildExportedPdf() {
  const output = await PDFDocument.create();
  const sourceCache = new Map();
  const fontCache = new Map();

  for (const [pageIndex, workspacePage] of store.workspace.pages.entries()) {
    const outputPage = await renderBasePage(output, workspacePage, sourceCache);
    const pageObjects = getObjectsForPage(workspacePage, pageIndex);
    const templateContext = createRenderContext(pageIndex);

    for (const object of pageObjects.repeatedWatermarks) {
      await drawObjectOnPage(output, outputPage, workspacePage, object, fontCache, templateContext);
    }

    for (const object of pageObjects.local) {
      await drawObjectOnPage(output, outputPage, workspacePage, object, fontCache, templateContext);
    }

    for (const object of pageObjects.repeatedForeground) {
      await drawObjectOnPage(output, outputPage, workspacePage, object, fontCache, templateContext);
    }
  }

  return output.save();
}

async function renderBasePage(output, workspacePage, sourceCache) {
  const outputPage = output.addPage([workspacePage.width, workspacePage.height]);

  if (workspacePage.kind !== 'imported') {
    return outputPage;
  }

  const asset = findAsset(workspacePage.sourceAssetId);

  if (!asset) {
    throw new Error('A source PDF is missing during export.');
  }

  let sourceDoc = sourceCache.get(asset.id);

  if (!sourceDoc) {
    const bytes = store.assetData.get(asset.id);
    sourceDoc = await PDFDocument.load(bytes);
    sourceCache.set(asset.id, sourceDoc);
  }

  const sourcePage = sourceDoc.getPage(workspacePage.sourcePageIndex);
  const [embeddedPage] = await output.embedPages([sourcePage]);
  const rotation = normalizeRotation(workspacePage.rotation || 0);
  const sourceInfo = asset.pages[workspacePage.sourcePageIndex];
  const drawOptions = {
    x: 0,
    y: 0,
    width: sourceInfo.width,
    height: sourceInfo.height
  };

  if (rotation === 90) {
    drawOptions.x = workspacePage.width;
    drawOptions.rotate = degrees(90);
  } else if (rotation === 180) {
    drawOptions.x = workspacePage.width;
    drawOptions.y = workspacePage.height;
    drawOptions.rotate = degrees(180);
  } else if (rotation === 270) {
    drawOptions.y = workspacePage.height;
    drawOptions.rotate = degrees(270);
  }

  outputPage.drawPage(embeddedPage, drawOptions);
  return outputPage;
}

async function drawObjectOnPage(output, page, workspacePage, object, fontCache, templateContext) {
  const bounds = object.bounds;
  const opacity = object.opacity ?? 1;

  if (object.type === 'text') {
    await drawTextObject(output, page, workspacePage, object, fontCache, templateContext);
    return;
  }

  if (object.type === 'rect') {
    page.drawRectangle({
      x: bounds.x,
      y: workspacePage.height - bounds.y - bounds.height,
      width: bounds.width,
      height: bounds.height,
      color: parseOptionalRgb(object.payload.fillColor),
      opacity,
      borderColor: parseRgb(object.payload.strokeColor || '#b6532f'),
      borderWidth: Number(object.payload.strokeWidth) || 2
    });
    return;
  }

  if (object.type === 'ellipse') {
    page.drawEllipse({
      x: bounds.x + bounds.width / 2,
      y: workspacePage.height - bounds.y - bounds.height / 2,
      xScale: bounds.width / 2,
      yScale: bounds.height / 2,
      color: parseOptionalRgb(object.payload.fillColor),
      opacity,
      borderColor: parseRgb(object.payload.strokeColor || '#665b52'),
      borderWidth: Number(object.payload.strokeWidth) || 2,
      rotate: degrees(object.rotation || 0)
    });
    return;
  }

  if (object.type === 'line' || object.type === 'arrow') {
    drawLineLikeObject(page, workspacePage, object);
    return;
  }

  if (object.type === 'image') {
    await drawImageObject(output, page, workspacePage, object, opacity);
    return;
  }

  if (object.type === 'stamp') {
    await drawStampObject(output, page, workspacePage, object, fontCache, templateContext);
    return;
  }

  if (object.type === 'signature') {
    drawSignatureObject(page, workspacePage, object);
  }
}

async function drawTextObject(output, page, workspacePage, object, fontCache, templateContext) {
  const bounds = object.bounds;
  const fontName = object.payload.font || 'Helvetica';
  let font = fontCache.get(fontName);

  if (!font) {
    const standardFontName = StandardFonts[fontName] || StandardFonts.Helvetica;
    font = await output.embedFont(standardFontName);
    fontCache.set(fontName, font);
  }

  const fontSize = Number(object.payload.fontSize) || 24;
  const text = resolveRenderTokens(object.payload.text || '', templateContext);
  const padding = 4;
  let x = bounds.x + padding;
  const y = workspacePage.height - bounds.y - fontSize - padding;
  const color = parseRgb(object.payload.color || '#1f1812');
  const textWidth = font.widthOfTextAtSize(text, fontSize);

  if (object.payload.align === 'center') {
    x = bounds.x + Math.max((bounds.width - textWidth) / 2, padding);
  } else if (object.payload.align === 'right') {
    x = bounds.x + Math.max(bounds.width - textWidth - padding, padding);
  }

  page.drawText(text, {
    x,
    y,
    font,
    size: fontSize,
    color,
    opacity: object.opacity ?? 1,
    rotate: degrees(object.rotation || 0),
    maxWidth: Math.max(bounds.width - padding * 2, 16)
  });
}

async function drawImageObject(output, page, workspacePage, object, opacity) {
  const asset = findAsset(object.payload.assetId);
  const bytes = store.assetData.get(object.payload.assetId);

  if (!asset || !bytes) {
    return;
  }

  const image = asset.mimeType === 'image/png'
    ? await output.embedPng(bytes)
    : await output.embedJpg(bytes);

  page.drawImage(image, {
    x: object.bounds.x,
    y: workspacePage.height - object.bounds.y - object.bounds.height,
    width: object.bounds.width,
    height: object.bounds.height,
    opacity,
    rotate: degrees(object.rotation || 0)
  });
}

function drawSignatureObject(page, workspacePage, object) {
  const strokeColor = parseRgb(object.payload.strokeColor || '#1f1812');
  const strokeWidth = Number(object.payload.strokeWidth) || 2.2;

  for (const stroke of object.payload.strokes || []) {
    for (let index = 1; index < stroke.length; index += 1) {
      const previous = stroke[index - 1];
      const current = stroke[index];

      page.drawLine({
        start: {
          x: object.bounds.x + previous.x * object.bounds.width,
          y: workspacePage.height - (object.bounds.y + previous.y * object.bounds.height)
        },
        end: {
          x: object.bounds.x + current.x * object.bounds.width,
          y: workspacePage.height - (object.bounds.y + current.y * object.bounds.height)
        },
        color: strokeColor,
        thickness: strokeWidth,
        opacity: object.opacity ?? 1
      });
    }
  }
}

function drawLineLikeObject(page, workspacePage, object) {
  const start = {
    x: object.bounds.x + (object.payload.start?.x ?? 0) * object.bounds.width,
    y: workspacePage.height - (object.bounds.y + (object.payload.start?.y ?? 0.5) * object.bounds.height)
  };
  const end = {
    x: object.bounds.x + (object.payload.end?.x ?? 1) * object.bounds.width,
    y: workspacePage.height - (object.bounds.y + (object.payload.end?.y ?? 0.5) * object.bounds.height)
  };

  const color = parseRgb(object.payload.strokeColor || '#665b52');
  const thickness = Number(object.payload.strokeWidth) || 2;

  page.drawLine({
    start,
    end,
    color,
    thickness,
    opacity: object.opacity ?? 1
  });

  if (object.type === 'arrow') {
    const headSize = Number(object.payload.headSize) || 14;
    drawArrowHead(page, end, start, color, thickness, headSize, object.opacity ?? 1);
  }
}

function drawArrowHead(page, end, start, color, thickness, headSize, opacity) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const spread = Math.PI / 7;

  const left = {
    x: end.x - headSize * Math.cos(angle - spread),
    y: end.y - headSize * Math.sin(angle - spread)
  };
  const right = {
    x: end.x - headSize * Math.cos(angle + spread),
    y: end.y - headSize * Math.sin(angle + spread)
  };

  page.drawLine({ start: end, end: left, color, thickness, opacity });
  page.drawLine({ start: end, end: right, color, thickness, opacity });
}

async function drawStampObject(output, page, workspacePage, object, fontCache, templateContext) {
  const bounds = object.bounds;
  const stampKind = object.payload.stampKind || 'text';
  const rotation = degrees(object.rotation || 0);

  if (object.payload.borderShape === 'oval') {
    page.drawEllipse({
      x: bounds.x + bounds.width / 2,
      y: workspacePage.height - bounds.y - bounds.height / 2,
      xScale: bounds.width / 2,
      yScale: bounds.height / 2,
      color: parseOptionalRgb(object.payload.fillColor),
      opacity: object.opacity ?? 1,
      borderColor: parseRgb(object.payload.strokeColor || '#8f2b21'),
      borderWidth: Number(object.payload.strokeWidth) || 2,
      rotate: rotation
    });
  } else {
    page.drawRectangle({
      x: bounds.x,
      y: workspacePage.height - bounds.y - bounds.height,
      width: bounds.width,
      height: bounds.height,
      color: parseOptionalRgb(object.payload.fillColor),
      opacity: object.opacity ?? 1,
      borderColor: parseRgb(object.payload.strokeColor || '#8f2b21'),
      borderWidth: Number(object.payload.strokeWidth) || 2,
      rotate: rotation
    });
  }

  if (stampKind === 'image' && object.payload.assetId) {
    await drawImageObject(output, page, workspacePage, {
      ...object,
      type: 'image'
    }, object.opacity ?? 1);
    return;
  }

  const fontName = object.payload.font || 'HelveticaBold';
  let font = fontCache.get(fontName);

  if (!font) {
    const standardFontName = StandardFonts[fontName] || StandardFonts.HelveticaBold;
    font = await output.embedFont(standardFontName);
    fontCache.set(fontName, font);
  }

  const label = resolveRenderTokens(object.payload.label || 'APPROVED', templateContext);
  const fontSize = Number(object.payload.fontSize) || 20;
  const textWidth = font.widthOfTextAtSize(label, fontSize);
  const x = bounds.x + Math.max((bounds.width - textWidth) / 2, 6);
  const y = workspacePage.height - bounds.y - bounds.height / 2 - fontSize / 3;

  page.drawText(label, {
    x,
    y,
    font,
    size: fontSize,
    color: parseRgb(object.payload.textColor || object.payload.strokeColor || '#8f2b21'),
    opacity: object.opacity ?? 1,
    rotate: rotation
  });
}

function parseOptionalRgb(color) {
  if (!color || color === 'transparent') {
    return undefined;
  }

  return parseRgb(color);
}

function parseRgb(hexColor) {
  const normalized = (hexColor || '#000000').replace('#', '').trim();
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;

  return rgb(red || 0, green || 0, blue || 0);
}

module.exports = {
  createEmptyWorkspace,
  createDefaultPresets,
  createBuiltInTemplates,
  normalizeWorkspace,
  normalizeTemplate,
  STAMP_LABELS,
  REPEAT_MODES,
  REPEAT_ROLES,
  BRAND_ROLES
};
