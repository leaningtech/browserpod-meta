import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

const REPEAT_MODES = ['all', 'first', 'last', 'odd', 'even'];
const REPEAT_ROLES = ['header', 'footer', 'watermark'];
const STAMP_LABELS = ['APPROVED', 'DRAFT', 'CONFIDENTIAL', 'PAID', 'VOID'];

const els = {
  pagesTabButton: document.getElementById('pagesTabButton'),
  brandAssetsTabButton: document.getElementById('brandAssetsTabButton'),
  imageLibraryTabButton: document.getElementById('imageLibraryTabButton'),
  pagesPanel: document.getElementById('pagesPanel'),
  brandAssetsPanel: document.getElementById('brandAssetsPanel'),
  imageLibraryPanel: document.getElementById('imageLibraryPanel'),
  pageList: document.getElementById('pageList'),
  brandAssetList: document.getElementById('brandAssetList'),
  assetLibraryList: document.getElementById('assetLibraryList'),
  stageCanvasHost: document.getElementById('stageCanvasHost'),
  inspectorContent: document.getElementById('inspectorContent'),
  messageBar: document.getElementById('messageBar'),
  pageCount: document.getElementById('pageCount'),
  pdfInput: document.getElementById('pdfInput'),
  imageInput: document.getElementById('imageInput'),
  importPdfButton: document.getElementById('importPdfButton'),
  addBlankButton: document.getElementById('addBlankButton'),
  addTextButton: document.getElementById('addTextButton'),
  addRectButton: document.getElementById('addRectButton'),
  addEllipseButton: document.getElementById('addEllipseButton'),
  addLineButton: document.getElementById('addLineButton'),
  addArrowButton: document.getElementById('addArrowButton'),
  addStampButton: document.getElementById('addStampButton'),
  importImageButton: document.getElementById('importImageButton'),
  signatureButton: document.getElementById('signatureButton'),
  addLogoButton: document.getElementById('addLogoButton'),
  addSignatureImageButton: document.getElementById('addSignatureImageButton'),
  addHeaderButton: document.getElementById('addHeaderButton'),
  addFooterButton: document.getElementById('addFooterButton'),
  addWatermarkButton: document.getElementById('addWatermarkButton'),
  templatesButton: document.getElementById('templatesButton'),
  saveTemplateButton: document.getElementById('saveTemplateButton'),
  zoomOutButton: document.getElementById('zoomOutButton'),
  zoomInButton: document.getElementById('zoomInButton'),
  zoomLabel: document.getElementById('zoomLabel'),
  exportButton: document.getElementById('exportButton'),
  signatureModal: document.getElementById('signatureModal'),
  signatureCanvas: document.getElementById('signatureCanvas'),
  closeSignatureButton: document.getElementById('closeSignatureButton'),
  clearSignatureButton: document.getElementById('clearSignatureButton'),
  saveSignatureButton: document.getElementById('saveSignatureButton'),
  templateModal: document.getElementById('templateModal'),
  closeTemplateButton: document.getElementById('closeTemplateButton'),
  templateBuiltInTab: document.getElementById('templateBuiltInTab'),
  templateSavedTab: document.getElementById('templateSavedTab'),
  templateList: document.getElementById('templateList'),
  templateDetail: document.getElementById('templateDetail')
};

const state = {
  workspace: null,
  pdfDocCache: new Map(),
  assetUrlCache: new Map(),
  drag: null,
  editingObjectId: null,
  signatureStrokes: [],
  signatureStroke: null,
  viewSyncTimer: null,
  templates: {
    builtIn: [],
    custom: []
  },
  messageTimer: null,
  activeDock: 'pages',
  templateUi: {
    activeTab: 'built-in',
    selectedId: null,
    values: {}
  }
};

init().catch((error) => {
  console.error(error);
  setMessage(`Failed to initialize editor: ${error.message}`, true);
});

async function init() {
  decorateStaticControls();
  attachToolbarEvents();
  initSignaturePad();
  await Promise.all([
    refreshWorkspace(),
    refreshTemplates()
  ]);
}

function attachToolbarEvents() {
  attachDisclosureEvents();
  els.pagesTabButton.addEventListener('click', () => setActiveDock('pages'));
  els.brandAssetsTabButton.addEventListener('click', () => setActiveDock('brandAssets'));
  els.imageLibraryTabButton.addEventListener('click', () => setActiveDock('imageLibrary'));
  els.importPdfButton.addEventListener('click', () => els.pdfInput.click());
  els.importImageButton.addEventListener('click', () => els.imageInput.click());
  els.signatureButton.addEventListener('click', openSignatureModal);
  els.addBlankButton.addEventListener('click', () => {
    void runCommand('addBlankPage', { preset: 'A4' });
  });
  els.addTextButton.addEventListener('click', () => void createTextObject());
  els.addRectButton.addEventListener('click', () => void createRectangleObject());
  els.addEllipseButton.addEventListener('click', () => void createEllipseObject());
  els.addLineButton.addEventListener('click', () => void createLineLikeObject('line'));
  els.addArrowButton.addEventListener('click', () => void createLineLikeObject('arrow'));
  els.addStampButton.addEventListener('click', () => void createStampObject());
  els.addLogoButton.addEventListener('click', () => void insertBrandAssetByRole('logo'));
  els.addSignatureImageButton.addEventListener('click', () => void insertBrandAssetByRole('signature'));
  els.addHeaderButton.addEventListener('click', () => void createRepeatedTextObject('header'));
  els.addFooterButton.addEventListener('click', () => void createRepeatedTextObject('footer'));
  els.addWatermarkButton.addEventListener('click', () => void createRepeatedTextObject('watermark'));
  els.templatesButton.addEventListener('click', openTemplateModal);
  els.saveTemplateButton.addEventListener('click', () => {
    void saveCurrentTemplate();
  });
  els.zoomOutButton.addEventListener('click', () => updateZoom(-0.1));
  els.zoomInButton.addEventListener('click', () => updateZoom(0.1));
  els.exportButton.addEventListener('click', () => {
    void exportPdf();
  });
  els.closeTemplateButton.addEventListener('click', closeTemplateModal);
  els.templateBuiltInTab.addEventListener('click', () => {
    state.templateUi.activeTab = 'built-in';
    ensureTemplateSelection();
    renderTemplateModal();
  });
  els.templateSavedTab.addEventListener('click', () => {
    state.templateUi.activeTab = 'saved';
    ensureTemplateSelection();
    renderTemplateModal();
  });
  els.templateModal.addEventListener('click', (event) => {
    if (event.target === els.templateModal) {
      closeTemplateModal();
    }
  });

  els.pdfInput.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    if (!input.files?.length) {
      return;
    }

    const formData = new FormData();
    for (const file of input.files) {
      formData.append('files', file);
    }

    try {
      const response = await fetch('/api/import/pdf', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'PDF import failed.');
      }

      state.pdfDocCache.clear();
      applyWorkspace(data.workspace);
      notifyDirty();
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      input.value = '';
    }
  });

  els.imageInput.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const dimensions = await getImageDimensions(file);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('width', String(dimensions.width));
      formData.append('height', String(dimensions.height));

      const response = await fetch('/api/import/image', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Image import failed.');
      }

      applyWorkspace({
        ...state.workspace,
        assets: [...state.workspace.assets, data.asset]
      });
      setActiveDock('imageLibrary', false);
      await createImageObject(data.asset);
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      input.value = '';
    }
  });
}

function decorateStaticControls() {
  const iconMap = new Map([
    [els.importPdfButton, 'import'],
    [els.addBlankButton, 'blankPage'],
    [els.addTextButton, 'text'],
    [els.addRectButton, 'rectangle'],
    [els.addEllipseButton, 'ellipse'],
    [els.addLineButton, 'line'],
    [els.addArrowButton, 'arrow'],
    [els.addStampButton, 'stamp'],
    [els.importImageButton, 'image'],
    [els.signatureButton, 'drawSignature'],
    [els.addLogoButton, 'logo'],
    [els.addSignatureImageButton, 'signatureAsset'],
    [els.addHeaderButton, 'header'],
    [els.addFooterButton, 'footer'],
    [els.addWatermarkButton, 'watermark'],
    [els.templatesButton, 'templates'],
    [els.saveTemplateButton, 'saveTemplate']
  ]);

  iconMap.forEach((icon, button) => {
    if (!button) {
      return;
    }

    const label = button.textContent || '';
    button.classList.add('command-option');
    button.innerHTML = `${createIconSpan(icon)}<span>${label}</span>`;
  });
}

function attachDisclosureEvents() {
  document.querySelectorAll('details').forEach((disclosure) => {
    wireDisclosure(disclosure);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('details')) {
      closeOpenMenus();
      return;
    }

    if (event.target.closest('.menu-panel button, .page-actions-menu button')) {
      window.requestAnimationFrame(() => {
        closeOpenMenus();
      });
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeOpenMenus();
    }
  });
}

function wireDisclosure(disclosure) {
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.open) {
      return;
    }

    document.querySelectorAll('details[open]').forEach((otherDisclosure) => {
      if (otherDisclosure !== disclosure) {
        otherDisclosure.open = false;
      }
    });
  });
}

function closeOpenMenus() {
  document.querySelectorAll('details[open]').forEach((disclosure) => {
    disclosure.open = false;
  });
}

async function refreshWorkspace() {
  const response = await fetch('/api/workspace');
  const data = await response.json();
  applyWorkspace(data.workspace);
}

async function refreshTemplates() {
  const response = await fetch('/api/templates');
  const data = await response.json();
  state.templates = {
    builtIn: Array.isArray(data.builtInTemplates) ? data.builtInTemplates : [],
    custom: Array.isArray(data.customTemplates) ? data.customTemplates : []
  };
  ensureTemplateSelection();
  renderTemplateModal();
}

function applyWorkspace(workspace) {
  state.workspace = workspace;
  if (!state.workspace.selection.pageId) {
    state.workspace.selection.pageId = state.workspace.pages[0]?.id || null;
  }
  render();
}

function render() {
  renderSidebar();
  renderStage();
  renderInspector();
  updateToolbarState();
  els.pageCount.textContent = `${state.workspace.pages.length}`;
  els.zoomLabel.textContent = `${Math.round((state.workspace.viewState.zoom || 1) * 100)}%`;
}

function openTemplateModal() {
  ensureTemplateSelection();
  els.templateModal.classList.remove('hidden');
  renderTemplateModal();
}

function closeTemplateModal() {
  els.templateModal.classList.add('hidden');
}

function ensureTemplateSelection() {
  const visibleTemplates = getVisibleTemplates();

  if (!visibleTemplates.length) {
    state.templateUi.selectedId = null;
    state.templateUi.values = {};
    return;
  }

  if (!visibleTemplates.some((template) => template.id === state.templateUi.selectedId)) {
    state.templateUi.selectedId = visibleTemplates[0].id;
    state.templateUi.values = buildTemplateValueState(visibleTemplates[0]);
  }
}

function renderTemplateModal() {
  if (!els.templateModal || els.templateModal.classList.contains('hidden')) {
    updateTemplateTabState();
    return;
  }

  updateTemplateTabState();
  renderTemplateList();
  renderTemplateDetail();
}

function updateTemplateTabState() {
  els.templateBuiltInTab.classList.toggle('primary', state.templateUi.activeTab === 'built-in');
  els.templateSavedTab.classList.toggle('primary', state.templateUi.activeTab === 'saved');
}

function renderTemplateList() {
  els.templateList.innerHTML = '';
  const templates = getVisibleTemplates();

  if (!templates.length) {
    els.templateList.appendChild(createHelperCopy(state.templateUi.activeTab === 'saved'
      ? 'No saved custom templates yet.'
      : 'No built-in templates available.'));
    return;
  }

  templates.forEach((template) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `template-list-item${template.id === state.templateUi.selectedId ? ' is-selected' : ''}`;
    item.addEventListener('click', () => {
      state.templateUi.selectedId = template.id;
      state.templateUi.values = buildTemplateValueState(template);
      renderTemplateModal();
    });

    const name = document.createElement('span');
    name.className = 'template-list-name';
    name.textContent = template.name;

    item.append(name);
    els.templateList.appendChild(item);
  });
}

function renderTemplateDetail() {
  els.templateDetail.innerHTML = '';
  const template = getSelectedTemplate();

  if (!template) {
    els.templateDetail.appendChild(createHelperCopy('Choose a template to inspect and instantiate it.'));
    return;
  }

  const header = document.createElement('div');
  header.className = 'template-detail-header';

  const title = document.createElement('h3');
  title.textContent = template.name;
  header.appendChild(title);
  els.templateDetail.appendChild(header);

  const description = document.createElement('p');
  description.className = 'template-detail-copy';
  description.textContent = template.description || 'No description provided.';
  els.templateDetail.appendChild(description);

  if (template.variables?.length) {
    const variableHeading = document.createElement('strong');
    variableHeading.className = 'template-section-title';
    variableHeading.textContent = 'Template Fields';
    els.templateDetail.appendChild(variableHeading);

    const variableGrid = document.createElement('div');
    variableGrid.className = 'template-variable-grid';

    template.variables.forEach((variable) => {
      variableGrid.appendChild(createTemplateVariableField(variable));
    });

    els.templateDetail.appendChild(variableGrid);
  }

  const actions = document.createElement('div');
  actions.className = 'template-actions';
  actions.appendChild(createButton('Create Document From Template', () => {
    void instantiateSelectedTemplate();
  }));

  if (template.source !== 'built-in') {
    actions.appendChild(createButton('Delete Saved Template', () => {
      void deleteTemplate(template.id);
    }));
  }

  els.templateDetail.appendChild(actions);
}

function createTemplateVariableField(variable) {
  if (variable.type === 'multiline') {
    return createTemplateTextareaField(variable);
  }

  return createTemplateInputField(variable);
}

function createTemplateInputField(variable) {
  const label = document.createElement('label');
  label.textContent = variable.label;
  const input = document.createElement('input');
  input.type = ['date', 'number'].includes(variable.type) ? variable.type : 'text';
  input.value = state.templateUi.values[variable.key] ?? '';
  input.placeholder = '';
  input.addEventListener('input', () => {
    state.templateUi.values[variable.key] = input.value;
  });
  label.appendChild(input);
  return label;
}

function createTemplateTextareaField(variable) {
  const label = document.createElement('label');
  label.textContent = variable.label;
  const textarea = document.createElement('textarea');
  textarea.value = state.templateUi.values[variable.key] ?? '';
  textarea.placeholder = '';
  textarea.addEventListener('input', () => {
    state.templateUi.values[variable.key] = textarea.value;
  });
  label.appendChild(textarea);
  return label;
}

function getVisibleTemplates() {
  return state.templateUi.activeTab === 'saved'
    ? state.templates.custom
    : state.templates.builtIn;
}

function getSelectedTemplate() {
  return getVisibleTemplates().find((template) => template.id === state.templateUi.selectedId) || null;
}

function buildTemplateValueState(template) {
  return Object.fromEntries((template.variables || []).map((variable) => [
    variable.key,
    ''
  ]));
}

function updateToolbarState() {
  const hasLogo = Boolean(getBrandAssetsByRole('logo')[0]);
  const hasSignature = Boolean(getBrandAssetsByRole('signature')[0]);
  els.addLogoButton.disabled = !hasLogo;
  els.addSignatureImageButton.disabled = !hasSignature;
}

function renderSidebar() {
  syncDockState();
  renderPageList();
  renderBrandAssets();
  renderImageLibrary();
}

function setActiveDock(dock, rerender = true) {
  state.activeDock = dock;
  syncDockState();

  if (rerender) {
    renderSidebar();
  }
}

function syncDockState() {
  const isPages = state.activeDock === 'pages';
  const isBrandAssets = state.activeDock === 'brandAssets';
  const isImageLibrary = state.activeDock === 'imageLibrary';

  els.pagesTabButton.classList.toggle('is-active', isPages);
  els.brandAssetsTabButton.classList.toggle('is-active', isBrandAssets);
  els.imageLibraryTabButton.classList.toggle('is-active', isImageLibrary);

  els.pagesPanel.classList.toggle('is-hidden', !isPages);
  els.brandAssetsPanel.classList.toggle('is-hidden', !isBrandAssets);
  els.imageLibraryPanel.classList.toggle('is-hidden', !isImageLibrary);
}

function selectPage(pageId) {
  closeOpenMenus();
  state.workspace.selection.pageId = pageId;
  state.workspace.selection.objectId = null;
  render();
  scheduleViewStateSync();
}

function renderPageList() {
  els.pageList.innerHTML = '';

  if (!state.workspace.pages.length) {
    els.pageList.appendChild(createHelperCopy('Import a PDF or add a blank page to begin.'));
    return;
  }

  state.workspace.pages.forEach((page, index) => {
    const card = document.createElement('div');
    card.className = `page-card${page.id === state.workspace.selection.pageId ? ' is-selected' : ''}`;

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'page-card-main';
    main.addEventListener('click', () => {
      selectPage(page.id);
    });

    const thumb = document.createElement('div');
    thumb.className = 'page-card-thumb';

    const sheet = document.createElement('div');
    sheet.className = 'page-card-sheet';
    sheet.style.aspectRatio = `${page.width} / ${page.height}`;
    thumb.appendChild(sheet);

    const content = document.createElement('div');
    content.className = 'page-card-content';

    const title = document.createElement('div');
    title.className = 'page-card-title';
    title.textContent = `Page ${index + 1}`;

    const meta = document.createElement('div');
    meta.className = 'page-card-meta';
    meta.textContent = `${page.kind} · ${Math.round(page.width)} × ${Math.round(page.height)} pt`;

    content.append(title, meta);
    main.append(thumb, content);

    const actions = document.createElement('details');
    actions.className = 'page-actions';
    wireDisclosure(actions);

    const summary = document.createElement('summary');
    summary.className = 'page-actions-trigger';
    summary.setAttribute('aria-label', 'Page actions');
    summary.innerHTML = getIconMarkup('more');

    const menu = document.createElement('div');
    menu.className = 'page-actions-menu';

    const upButton = createMenuActionButton('up', 'Up', () => {
      if (index > 0) {
        void runCommand('reorderPages', { pageId: page.id, toIndex: index - 1 });
      }
    });
    upButton.disabled = index === 0;

    const downButton = createMenuActionButton('down', 'Down', () => {
      if (index < state.workspace.pages.length - 1) {
        void runCommand('reorderPages', { pageId: page.id, toIndex: index + 1 });
      }
    });
    downButton.disabled = index === state.workspace.pages.length - 1;

    menu.append(
      upButton,
      downButton,
      createMenuActionButton('rotate', 'Rotate', () => {
        void runCommand('rotatePage', { pageId: page.id, delta: 90 });
      }),
      createMenuActionButton('duplicate', 'Duplicate', () => {
        void runCommand('duplicatePage', { pageId: page.id });
      }),
      createMenuActionButton('delete', 'Delete', () => {
        void runCommand('deletePage', { pageId: page.id });
      }, true)
    );

    actions.append(summary, menu);
    card.append(main, actions);
    els.pageList.appendChild(card);
  });
}

function renderBrandAssets() {
  els.brandAssetList.innerHTML = '';
  const brandAssets = state.workspace.brandAssets || [];

  if (!brandAssets.length) {
    els.brandAssetList.appendChild(createHelperCopy('No saved logo, signature, or stamp assets yet.'));
    return;
  }

  brandAssets.forEach((brandAsset) => {
    const card = document.createElement('div');
    card.className = 'asset-card';

    const title = document.createElement('div');
    title.className = 'asset-card-title';
    title.textContent = brandAsset.name;

    const meta = document.createElement('div');
    meta.className = 'asset-card-meta';
    meta.textContent = brandAsset.role;

    const row = document.createElement('div');
    row.className = 'toolbar-group';
    row.append(createTinyButton('Insert', () => {
      void insertBrandAsset(brandAsset);
    }));

    card.append(title, meta, row);
    els.brandAssetList.appendChild(card);
  });
}

function renderImageLibrary() {
  els.assetLibraryList.innerHTML = '';
  const images = (state.workspace.assets || []).filter((asset) => asset.kind === 'image');

  if (!images.length) {
    els.assetLibraryList.appendChild(createHelperCopy('Imported images appear here. Save them as brand assets for quick reuse.'));
    return;
  }

  images.forEach((asset) => {
    const card = document.createElement('div');
    card.className = 'asset-card';

    const title = document.createElement('div');
    title.className = 'asset-card-title';
    title.textContent = asset.name;

    const meta = document.createElement('div');
    meta.className = 'asset-card-meta';
    meta.textContent = `${Math.round(asset.width || 0)} × ${Math.round(asset.height || 0)} px`;

    const row = document.createElement('div');
    row.className = 'toolbar-group';
    row.append(
      createTinyButton('Insert', () => {
        void createImageObject(asset);
      }),
      createTinyButton('Save Logo', () => {
        void saveBrandAsset(asset, 'logo');
      }),
      createTinyButton('Save Signature', () => {
        void saveBrandAsset(asset, 'signature');
      }),
      createTinyButton('Save Stamp', () => {
        void saveBrandAsset(asset, 'stamp');
      })
    );

    card.append(title, meta, row);
    els.assetLibraryList.appendChild(card);
  });
}

async function renderStage() {
  const page = getSelectedPage();
  els.stageCanvasHost.innerHTML = '';

  if (!page) {
    const empty = document.createElement('div');
    empty.className = 'stage-empty';
    empty.innerHTML = '<h2>No page selected</h2><p>Import a PDF or add a blank page, then place content visually on the page.</p>';
    els.stageCanvasHost.appendChild(empty);
    return;
  }

  const zoom = state.workspace.viewState.zoom || 1;
  const pageIndex = state.workspace.pages.findIndex((candidate) => candidate.id === page.id);
  const stage = document.createElement('div');
  stage.className = 'page-stage';
  stage.style.width = `${page.width * zoom}px`;
  stage.style.height = `${page.height * zoom}px`;
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target.classList.contains('overlay-layer')) {
      state.workspace.selection.pageId = page.id;
      state.workspace.selection.objectId = null;
      renderInspector();
      renderSidebar();
      scheduleViewStateSync();
    }
  });

  if (page.kind === 'imported') {
    const canvas = document.createElement('canvas');
    await paintPdfPage(canvas, page, zoom);
    stage.appendChild(canvas);
  } else {
    const blank = document.createElement('div');
    blank.className = 'blank-page';
    stage.appendChild(blank);
  }

  const watermarkLayer = document.createElement('div');
  watermarkLayer.className = 'overlay-layer';
  const mainLayer = document.createElement('div');
  mainLayer.className = 'overlay-layer';

  const { watermarks, foreground } = getObjectsForCurrentPage(page, pageIndex);
  watermarks.forEach((object) => watermarkLayer.appendChild(renderObject(object, zoom, pageIndex)));
  foreground.forEach((object) => mainLayer.appendChild(renderObject(object, zoom, pageIndex)));

  stage.append(watermarkLayer, mainLayer);
  els.stageCanvasHost.appendChild(stage);
}

function getObjectsForCurrentPage(page, pageIndex) {
  const matches = state.workspace.objects.filter((object) => !object.hidden && objectMatchesPage(object, page, pageIndex));
  const watermarks = [];
  const foreground = [];

  matches.sort((left, right) => (left.zIndex || 0) - (right.zIndex || 0));

  for (const object of matches) {
    if (object.target.kind === 'repeat' && (object.payload.repeatRole || 'header') === 'watermark') {
      watermarks.push(object);
    } else {
      foreground.push(object);
    }
  }

  return { watermarks, foreground };
}

function objectMatchesPage(object, page, pageIndex) {
  if (object.target.kind === 'page') {
    return object.target.pageId === page.id;
  }

  switch (object.target.repeatMode) {
    case 'first':
      return pageIndex === 0;
    case 'last':
      return pageIndex === state.workspace.pages.length - 1;
    case 'odd':
      return pageIndex % 2 === 0;
    case 'even':
      return pageIndex % 2 === 1;
    case 'all':
    default:
      return true;
  }
}

function renderObject(object, zoom, pageIndex) {
  const element = document.createElement('div');
  element.className = [
    'overlay-object',
    object.id === state.workspace.selection.objectId ? 'is-selected' : '',
    object.locked ? 'is-locked' : '',
    object.target.kind === 'repeat' ? 'is-repeated' : '',
    object.target.kind === 'repeat' && (object.payload.repeatRole || 'header') === 'watermark' ? 'is-watermark' : ''
  ].filter(Boolean).join(' ');

  element.style.left = `${object.bounds.x * zoom}px`;
  element.style.top = `${object.bounds.y * zoom}px`;
  element.style.width = `${object.bounds.width * zoom}px`;
  element.style.height = `${object.bounds.height * zoom}px`;
  element.style.opacity = object.opacity ?? 1;
  if (object.rotation) {
    element.style.transform = `rotate(${object.rotation}deg)`;
  }

  element.addEventListener('pointerdown', (event) => {
    if (object.locked) {
      selectObject(object);
      return;
    }

    if (event.target.classList.contains('resize-handle')) {
      beginResize(event, object);
      return;
    }

    if (event.target.closest('.overlay-text')) {
      selectObject(object);
      return;
    }

    if (event.target.closest('[contenteditable="true"]')) {
      return;
    }

    beginDrag(event, object);
  });

  element.addEventListener('click', (event) => {
    event.stopPropagation();
    selectObject(object);
  });

  const surface = document.createElement('div');
  surface.className = `overlay-surface overlay-${object.type}`;

  if (object.type === 'text') {
    surface.appendChild(renderTextSurface(object, zoom, pageIndex));
  } else if (object.type === 'image') {
    surface.appendChild(renderImageSurface(object));
  } else if (object.type === 'rect') {
    surface.appendChild(renderRectSurface(object, zoom));
  } else if (object.type === 'ellipse') {
    surface.appendChild(renderEllipseSurface(object, zoom));
  } else if (object.type === 'line' || object.type === 'arrow') {
    surface.appendChild(renderLineSurface(object, zoom));
  } else if (object.type === 'signature') {
    surface.appendChild(renderSignatureSurface(object));
  } else if (object.type === 'stamp') {
    surface.appendChild(renderStampSurface(object, zoom, pageIndex));
  }

  element.appendChild(surface);

  const handle = document.createElement('div');
  handle.className = `resize-handle${object.locked ? ' is-hidden' : ''}`;
  element.appendChild(handle);
  return element;
}

function renderTextSurface(object, zoom, pageIndex) {
  const content = document.createElement('div');
  content.className = 'overlay-text';
  content.textContent = resolvePreviewTokens(object.payload.text || '', pageIndex);
  content.style.fontSize = `${(object.payload.fontSize || 24) * zoom}px`;
  content.style.color = object.payload.color || '#1f1812';
  content.style.textAlign = object.payload.align || 'left';
  content.style.fontFamily = mapFontFamily(object.payload.font);
  content.title = 'Double-click to edit text';
  content.spellcheck = false;

  if (state.editingObjectId === object.id) {
    content.contentEditable = 'true';
  }

  content.addEventListener('pointerdown', (event) => {
    if (content.isContentEditable) {
      event.stopPropagation();
    }
  });

  content.addEventListener('dblclick', (event) => {
    if (object.locked) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    state.editingObjectId = object.id;
    selectObject(object);
    content.contentEditable = 'true';
    window.requestAnimationFrame(() => {
      content.focus({ preventScroll: true });
      placeCaretAtEnd(content);
    });
  });

  content.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      content.blur();
    }
  });

  content.addEventListener('blur', () => {
    if (content.isContentEditable) {
      state.editingObjectId = null;
      content.contentEditable = 'false';
      void updateObjectPayload(object.id, { text: content.textContent || '' });
    }
  });

  return content;
}

function renderImageSurface(object) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay-image';
  const img = document.createElement('img');
  loadImageUrl(object.payload.assetId)
    .then((src) => {
      img.src = src;
    })
    .catch(() => {
      img.alt = 'Image failed to load';
    });
  wrap.appendChild(img);
  return wrap;
}

function renderRectSurface(object, zoom) {
  const rect = document.createElement('div');
  rect.className = 'overlay-rect';
  rect.style.border = `${Math.max((object.payload.strokeWidth || 2) * zoom, 1)}px solid ${object.payload.strokeColor || '#b6532f'}`;
  rect.style.background = object.payload.fillColor || 'transparent';
  rect.style.borderRadius = '10px';
  return rect;
}

function renderEllipseSurface(object, zoom) {
  const ellipse = document.createElement('div');
  ellipse.className = 'overlay-ellipse';
  ellipse.style.border = `${Math.max((object.payload.strokeWidth || 2) * zoom, 1)}px solid ${object.payload.strokeColor || '#665b52'}`;
  ellipse.style.background = object.payload.fillColor || 'transparent';
  return ellipse;
}

function renderLineSurface(object, zoom) {
  const wrap = document.createElement('div');
  wrap.className = `overlay-${object.type}`;
  const start = {
    x: (object.payload.start?.x ?? 0) * object.bounds.width,
    y: (object.payload.start?.y ?? 0.5) * object.bounds.height
  };
  const end = {
    x: (object.payload.end?.x ?? 1) * object.bounds.width,
    y: (object.payload.end?.y ?? 0.5) * object.bounds.height
  };
  const strokeWidth = Math.max((object.payload.strokeWidth || 2) * zoom, 1);
  const strokeColor = object.payload.strokeColor || '#665b52';
  const headSize = (object.payload.headSize || 14) * zoom;
  let arrowSvg = '';

  if (object.type === 'arrow') {
    const head = buildArrowHeadPoints(start, end, headSize);
    arrowSvg = `<line x1="${end.x}" y1="${end.y}" x2="${head.left.x}" y2="${head.left.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
      <line x1="${end.x}" y1="${end.y}" x2="${head.right.x}" y2="${head.right.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />`;
  }

  wrap.innerHTML = `
    <svg viewBox="0 0 ${object.bounds.width} ${object.bounds.height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" />
      ${arrowSvg}
    </svg>
  `;
  return wrap;
}

function buildArrowHeadPoints(start, end, headSize) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const spread = Math.PI / 7;
  return {
    left: {
      x: end.x - headSize * Math.cos(angle - spread),
      y: end.y - headSize * Math.sin(angle - spread)
    },
    right: {
      x: end.x - headSize * Math.cos(angle + spread),
      y: end.y - headSize * Math.sin(angle + spread)
    }
  };
}

function renderSignatureSurface(object) {
  const svgWrap = document.createElement('div');
  svgWrap.className = 'overlay-signature';
  svgWrap.innerHTML = buildSignatureSvg(object);
  return svgWrap;
}

function renderStampSurface(object, zoom, pageIndex) {
  const wrap = document.createElement('div');
  wrap.className = 'overlay-stamp';
  const frame = document.createElement('div');
  frame.className = 'overlay-stamp-frame';
  frame.style.border = `${Math.max((object.payload.strokeWidth || 2) * zoom, 1)}px solid ${object.payload.strokeColor || '#8f2b21'}`;
  frame.style.background = object.payload.fillColor || 'transparent';
  frame.style.borderRadius = object.payload.borderShape === 'oval' ? '999px' : '12px';
  wrap.appendChild(frame);

  if ((object.payload.stampKind || 'text') === 'image') {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'overlay-stamp-image';
    const img = document.createElement('img');
    loadImageUrl(object.payload.assetId)
      .then((src) => {
        img.src = src;
      })
      .catch(() => {
        img.alt = 'Stamp image failed to load';
      });
    imageWrap.appendChild(img);
    wrap.appendChild(imageWrap);
  } else {
    const label = document.createElement('div');
    label.className = 'overlay-stamp-label';
    label.textContent = resolvePreviewTokens(object.payload.label || 'APPROVED', pageIndex);
    label.style.color = object.payload.textColor || object.payload.strokeColor || '#8f2b21';
    label.style.fontSize = `${(object.payload.fontSize || 20) * zoom}px`;
    label.style.fontFamily = mapFontFamily(object.payload.font || 'HelveticaBold');
    wrap.appendChild(label);
  }

  return wrap;
}

function renderInspector() {
  els.inspectorContent.innerHTML = '';
  const selectedObject = getSelectedObject();

  if (selectedObject) {
    els.inspectorContent.appendChild(renderObjectInspector(selectedObject));
    return;
  }

  const selectedPage = getSelectedPage();
  if (!selectedPage) {
    els.inspectorContent.appendChild(createHelperCopy('Select a page or object to edit its properties.'));
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'inspector-group';
  panel.appendChild(createHeading('Selected Page'));
  panel.appendChild(createMetricGrid([
    ['Type', selectedPage.kind],
    ['Size', `${Math.round(selectedPage.width)} × ${Math.round(selectedPage.height)} pt`],
    ['Rotation', `${selectedPage.rotation || 0}°`]
  ]));
  els.inspectorContent.appendChild(panel);
}

function renderObjectInspector(object) {
  const stack = document.createElement('div');
  stack.className = 'inspector-stack';

  const basics = createInspectorSection(`Selected ${object.type}`);
  basics.appendChild(createPresetField(object));
  basics.appendChild(createToggleGrid(
    createToggleField('Locked', object.locked, async (checked) => {
      await runCommand('toggleObjectLocked', { objectId: object.id, locked: checked });
    }),
    createToggleField('Hidden', object.hidden, async (checked) => {
      await runCommand('toggleObjectHidden', { objectId: object.id, hidden: checked });
    })
  ));
  stack.appendChild(basics);

  stack.appendChild(createTargetField(object));

  const geometry = createInspectorSection('Geometry');
  const geometryFields = [
    createNumericField('X', object.bounds.x, async (value) => updateBounds(object, { x: value })),
    createNumericField('Y', object.bounds.y, async (value) => updateBounds(object, { y: value })),
    createNumericField('Width', object.bounds.width, async (value) => updateBounds(object, { width: Math.max(value, 24) })),
    createNumericField('Height', object.bounds.height, async (value) => updateBounds(object, { height: Math.max(value, 24) })),
    createNumericField('Opacity', object.opacity ?? 1, async (value) => {
      await runCommand('updateObject', {
        objectId: object.id,
        updates: { opacity: clamp(value, 0.1, 1) }
      });
    }, { step: 0.1, min: 0.1, max: 1 })
  ];

  if (supportsRotation(object)) {
    geometryFields.push(createNumericField('Rotation', object.rotation || 0, async (value) => {
      await runCommand('updateObject', {
        objectId: object.id,
        updates: { rotation: value }
      });
    }, { step: 1 }));
  }

  geometry.appendChild(createFieldGrid(...geometryFields));
  stack.appendChild(geometry);

  if (object.type === 'text') {
    const content = createInspectorSection('Content');
    content.appendChild(createTextareaField('Text', object.payload.text || '', async (value) => updateObjectPayload(object.id, { text: value })));
    content.appendChild(createFieldGrid(
      createNumericField('Font Size', object.payload.fontSize || 24, async (value) => updateObjectPayload(object.id, { fontSize: Math.max(value, 8) })),
      createSelectField('Font', object.payload.font || 'Helvetica', [
        ['Helvetica', 'Helvetica'],
        ['HelveticaBold', 'Helvetica Bold'],
        ['TimesRoman', 'Times Roman'],
        ['Courier', 'Courier']
      ], async (value) => updateObjectPayload(object.id, { font: value })),
      createSelectField('Alignment', object.payload.align || 'left', [
        ['left', 'Left'],
        ['center', 'Center'],
        ['right', 'Right']
      ], async (value) => updateObjectPayload(object.id, { align: value })),
      createTextField('Color', object.payload.color || '#1f1812', async (value) => updateObjectPayload(object.id, { color: value }))
    ));
    stack.appendChild(content);
  }

  if (object.type === 'rect' || object.type === 'ellipse') {
    const style = createInspectorSection('Style');
    style.appendChild(createFieldGrid(
      createTextField('Stroke Color', object.payload.strokeColor || '#b6532f', async (value) => updateObjectPayload(object.id, { strokeColor: value })),
      createTextField('Fill Color', object.payload.fillColor || 'transparent', async (value) => updateObjectPayload(object.id, { fillColor: value })),
      createNumericField('Stroke Width', object.payload.strokeWidth || 2, async (value) => updateObjectPayload(object.id, { strokeWidth: Math.max(value, 1) }))
    ));
    stack.appendChild(style);
  }

  if (object.type === 'line' || object.type === 'arrow') {
    const style = createInspectorSection('Style');
    const fields = [
      createTextField('Stroke Color', object.payload.strokeColor || '#665b52', async (value) => updateObjectPayload(object.id, { strokeColor: value })),
      createNumericField('Stroke Width', object.payload.strokeWidth || 2, async (value) => updateObjectPayload(object.id, { strokeWidth: Math.max(value, 1) }))
    ];

    if (object.type === 'arrow') {
      fields.push(createNumericField('Arrow Head Size', object.payload.headSize || 14, async (value) => {
        await updateObjectPayload(object.id, { headSize: Math.max(value, 6) });
      }));
    }

    style.appendChild(createFieldGrid(...fields));
    stack.appendChild(style);
  }

  if (object.type === 'signature') {
    const style = createInspectorSection('Style');
    style.appendChild(createFieldGrid(
      createTextField('Stroke Color', object.payload.strokeColor || '#1f1812', async (value) => updateObjectPayload(object.id, { strokeColor: value })),
      createNumericField('Stroke Width', object.payload.strokeWidth || 2.2, async (value) => updateObjectPayload(object.id, { strokeWidth: Math.max(value, 1) }))
    ));
    stack.appendChild(style);
  }

  if (object.type === 'image') {
    const source = createInspectorSection('Source');
    source.appendChild(createHelperCopy(`Asset: ${findAsset(object.payload.assetId)?.name || 'Unknown image'}`));
    stack.appendChild(source);
  }

  if (object.type === 'stamp') {
    const style = createInspectorSection('Style');
    style.appendChild(createFieldGrid(
      createSelectField('Stamp Type', object.payload.stampKind || 'text', [
        ['text', 'Text'],
        ['image', 'Image']
      ], async (value) => {
        await updateObjectPayload(object.id, { stampKind: value });
      }),
      createSelectField('Border Shape', object.payload.borderShape || 'rect', [
        ['rect', 'Rectangle'],
        ['oval', 'Oval']
      ], async (value) => updateObjectPayload(object.id, { borderShape: value })),
      createTextField('Stroke Color', object.payload.strokeColor || '#8f2b21', async (value) => updateObjectPayload(object.id, { strokeColor: value })),
      createTextField('Fill Color', object.payload.fillColor || 'transparent', async (value) => updateObjectPayload(object.id, { fillColor: value })),
      createTextField('Text Color', object.payload.textColor || '#8f2b21', async (value) => updateObjectPayload(object.id, { textColor: value })),
      createNumericField('Stroke Width', object.payload.strokeWidth || 2, async (value) => updateObjectPayload(object.id, { strokeWidth: Math.max(value, 1) })),
      createNumericField('Font Size', object.payload.fontSize || 20, async (value) => updateObjectPayload(object.id, { fontSize: Math.max(value, 8) }))
    ));

    if ((object.payload.stampKind || 'text') === 'text') {
      style.appendChild(createFieldGrid(
        createSelectField('Built-in Label', object.payload.label || STAMP_LABELS[0], STAMP_LABELS.map((label) => [label, label]), async (value) => {
          await updateObjectPayload(object.id, { label: value });
        }),
        createTextField('Label', object.payload.label || 'APPROVED', async (value) => updateObjectPayload(object.id, { label: value }))
      ));
    } else {
      style.appendChild(createHelperCopy(`Asset: ${findAsset(object.payload.assetId)?.name || 'No image selected'}`));
    }

    stack.appendChild(style);
  }

  const actions = createInspectorSection('');
  const deleteButton = createButton('Delete Object', () => {
    void runCommand('deleteObject', { objectId: object.id });
  });
  deleteButton.classList.add('danger');
  actions.appendChild(deleteButton);
  stack.appendChild(actions);

  return stack;
}

function createHeading(text) {
  const heading = document.createElement('strong');
  heading.textContent = text;
  return heading;
}

function createInspectorSection(title) {
  const section = document.createElement('div');
  section.className = 'inspector-group';

  if (title) {
    section.appendChild(createHeading(title));
  }

  return section;
}

function createFieldGrid(...fields) {
  const grid = document.createElement('div');
  grid.className = 'field-grid';
  fields.forEach((field) => grid.appendChild(field));
  return grid;
}

function createToggleGrid(...fields) {
  const grid = document.createElement('div');
  grid.className = 'toggle-grid';
  fields.forEach((field) => grid.appendChild(field));
  return grid;
}

function createMetricGrid(entries) {
  const grid = document.createElement('div');
  grid.className = 'metric-grid';

  entries.forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'metric-item';

    const metricLabel = document.createElement('span');
    metricLabel.className = 'metric-label';
    metricLabel.textContent = label;

    const metricValue = document.createElement('strong');
    metricValue.className = 'metric-value';
    metricValue.textContent = value;

    item.append(metricLabel, metricValue);
    grid.appendChild(item);
  });

  return grid;
}

function createPresetField(object) {
  const presets = getPresetOptions(object);
  const label = document.createElement('label');
  label.textContent = 'Preset';
  const select = document.createElement('select');
  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = 'No preset';
  emptyOption.selected = !object.presetId;
  select.appendChild(emptyOption);

  presets.forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === object.presetId;
    select.appendChild(option);
  });

  select.addEventListener('change', async () => {
    if (!select.value) {
      await runCommand('detachPreset', { objectId: object.id });
      return;
    }

    await runCommand('applyPreset', {
      objectId: object.id,
      presetId: select.value
    });
  });

  label.appendChild(select);
  return label;
}

function createTargetField(object) {
  const wrapper = document.createElement('div');
  wrapper.className = 'inspector-group';
  wrapper.appendChild(createHeading('Target'));

  const targetKind = document.createElement('label');
  targetKind.textContent = 'Applies To';
  const kindSelect = document.createElement('select');
  [
    ['page', 'This page only'],
    ['repeat', 'Repeated element']
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === object.target.kind;
    kindSelect.appendChild(option);
  });

  kindSelect.addEventListener('change', async () => {
    if (kindSelect.value === 'page') {
      const fallbackPageId = state.workspace.selection.pageId || state.workspace.pages[0]?.id || null;
      if (!fallbackPageId) {
        setMessage('Create a page before targeting a page-local object.', true);
        return;
      }
      await runCommand('setObjectTarget', {
        objectId: object.id,
        target: { kind: 'page', pageId: fallbackPageId }
      });
      return;
    }

    await runCommand('setObjectTarget', {
      objectId: object.id,
      target: { kind: 'repeat', repeatMode: object.target.repeatMode || 'all' },
      repeatRole: object.payload.repeatRole || 'header'
    });
  });

  targetKind.appendChild(kindSelect);
  wrapper.appendChild(targetKind);

  if (object.target.kind === 'page') {
    const pageField = document.createElement('label');
    pageField.textContent = 'Page';
    const pageSelect = document.createElement('select');
    state.workspace.pages.forEach((page, index) => {
      const option = document.createElement('option');
      option.value = page.id;
      option.textContent = `Page ${index + 1}`;
      option.selected = page.id === object.target.pageId;
      pageSelect.appendChild(option);
    });

    pageSelect.addEventListener('change', async () => {
      await runCommand('setObjectTarget', {
        objectId: object.id,
        target: { kind: 'page', pageId: pageSelect.value }
      });
    });
    pageField.appendChild(pageSelect);
    wrapper.appendChild(pageField);
  } else {
    const repeatModeField = document.createElement('label');
    repeatModeField.textContent = 'Repeat Mode';
    const repeatModeSelect = document.createElement('select');
    REPEAT_MODES.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode;
      option.selected = mode === object.target.repeatMode;
      repeatModeSelect.appendChild(option);
    });

    repeatModeSelect.addEventListener('change', async () => {
      await runCommand('setObjectTarget', {
        objectId: object.id,
        target: { kind: 'repeat', repeatMode: repeatModeSelect.value },
        repeatRole: object.payload.repeatRole || 'header'
      });
    });
    repeatModeField.appendChild(repeatModeSelect);
    wrapper.appendChild(repeatModeField);

    const roleField = document.createElement('label');
    roleField.textContent = 'Repeated Role';
    const roleSelect = document.createElement('select');
    REPEAT_ROLES.forEach((role) => {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      option.selected = role === (object.payload.repeatRole || 'header');
      roleSelect.appendChild(option);
    });

    roleSelect.addEventListener('change', async () => {
      await runCommand('setObjectTarget', {
        objectId: object.id,
        target: { kind: 'repeat', repeatMode: object.target.repeatMode || 'all' },
        repeatRole: roleSelect.value
      });
    });
    roleField.appendChild(roleSelect);
    wrapper.appendChild(roleField);
  }

  return wrapper;
}

function getPresetOptions(object) {
  if (object.type === 'text') {
    return state.workspace.presets.textPresets || [];
  }

  if (object.type === 'stamp') {
    return state.workspace.presets.stampPresets || [];
  }

  if (['rect', 'ellipse', 'line', 'arrow'].includes(object.type)) {
    return state.workspace.presets.shapePresets || [];
  }

  return [];
}

function createNumericField(labelText, value, onChange, options = {}) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = String(value);
  if (options.step) {
    input.step = String(options.step);
  }
  if (options.min !== undefined) {
    input.min = String(options.min);
  }
  if (options.max !== undefined) {
    input.max = String(options.max);
  }
  input.addEventListener('change', () => {
    void onChange(Number(input.value));
  });
  label.appendChild(input);
  return label;
}

function createTextField(labelText, value, onChange) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => {
    void onChange(input.value);
  });
  label.appendChild(input);
  return label;
}

function createTextareaField(labelText, value, onChange) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.addEventListener('change', () => {
    void onChange(textarea.value);
  });
  label.appendChild(textarea);
  return label;
}

function createSelectField(labelText, value, options, onChange) {
  const label = document.createElement('label');
  label.textContent = labelText;
  const select = document.createElement('select');
  options.forEach(([optionValue, optionLabel]) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionLabel;
    option.selected = optionValue === value;
    select.appendChild(option);
  });
  select.addEventListener('change', () => {
    void onChange(select.value);
  });
  label.appendChild(select);
  return label;
}

function createToggleField(labelText, checked, onChange) {
  const wrapper = document.createElement('label');
  wrapper.className = 'toggle-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => {
    void onChange(input.checked);
  });
  wrapper.append(span, input);
  return wrapper;
}

function createButton(label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createTinyButton(label, onClick) {
  const button = createButton(label, onClick);
  button.classList.add('tiny');
  return button;
}

function createMenuActionButton(icon, label, onClick, isDanger = false) {
  const button = createButton('', onClick);
  button.classList.add('menu-action-button');
  if (isDanger) {
    button.classList.add('is-danger');
  }
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `${createIconSpan(icon)}<span>${label}</span>`;
  return button;
}

function getIconMarkup(icon) {
  switch (icon) {
    case 'import':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v8"></path><path d="M6.5 7.5L10 11l3.5-3.5"></path><path d="M4 15h12"></path></svg>';
    case 'blankPage':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5h6l3 3V16a1 1 0 01-1 1H6a1 1 0 01-1-1v-11a1 1 0 011-1z"></path><path d="M12 3.5V7h3"></path></svg>';
    case 'text':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12"></path><path d="M10 5v10"></path></svg>';
    case 'rectangle':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="5" width="12" height="10" rx="1.5"></rect></svg>';
    case 'ellipse':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="10" rx="6" ry="4.5"></ellipse></svg>';
    case 'line':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14L16 6"></path></svg>';
    case 'arrow':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 14L16 6"></path><path d="M11.5 6H16v4.5"></path></svg>';
    case 'stamp':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 6a3 3 0 116 0c0 1.5-.3 2.6-.9 3.5h1.7v2H6.2v-2h1.7C7.3 8.6 7 7.5 7 6z"></path><path d="M5 14.5h10"></path></svg>';
    case 'image':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="11" rx="1.5"></rect><path d="M6 12l2-2 2.2 2.2L13.5 8l2 2"></path><circle cx="7.5" cy="8" r="1"></circle></svg>';
    case 'drawSignature':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 12.5c2-3 3.8-4.5 5.2-4.5 1 0 1.4.6 1.4 1.4 0 .9-.4 1.8-.4 2.4 0 .5.3.8.8.8 1.3 0 2.8-2.2 5-6.6"></path><path d="M13 14.5h3.5"></path></svg>';
    case 'logo':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2"></rect><path d="M7 13V7h2.4c1.8 0 2.7.9 2.7 2.2 0 1.4-.9 2.3-2.7 2.3H7"></path></svg>';
    case 'signatureAsset':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.5" y="4.5" width="13" height="11" rx="1.5"></rect><path d="M6 12.5c1.2-1.7 2.2-2.5 3-2.5.6 0 .8.3.8.8 0 .5-.2 1-.2 1.3 0 .3.2.5.5.5.8 0 1.8-1.2 3.2-3.8"></path></svg>';
    case 'header':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1.5"></rect><path d="M4 8h12"></path></svg>';
    case 'footer':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1.5"></rect><path d="M4 12h12"></path></svg>';
    case 'watermark':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5l5.5 5.5L10 15.5 4.5 10 10 4.5z"></path><path d="M7.5 10h5"></path></svg>';
    case 'templates':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="4" width="5" height="5" rx="1"></rect><rect x="11" y="4" width="5" height="5" rx="1"></rect><rect x="4" y="11" width="5" height="5" rx="1"></rect><rect x="11" y="11" width="5" height="5" rx="1"></rect></svg>';
    case 'saveTemplate':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 4h8l2 2v10H5z"></path><path d="M7 4v4h6V4"></path><path d="M8 13h4"></path></svg>';
    case 'up':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5"/><path d="M6.5 8.5L10 5l3.5 3.5"/></svg>';
    case 'down':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10"/><path d="M6.5 11.5L10 15l3.5-3.5"/></svg>';
    case 'rotate':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M14.5 7.5A5.5 5.5 0 107 15"/><path d="M14 3v5h-5"/></svg>';
    case 'duplicate':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="5" width="8" height="10" rx="1.5"/><rect x="4" y="8" width="8" height="8" rx="1.5"/></svg>';
    case 'delete':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10"/><path d="M8 6V4h4v2"/><path d="M7 6l.7 9h4.6L13 6"/></svg>';
    case 'more':
      return '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1.4" fill="currentColor" stroke="none"/></svg>';
    default:
      return '';
  }
}

function createIconSpan(icon) {
  return `<span class="button-icon" aria-hidden="true">${getIconMarkup(icon)}</span>`;
}

function createHelperCopy(text) {
  const helper = document.createElement('p');
  helper.className = 'helper-copy';
  helper.textContent = text;
  return helper;
}

function getSelectedPage() {
  return state.workspace.pages.find((page) => page.id === state.workspace.selection.pageId) || null;
}

function getSelectedObject() {
  return state.workspace.objects.find((object) => object.id === state.workspace.selection.objectId) || null;
}

function findAsset(assetId) {
  return state.workspace.assets.find((asset) => asset.id === assetId) || null;
}

function getBrandAssetsByRole(role) {
  return (state.workspace.brandAssets || []).filter((asset) => asset.role === role);
}

function resolvePreviewTokens(text, pageIndex) {
  return String(text || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
    if (key === 'pageNumber') {
      return String((pageIndex ?? 0) + 1);
    }

    if (key === 'pageCount') {
      return String(state.workspace.pages.length);
    }

    return `{{${key}}}`;
  });
}

async function paintPdfPage(canvas, page, zoom) {
  const doc = await loadPdfDoc(page.sourceAssetId);
  const pdfPage = await doc.getPage(page.sourcePageIndex + 1);
  const renderScale = zoom * window.devicePixelRatio;
  const viewport = pdfPage.getViewport({ scale: renderScale, rotation: page.rotation || 0 });

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${page.width * zoom}px`;
  canvas.style.height = `${page.height * zoom}px`;

  await pdfPage.render({
    canvasContext: canvas.getContext('2d'),
    viewport
  }).promise;
}

async function loadPdfDoc(assetId) {
  if (state.pdfDocCache.has(assetId)) {
    return state.pdfDocCache.get(assetId);
  }

  const response = await fetch(`/api/assets/${assetId}`);
  const bytes = await response.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: bytes });
  const doc = await loadingTask.promise;
  state.pdfDocCache.set(assetId, doc);
  return doc;
}

async function loadImageUrl(assetId) {
  if (state.assetUrlCache.has(assetId)) {
    return state.assetUrlCache.get(assetId);
  }

  const response = await fetch(`/api/assets/${assetId}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  state.assetUrlCache.set(assetId, url);
  return url;
}

async function runCommand(type, payload) {
  const response = await fetch('/api/workspace/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      type,
      payload,
      clientState: {
        selection: state.workspace.selection,
        viewState: state.workspace.viewState
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Command failed.');
  }

  applyWorkspace(data.workspace);
  notifyDirty();
}

function humanizeCommand(type) {
  return type.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

async function instantiateSelectedTemplate() {
  try {
    const template = getSelectedTemplate();

    if (!template) {
      setMessage('Choose a template first.', true);
      return;
    }

    const response = await fetch('/api/templates/instantiate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        templateId: template.id,
        values: state.templateUi.values
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Template instantiation failed.');
    }

    applyWorkspace(data.workspace);
    notifyDirty();
    closeTemplateModal();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function saveCurrentTemplate() {
  try {
    if (!state.workspace.pages.length) {
      setMessage('Create a document before saving a template.', true);
      return;
    }

    const name = window.prompt('Template name?', 'My PDF Template');
    if (!name) {
      return;
    }

    const description = window.prompt('Short description?', 'Saved from the current studio document.') || '';
    const category = window.prompt('Category?', 'Custom') || 'Custom';

    const response = await fetch('/api/templates/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, description, category })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Template save failed.');
    }

    state.templates.custom = Array.isArray(data.customTemplates) ? data.customTemplates : state.templates.custom;
    state.templateUi.activeTab = 'saved';
    state.templateUi.selectedId = data.template?.id || null;
    state.templateUi.values = buildTemplateValueState(data.template || { variables: [] });
    notifyDirty();
    openTemplateModal();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function deleteTemplate(templateId) {
  try {
    const response = await fetch(`/api/templates/${templateId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Template delete failed.');
    }

    state.templates.custom = Array.isArray(data.customTemplates) ? data.customTemplates : [];
    ensureTemplateSelection();
    renderTemplateModal();
    notifyDirty();
  } catch (error) {
    setMessage(error.message, true);
  }
}

async function createTextObject() {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'text',
      bounds: {
        x: page.width * 0.14,
        y: page.height * 0.12,
        width: 220,
        height: 54
      },
      opacity: 1,
      payload: {
        text: 'Double-click to edit',
        font: 'Helvetica',
        fontSize: 24,
        color: '#1f1812',
        align: 'left'
      }
    }
  });
}

async function createRectangleObject() {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'rect',
      bounds: {
        x: page.width * 0.2,
        y: page.height * 0.2,
        width: 180,
        height: 110
      },
      opacity: 1,
      payload: {
        strokeColor: '#b6532f',
        fillColor: 'transparent',
        strokeWidth: 2
      }
    }
  });
}

async function createEllipseObject() {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'ellipse',
      bounds: {
        x: page.width * 0.22,
        y: page.height * 0.22,
        width: 180,
        height: 120
      },
      opacity: 1,
      payload: {
        strokeColor: '#665b52',
        fillColor: 'transparent',
        strokeWidth: 2
      }
    }
  });
}

async function createLineLikeObject(type) {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type,
      bounds: {
        x: page.width * 0.2,
        y: page.height * 0.28,
        width: 220,
        height: 36
      },
      opacity: 1,
      payload: {
        strokeColor: type === 'arrow' ? '#b6532f' : '#665b52',
        strokeWidth: 3,
        headSize: 16,
        start: { x: 0, y: 0.5 },
        end: { x: 1, y: 0.5 }
      }
    }
  });
}

async function createStampObject() {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'stamp',
      bounds: {
        x: page.width * 0.18,
        y: page.height * 0.18,
        width: 220,
        height: 92
      },
      opacity: 1,
      rotation: -12,
      payload: {
        stampKind: 'text',
        label: 'APPROVED',
        borderShape: 'rect',
        strokeColor: '#8f2b21',
        textColor: '#8f2b21',
        fillColor: 'transparent',
        strokeWidth: 2,
        fontSize: 22,
        font: 'HelveticaBold'
      },
      presetId: 'stamp_approval_red'
    }
  });
}

async function createImageObject(asset) {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  const bounds = fitIntoBox(asset.width || 300, asset.height || 160, 220, 220);
  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'image',
      bounds: {
        x: page.width * 0.18,
        y: page.height * 0.2,
        width: bounds.width,
        height: bounds.height
      },
      opacity: 1,
      payload: {
        assetId: asset.id
      }
    }
  });
}

async function createRepeatedTextObject(role) {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  const defaults = {
    header: {
      text: 'Company Header',
      x: page.width * 0.08,
      y: 26,
      width: page.width * 0.5,
      height: 40,
      opacity: 1
    },
    footer: {
      text: 'Confidential',
      x: page.width * 0.55,
      y: page.height - 48,
      width: page.width * 0.3,
      height: 26,
      opacity: 0.9
    },
    watermark: {
      text: 'DRAFT',
      x: page.width * 0.18,
      y: page.height * 0.36,
      width: page.width * 0.64,
      height: 90,
      opacity: 0.18
    }
  };

  const config = defaults[role];
  await runCommand('createRepeatedObject', {
    repeatMode: 'all',
    repeatRole: role,
    object: {
      type: 'text',
      bounds: {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height
      },
      opacity: config.opacity,
      rotation: role === 'watermark' ? -16 : 0,
      payload: {
        text: config.text,
        font: role === 'header' ? 'TimesRoman' : 'Helvetica',
        fontSize: role === 'watermark' ? 42 : 16,
        color: role === 'watermark' ? '#b6532f' : '#2d2620',
        align: role === 'footer' ? 'right' : 'left',
        repeatRole: role
      }
    }
  });
}

async function saveBrandAsset(asset, role) {
  await runCommand('saveBrandAsset', {
    assetId: asset.id,
    role,
    name: `${role === 'logo' ? 'Logo' : role === 'signature' ? 'Signature' : 'Stamp'}: ${asset.name}`
  });
  setActiveDock('brandAssets', false);
}

async function insertBrandAssetByRole(role) {
  const brandAsset = getBrandAssetsByRole(role)[0];

  if (!brandAsset) {
    setMessage(`No saved ${role} asset yet. Import an image and save it from the library first.`, true);
    return;
  }

  await insertBrandAsset(brandAsset);
}

async function insertBrandAsset(brandAsset) {
  const asset = findAsset(brandAsset.assetId);

  if (!asset) {
    setMessage('That brand asset no longer has a backing image.', true);
    return;
  }

  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  const bounds = fitIntoBox(asset.width || 300, asset.height || 160, brandAsset.role === 'logo' ? 180 : 220, 120);
  const defaultY = brandAsset.role === 'logo' ? 36 : page.height * 0.22;

  if (brandAsset.role === 'stamp') {
    await runCommand('createObject', {
      pageId: page.id,
      object: {
        type: 'stamp',
        bounds: {
          x: page.width * 0.16,
          y: page.height * 0.18,
          width: Math.max(bounds.width, 180),
          height: Math.max(bounds.height, 90)
        },
        opacity: 1,
        rotation: -10,
        payload: {
          stampKind: 'image',
          assetId: asset.id,
          borderShape: 'rect',
          strokeColor: '#8f2b21',
          fillColor: 'transparent',
          strokeWidth: 2
        }
      }
    });
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'image',
      bounds: {
        x: page.width * 0.08,
        y: defaultY,
        width: bounds.width,
        height: bounds.height
      },
      opacity: 1,
      payload: {
        assetId: asset.id
      }
    }
  });
}

function fitIntoBox(width, height, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.max(40, width * ratio),
    height: Math.max(40, height * ratio)
  };
}

function requireSelectedPage() {
  const page = getSelectedPage();

  if (!page) {
    setMessage('Select or create a page first.', true);
    return null;
  }

  return page;
}

function beginDrag(event, object) {
  event.preventDefault();
  event.stopPropagation();
  selectObject(object);

  const zoom = state.workspace.viewState.zoom || 1;
  state.drag = {
    mode: 'move',
    objectId: object.id,
    element: event.currentTarget,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    initialBounds: { ...object.bounds },
    zoom
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', finishPointerInteraction, { once: true });
}

function beginResize(event, object) {
  event.preventDefault();
  event.stopPropagation();
  selectObject(object);

  const zoom = state.workspace.viewState.zoom || 1;
  state.drag = {
    mode: 'resize',
    objectId: object.id,
    element: event.currentTarget,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    initialBounds: { ...object.bounds },
    zoom
  };

  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', finishPointerInteraction, { once: true });
}

function handlePointerMove(event) {
  if (!state.drag || event.pointerId !== state.drag.pointerId) {
    return;
  }

  const object = getSelectedObject();
  if (!object) {
    return;
  }

  const deltaX = (event.clientX - state.drag.startX) / state.drag.zoom;
  const deltaY = (event.clientY - state.drag.startY) / state.drag.zoom;
  const page = getSelectedPage();

  if (!page) {
    return;
  }

  if (state.drag.mode === 'move') {
    object.bounds.x = clamp(state.drag.initialBounds.x + deltaX, 0, Math.max(page.width - object.bounds.width, 0));
    object.bounds.y = clamp(state.drag.initialBounds.y + deltaY, 0, Math.max(page.height - object.bounds.height, 0));
    state.drag.element.style.left = `${object.bounds.x * state.drag.zoom}px`;
    state.drag.element.style.top = `${object.bounds.y * state.drag.zoom}px`;
  } else {
    object.bounds.width = Math.max(24, state.drag.initialBounds.width + deltaX);
    object.bounds.height = Math.max(24, state.drag.initialBounds.height + deltaY);
    state.drag.element.style.width = `${object.bounds.width * state.drag.zoom}px`;
    state.drag.element.style.height = `${object.bounds.height * state.drag.zoom}px`;
  }
}

async function finishPointerInteraction() {
  window.removeEventListener('pointermove', handlePointerMove);

  if (!state.drag) {
    return;
  }

  const object = getSelectedObject();
  const drag = state.drag;
  state.drag = null;

  if (!object) {
    return;
  }

  try {
    await runCommand('updateObject', {
      objectId: object.id,
      updates: {
        bounds: object.bounds
      }
    });
  } catch (error) {
    setMessage(error.message, true);
    await refreshWorkspace();
  }
}

function selectObject(object) {
  if (object.target.kind === 'page') {
    state.workspace.selection.pageId = object.target.pageId;
  }
  state.workspace.selection.objectId = object.id;
  renderSidebar();
  renderInspector();
  scheduleViewStateSync();
}

async function updateBounds(object, boundsPatch) {
  await runCommand('updateObject', {
    objectId: object.id,
    updates: {
      bounds: {
        ...object.bounds,
        ...boundsPatch
      }
    }
  });
}

async function updateObjectPayload(objectId, payloadPatch) {
  await runCommand('updateObject', {
    objectId,
    updates: {
      payload: payloadPatch
    }
  });
}

function updateZoom(delta) {
  const current = state.workspace.viewState.zoom || 1;
  state.workspace.viewState.zoom = clamp(Number((current + delta).toFixed(2)), 0.4, 2.5);
  render();
  scheduleViewStateSync();
}

function scheduleViewStateSync() {
  window.clearTimeout(state.viewSyncTimer);
  state.viewSyncTimer = window.setTimeout(async () => {
    try {
      await fetch('/api/workspace/view', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selection: state.workspace.selection,
          viewState: state.workspace.viewState
        })
      });
      notifyDirty();
    } catch (error) {
      console.error('Failed to sync view state:', error);
    }
  }, 250);
}

async function exportPdf() {
  try {
    const response = await fetch('/api/export/pdf', { method: 'POST' });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Export failed.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'browserpod-pdf-studio.pdf';
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    setMessage(error.message, true);
  }
}

function notifyDirty() {
  window.parent.postMessage({ type: 'workspace-dirty' }, '*');
}

function setMessage(message, isError = false) {
  window.clearTimeout(state.messageTimer);

  if (!message || message === 'Ready.') {
    els.messageBar.textContent = '';
    els.messageBar.className = 'message-bar';
    return;
  }

  els.messageBar.textContent = message;
  els.messageBar.className = `message-bar is-visible${isError ? ' is-error' : ''}`;

  if (!isError) {
    state.messageTimer = window.setTimeout(() => {
      els.messageBar.textContent = '';
      els.messageBar.className = 'message-bar';
    }, 2400);
  }
}

function initSignaturePad() {
  const context = els.signatureCanvas.getContext('2d');
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = 2.2;
  context.strokeStyle = '#1f1812';

  const start = (event) => {
    const point = getCanvasPoint(event);
    state.signatureStroke = [point];
    state.signatureStrokes.push(state.signatureStroke);
  };

  const move = (event) => {
    if (!state.signatureStroke) {
      return;
    }

    const point = getCanvasPoint(event);
    const previous = state.signatureStroke[state.signatureStroke.length - 1];
    state.signatureStroke.push(point);
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const finish = () => {
    state.signatureStroke = null;
  };

  els.signatureCanvas.addEventListener('pointerdown', start);
  els.signatureCanvas.addEventListener('pointermove', move);
  els.signatureCanvas.addEventListener('pointerup', finish);
  els.signatureCanvas.addEventListener('pointerleave', finish);

  els.closeSignatureButton.addEventListener('click', closeSignatureModal);
  els.clearSignatureButton.addEventListener('click', clearSignaturePad);
  els.saveSignatureButton.addEventListener('click', () => {
    void insertDrawnSignature();
  });
}

function getCanvasPoint(event) {
  const rect = els.signatureCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * els.signatureCanvas.width,
    y: ((event.clientY - rect.top) / rect.height) * els.signatureCanvas.height
  };
}

function openSignatureModal() {
  els.signatureModal.classList.remove('hidden');
}

function closeSignatureModal() {
  els.signatureModal.classList.add('hidden');
}

function clearSignaturePad() {
  const context = els.signatureCanvas.getContext('2d');
  context.clearRect(0, 0, els.signatureCanvas.width, els.signatureCanvas.height);
  state.signatureStrokes = [];
  state.signatureStroke = null;
}

async function insertDrawnSignature() {
  const page = requireSelectedPage();
  if (!page) {
    return;
  }

  const normalizedStrokes = state.signatureStrokes
    .filter((stroke) => stroke.length > 1)
    .map((stroke) => stroke.map((point) => ({
      x: point.x / els.signatureCanvas.width,
      y: point.y / els.signatureCanvas.height
    })));

  if (!normalizedStrokes.length) {
    setMessage('Draw a signature first.', true);
    return;
  }

  await runCommand('createObject', {
    pageId: page.id,
    object: {
      type: 'signature',
      bounds: {
        x: page.width * 0.18,
        y: page.height * 0.18,
        width: 220,
        height: 90
      },
      opacity: 1,
      payload: {
        strokes: normalizedStrokes,
        strokeColor: '#1f1812',
        strokeWidth: 2.2
      }
    }
  });

  clearSignaturePad();
  closeSignatureModal();
}

function buildSignatureSvg(object) {
  const strokeColor = object.payload.strokeColor || '#1f1812';
  const strokeWidth = object.payload.strokeWidth || 2.2;
  const paths = (object.payload.strokes || [])
    .map((stroke) => {
      if (!stroke.length) {
        return '';
      }

      const commands = stroke.map((point, index) => {
        const x = point.x * object.bounds.width;
        const y = point.y * object.bounds.height;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
      }).join(' ');

      return `<path d="${commands}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
    })
    .join('');

  return `<svg viewBox="0 0 ${object.bounds.width} ${object.bounds.height}" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}

async function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.width, height: image.height });
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => reject(new Error('Could not read image dimensions.'));
    image.src = URL.createObjectURL(file);
  });
}

function mapFontFamily(fontName) {
  if (fontName === 'TimesRoman') {
    return '"Times New Roman", serif';
  }

  if (fontName === 'Courier') {
    return '"Courier New", monospace';
  }

  return 'Helvetica, Arial, sans-serif';
}

function supportsRotation(object) {
  return ['text', 'ellipse', 'stamp', 'image'].includes(object.type);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function placeCaretAtEnd(element) {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
