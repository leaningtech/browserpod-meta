import {
  findConversion,
  formatTargetLabel,
  getFileExtension,
  getSupportedSourceExtensions,
  getTargetsForSource,
} from './lib/conversion-registry.js';
import { convertAudioInBrowser } from './lib/audio-host.js';
import { ensurePod, runPodConversion } from './lib/browserpod-runtime.js';
import { convertImageInBrowser } from './lib/image-host.js';
import { convertPdfInBrowser } from './lib/pdf-host.js';
import { formatError } from './lib/pod-utils.js';

const app = document.querySelector('#app');
const terminalHost = document.querySelector('#terminal-host');
const acceptList = getSupportedSourceExtensions()
  .map((extension) => `.${extension}`)
  .join(',');
const supportedTypesLabel = [
  'JSON',
  'XML',
  'CSV',
  'XLSX',
  'MD',
  'HTML',
  'DOCX',
  'TXT',
  'PDF',
  'WAV',
  'MP3',
  'PNG',
  'JPG',
  'JPEG',
  'WEBP',
].join(' ');

const state = {
  error: '',
  download: null,
  file: null,
  isConverting: false,
  isDragging: false,
  progress: null,
  sourceExt: '',
  targetExt: '',
  targets: [],
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function revokeDownload() {
  if (state.download?.url) {
    URL.revokeObjectURL(state.download.url);
  }
}

function clearDownload() {
  revokeDownload();
  state.download = null;
}

function setDownload(file) {
  clearDownload();
  state.download = {
    ...file,
    url: URL.createObjectURL(file.blob),
  };
}

function resetFeedback() {
  state.error = '';
  state.progress = null;
  clearDownload();
}

function updateProgress(percent) {
  const nextPercent = Math.max(0, Math.min(100, Math.round(percent)));

  if (state.progress !== nextPercent) {
    state.progress = nextPercent;
    render();
  }
}

async function setFile(file) {
  resetFeedback();
  state.file = file ?? null;
  state.sourceExt = file ? getFileExtension(file.name) : '';
  state.targets = file ? getTargetsForSource(state.sourceExt) : [];
  state.targetExt = state.targets.includes(state.targetExt)
    ? state.targetExt
    : state.targets[0] ?? '';

  if (file && state.targets.length === 0) {
    state.error = 'Unsupported file type.';
  }

  render();
}

async function handleConvert() {
  if (!state.file || !state.targetExt || state.isConverting) {
    return;
  }

  const conversion = findConversion(state.sourceExt, state.targetExt);

  if (!conversion) {
    state.error = 'Unsupported conversion.';
    render();
    return;
  }

  resetFeedback();
  state.isConverting = true;
  state.progress = 2;
  render();

  try {
    let output;

    if (conversion.executionMode === 'host') {
      await ensurePod(terminalHost);
      updateProgress(6);

      if (conversion.id === 'pdf') {
        output = await convertPdfInBrowser({
          file: state.file,
          targetExt: state.targetExt,
          onProgress: updateProgress,
        });
      } else if (conversion.id === 'audio') {
        output = await convertAudioInBrowser({
          file: state.file,
          sourceExt: state.sourceExt,
          targetExt: state.targetExt,
          onProgress: updateProgress,
        });
      } else {
        output = await convertImageInBrowser({
          file: state.file,
          targetExt: state.targetExt,
          onProgress: updateProgress,
        });
      }
    } else {
      output = await runPodConversion({
        terminalHost,
        file: state.file,
        targetExt: state.targetExt,
        onProgress: updateProgress,
      });
    }

    setDownload(output);
    updateProgress(100);
  } catch (error) {
    state.error = formatError(error);
    state.progress = null;
  } finally {
    state.isConverting = false;
    render();
  }
}

function bindEvents() {
  const fileInput = app.querySelector('#file-input');
  const dropzone = app.querySelector('.dropzone');
  const convertButton = app.querySelector('#convert-button');

  fileInput?.addEventListener('change', async (event) => {
    const [file] = event.currentTarget.files ?? [];
    await setFile(file ?? null);
  });

  dropzone?.addEventListener('dragenter', (event) => {
    event.preventDefault();
    state.isDragging = true;
    render();
  });

  dropzone?.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  dropzone?.addEventListener('dragleave', (event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }

    state.isDragging = false;
    render();
  });

  dropzone?.addEventListener('drop', async (event) => {
    event.preventDefault();
    state.isDragging = false;
    const [file] = event.dataTransfer?.files ?? [];
    await setFile(file ?? null);
  });

  app.querySelectorAll('[data-target-option]').forEach((button) => {
    button.addEventListener('click', () => {
      state.targetExt = button.dataset.targetOption || '';
      state.error = '';
      state.progress = null;
      clearDownload();
      render();
    });
  });

  convertButton?.addEventListener('click', async () => {
    await handleConvert();
  });
}

function render() {
  const hasTargets = state.targets.length > 0;
  const showConvert = state.file && hasTargets && !state.download;

  app.innerHTML = `
    <main class="shell">
      <section class="mast">
        <h1 class="mast-title">Wololo</h1>
      </section>

      <section class="rail">
        <label class="dropzone ${state.isDragging ? 'dropzone-dragging' : ''}" for="file-input">
          <input id="file-input" class="visually-hidden" type="file" accept="${acceptList}" />
          <span class="dropzone-main">${
            state.file ? escapeHtml(state.file.name) : 'Drop a file'
          }</span>
          <span class="dropzone-meta">${state.file ? 'Replace' : 'Choose'}</span>
        </label>
      </section>

      ${
        hasTargets
          ? `
            <section class="rail">
              <p class="section-label">To</p>
              <div class="target-grid">
                ${state.targets
                  .map(
                    (targetExt) => `
                      <button
                        type="button"
                        class="target-option ${
                          state.targetExt === targetExt ? 'target-option-active' : ''
                        }"
                        data-target-option="${targetExt}"
                      >
                        ${formatTargetLabel(targetExt)}
                      </button>
                    `
                  )
                  .join('')}
              </div>
            </section>
          `
          : ''
      }

      ${
        state.error
          ? `
            <section class="rail">
              <p class="error-text">${escapeHtml(state.error)}</p>
            </section>
          `
          : ''
      }

      ${
        state.progress !== null
          ? `
            <section class="rail">
              <div class="progress-meta">
                <span>${state.progress}%</span>
              </div>
              <div class="progress-track" aria-hidden="true">
                <span class="progress-fill" style="width: ${state.progress}%"></span>
              </div>
            </section>
          `
          : ''
      }

      ${
        showConvert
          ? `
            <section class="rail rail-action">
              <button
                id="convert-button"
                class="primary-action"
                type="button"
                ${state.isConverting ? 'disabled' : ''}
              >
                Convert
              </button>
            </section>
          `
          : ''
      }

      ${
        state.download
          ? `
            <section class="rail rail-action">
              <a class="primary-action" href="${state.download.url}" download="${escapeHtml(
                state.download.name
              )}">
                Download
              </a>
            </section>
          `
          : ''
      }

      <section class="rail rail-meta">
        <p class="meta-note">Supports ${supportedTypesLabel}</p>
        <p class="meta-note">Powered by BrowserPod</p>
      </section>
    </main>
  `;

  bindEvents();
}

window.addEventListener('beforeunload', () => {
  revokeDownload();
});

render();
void ensurePod(terminalHost).catch(() => undefined);
