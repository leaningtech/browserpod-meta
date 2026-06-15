import { BrowserPod } from '@leaningtech/browserpod';
import { getSessionBundle, saveSessionBundle } from './storage';
import { copyFile, writeTextFile } from './utils';

const POD_FILES = [
  'project/main.js',
  'project/package.json',
  'project/package-lock.json',
  'project/public/index.html',
  'project/public/editor.js',
  'project/public/editor.css',
  'project/public/image.png'
];

const ui = {
  shell: document.getElementById('siteShell'),
  liveHeader: document.getElementById('liveHeader'),
  launchScreen: document.getElementById('launchScreen'),
  launchButton: document.getElementById('launchButton'),
  launchProgressBar: document.getElementById('launchProgressBar'),
  console: document.getElementById('console'),
  statusText: document.getElementById('statusText'),
  statusHeadline: document.getElementById('statusHeadline'),
  statusPill: document.getElementById('statusPill'),
  portalSection: document.getElementById('portalSection'),
  portal: document.getElementById('portal'),
  portalText: document.getElementById('portalText'),
  statusDot: document.getElementById('statusDot')
};

const STATUS_META = {
  idle: {
    pill: 'Ready',
    headline: 'Status'
  },
  booting: {
    pill: 'Booting',
    headline: 'Status'
  },
  live: {
    pill: 'Live',
    headline: 'Status'
  },
  error: {
    pill: 'Error',
    headline: 'Status'
  }
};

let pod = null;
let portalUrl = '';
let latestBundle = null;
let exportTimer = null;
let studioStarted = false;

window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'workspace-dirty' || !portalUrl) {
    return;
  }

  scheduleSessionSave();
});

ui.launchButton.addEventListener('click', () => {
  void launchStudio();
});

init();

async function init() {
  try {
    latestBundle = await getSessionBundle();
  } catch (error) {
    console.error('Failed to read IndexedDB session:', error);
  }

  setStatus('Ready to launch.', 'idle', 0);
}

function setStatus(message, kind, progress = 0) {
  const meta = STATUS_META[kind] || STATUS_META.idle;
  document.body.dataset.launchState = kind;
  ui.statusText.textContent = message;
  ui.statusHeadline.textContent = meta.headline;
  ui.statusPill.textContent = meta.pill;
  ui.statusPill.className = `status-pill status-${kind}`;
  ui.statusDot.className = `status-dot status-${kind}`;
  ui.launchProgressBar.style.width = `${Math.max(0, Math.min(progress, 1)) * 100}%`;
}

async function fetchApiKey() {
  const response = await fetch('/api/bp-key');

  if (!response.ok) {
    throw new Error(`Failed to fetch API key (${response.status})`);
  }

  const { apiKey } = await response.json();

  if (!apiKey) {
    throw new Error('API key missing from /api/bp-key response');
  }

  return apiKey;
}

async function launchStudio() {
  if (studioStarted) {
    setStatus('Studio is already running in this tab.', 'live', 1);
    return;
  }

  studioStarted = true;
  ui.launchButton.disabled = true;
  setStatus('Booting BrowserPod and preparing the PDF studio…', 'booting', 0.2);

  try {
    const apiKey = await fetchApiKey();
    pod = await BrowserPod.boot({ apiKey });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const terminal = await pod.createDefaultTerminal(ui.console);

    await pod.createDirectory('/project');
    await pod.createDirectory('/project/public');
    await pod.createDirectory('/project/session');

    for (const filePath of POD_FILES) {
      await copyFile(pod, filePath);
    }

    if (latestBundle) {
      await writeTextFile(pod, '/project/session/session.json', JSON.stringify(latestBundle));
    }

    pod.onPortal(({ url }) => {
      portalUrl = url;
      ui.shell.classList.add('is-live');
      ui.liveHeader.classList.remove('is-hidden');
      ui.portalSection.classList.remove('is-hidden');
      ui.portal.src = url;
      ui.portalText.textContent = 'Portal live.';
      setStatus('Studio is live. Changes will autosave in this browser.', 'live', 1);
    });

    setStatus('Installing inner-project dependencies in the pod…', 'booting', 0.68);
    await pod.run('npm', ['install'], { terminal, cwd: '/project', echo: false });

    setStatus('Starting the inner Express server…', 'booting', 0.88);
    pod.run('node', ['main.js'], { terminal, cwd: '/project', echo: false });
  } catch (error) {
    console.error(error);
    studioStarted = false;
    ui.launchButton.disabled = false;
    setStatus(`Failed to launch studio: ${error.message}`, 'error', 1);
  }
}

function scheduleSessionSave() {
  if (!portalUrl) {
    return;
  }

  window.clearTimeout(exportTimer);
  exportTimer = window.setTimeout(() => {
    void persistPortalSession();
  }, 500);
}

async function persistPortalSession() {
  try {
    const response = await fetch(`${portalUrl}/api/session/export`);

    if (!response.ok) {
      throw new Error(`Session export failed with ${response.status}`);
    }

    latestBundle = await response.json();
    await saveSessionBundle(latestBundle);
  } catch (error) {
    console.error('Failed to persist session bundle:', error);
  }
}
