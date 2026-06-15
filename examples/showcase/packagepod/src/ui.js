export function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle')
  const isDarkMode = localStorage.getItem('theme') === 'dark'
  
  if (isDarkMode) {
    document.body.classList.add('dark-mode')
    themeToggle.checked = true
  }
  
  themeToggle.addEventListener('change', () => {
    const isDark = themeToggle.checked
    if (isDark) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  })
}

export function log(msg, type = 'info') {
  const consoleDiv = document.getElementById('app-console')
  const entry = document.createElement('div')
  entry.className = `console-entry ${type}`
  
  const now = new Date().toLocaleTimeString()
  entry.innerHTML = `<span class="console-timestamp">[${now}]</span> ${msg}`
  
  consoleDiv.appendChild(entry)
  consoleDiv.scrollTop = consoleDiv.scrollHeight
}

export function clearConsole() {
  document.getElementById('app-console').innerHTML = ''
}

export function setServerStatus(status) {
  const statusDiv = document.getElementById('server-status')
  if (!statusDiv) return
  
  if (status === 'online') {
    statusDiv.textContent = '✓ Online'
    statusDiv.className = 'status-indicator online'
  } else {
    statusDiv.textContent = '✗ Offline'
    statusDiv.className = 'status-indicator offline'
  }
}

export function setServerInfo(info) {
  const infoDiv = document.getElementById('server-info')
  if (!infoDiv) return
  infoDiv.innerHTML = info
}

export function displayFilesystemChanges(diff) {
  const changesDiv = document.getElementById('fs-changes')
  if (!changesDiv) return
  
  let html = ''
  if (diff.added.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-added">Added Files</h4><div class="fs-list">'
    diff.added.slice(0, 20).forEach(file => {
      html += `<div class="fs-item fs-item-added">+ ${file.replace('/test', '')}</div>`
    })
    if (diff.added.length > 20) html += `<div class="fs-item-count">... and ${diff.added.length - 20} more</div>`
    html += '</div></div>'
  }
  if (diff.modified.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-modified">Modified Files</h4><div class="fs-list">'
    diff.modified.slice(0, 20).forEach(file => {
      html += `<div class="fs-item fs-item-modified">~ ${file.replace('/test', '')}</div>`
    })
    if (diff.modified.length > 20) html += `<div class="fs-item-count">... and ${diff.modified.length - 20} more</div>`
    html += '</div></div>'
  }
  if (diff.removed.length > 0) {
    html += '<div class="fs-section"><h4 class="fs-header-removed">Removed Files</h4><div class="fs-list">'
    diff.removed.slice(0, 20).forEach(file => {
      html += `<div class="fs-item fs-item-removed">- ${file.replace('/test', '')}</div>`
    })
    if (diff.removed.length > 20) html += `<div class="fs-item-count">... and ${diff.removed.length - 20} more</div>`
    html += '</div></div>'
  }
  const total = diff.added.length + diff.modified.length + diff.removed.length
  const summary = `<div class="fs-summary">${diff.added.length} added, ${diff.modified.length} modified, ${diff.removed.length} removed (${total} total)</div>`
  changesDiv.innerHTML = summary + html
}
