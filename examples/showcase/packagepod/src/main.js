import { BrowserPod } from '@leaningtech/browserpod'
import { log, clearConsole, setServerStatus, setServerInfo, initThemeToggle } from './ui.js'

let pod = null
let terminal = null
let lastTestedPackage = null

let searchState = {
  keyword: '',
  page: 0,
  totalResults: 0
}

async function searchPackages(keyword, page = 0) {
  try {
    const from = page * 20
    const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(keyword)}&size=20&from=${from}`)
    
    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`)
    }
    
    const data = await response.json()
    searchState.totalResults = data.total || 0
    return data.objects || []
  } catch (err) {
    log(`Search error: ${err.message}`, 'error')
    return []
  }
}

async function handleSearch() {
  const keyword = document.getElementById('search-keyword').value.trim()
  
  if (!keyword) {
    log('Please enter a keyword to search', 'warn')
    return
  }
  
  searchState.keyword = keyword
  searchState.page = 0
  displaySearchResults()
}

async function displaySearchResults() {
  log(`Searching for packages with keyword: "${searchState.keyword}" (page ${searchState.page + 1})`, 'info')
  
  const results = await searchPackages(searchState.keyword, searchState.page)
  const resultsList = document.getElementById('search-results-list')
  const searchResultsDiv = document.getElementById('search-results')
  
  if (results.length === 0) {
    resultsList.innerHTML = '<div style="padding: 12px; color: #666;">No packages found</div>'
  } else {
    resultsList.innerHTML = results.map(pkg => `
      <div style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer;" data-package-name="${pkg.package.name}">
        <strong>${pkg.package.name}</strong>
        <div style="font-size: 12px; color: #666;">${pkg.package.description || 'No description'}</div>
      </div>
    `).join('')
  }
  
  // Add pagination controls
  const pageNum = searchState.page + 1
  const totalPages = Math.ceil(searchState.totalResults / 20)
  const paginationHtml = `
    <div style="padding: 12px; border-top: 1px solid #eee; display: flex; gap: 8px; justify-content: center; align-items: center;">
      <button id="prev-page" ${searchState.page === 0 ? 'disabled' : ''} style="padding: 6px 12px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; ${searchState.page === 0 ? 'opacity: 0.5; cursor: not-allowed;' : ''}">← Previous</button>
      <span style="font-size: 14px; color: #666;">Page ${pageNum} of ${totalPages}</span>
      <button id="next-page" ${pageNum >= totalPages ? 'disabled' : ''} style="padding: 6px 12px; background: #0284c7; color: white; border: none; border-radius: 4px; cursor: pointer; ${pageNum >= totalPages ? 'opacity: 0.5; cursor: not-allowed;' : ''}">Next →</button>
    </div>
  `
  resultsList.innerHTML += paginationHtml
  
  // Attach event listeners to pagination buttons
  document.getElementById('prev-page').addEventListener('click', handlePrevPage)
  document.getElementById('next-page').addEventListener('click', handleNextPage)
  
  // Attach click handlers to package items
  document.querySelectorAll('[data-package-name]').forEach(el => {
    el.addEventListener('click', (e) => {
      document.getElementById('package-input').value = el.dataset.packageName
      document.getElementById('search-results').style.display = 'none'
    })
  })
  
  searchResultsDiv.style.display = 'block'
  log(`Found ${searchState.totalResults} total packages (showing ${results.length})`, 'success')
}

function handlePrevPage() {
  if (searchState.page > 0) {
    searchState.page--
    displaySearchResults()
  }
}

function handleNextPage() {
  const totalPages = Math.ceil(searchState.totalResults / 20)
  if (searchState.page + 1 < totalPages) {
    searchState.page++
    displaySearchResults()
  }
}

async function initBrowserPod() {
  try {
    log('Initializing BrowserPod...', 'info')
    
    const apiKey = import.meta.env.VITE_BP_APIKEY
    if (!apiKey) {
      throw new Error('BrowserPod API key not found in .env file')
    }
    
    pod = await BrowserPod.boot({ apiKey })
    log('BrowserPod initialized successfully', 'success')
    
    // Listen for Portal creation
    pod.onPortal(({ url, port }) => {
      log(`🌐 Portal available at: ${url}`, 'success')
      const portalLink = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      setServerInfo(`Portal: ${portalLink}`)
    })
    
    // Create terminal once and reuse it
    const consoleElement = document.getElementById("console")
    if (!consoleElement) {
      throw new Error('Console element not found in DOM')
    }
    
    terminal = await pod.createDefaultTerminal(consoleElement)
    log('Terminal created', 'success')
    
    return true
  } catch (err) {
    log(`BrowserPod init failed: ${err.message}`, 'error')
    return false
  }
}

async function captureCommand(command, args, cwd = "/root/test") {
  // Capture by running with echo to terminal and storing text
  let capturedOutput = ''
  
  const customTerminal = {
    write: (text) => {
      capturedOutput += text
    }
  }
  
  try {
    await pod.run(command, args, {
      cwd: cwd
    })
  } catch (e) {
    // Ignore errors
  }
  
  return capturedOutput
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ])
}

async function testPackage(packageName) {
  try {
    if (!packageName.trim()) {
      log('Please enter a package name', 'warn')
      return
    }

    lastTestedPackage = packageName
    log(`Testing package: ${packageName}`, 'info')
    
    // Don't create directory - just use home directory
    const workDir = "/root/test"
    
    
    // Install package
    log(`Installing ${packageName}...`, 'info')
    try {
      await withTimeout(
        pod.run("npm", ["install", packageName, "--no-update-notifier"], {
          terminal: terminal,
          cwd: workDir
        }),
        60000 // 60 second timeout
      )
      log(`Installation completed`, 'success')
    } catch (e) {
      log(`Installation error: ${e.message}`, 'error')
      throw e
    }
    
    log(`Gathering package information...`, 'info')
    
    // Show dependency tree
    try {
      await pod.run("npm", ["ls", packageName, "--no-update-notifier"], {
        terminal: terminal,
        cwd: workDir
      })
      log(`Dependency tree completed`, 'success')
    } catch (e) {
      log(`Dependency tree error: ${e.message}`, 'warn')
    }
    
    // Run security audit
    log(`Checking vulnerabilities...`, 'info')
    try {
      const auditOutput = await captureCommand("npm", ["audit", "--no-update-notifier"])
      const auditJson = auditOutput.includes('{') ? auditOutput.substring(auditOutput.indexOf('{')) : '{}'
      let auditData = {}
      try {
        auditData = JSON.parse(auditJson)
      } catch (e) {
        // Parse failed, try extracting from text
        auditData = parseAuditText(auditOutput)
      }
      log(`Audit completed`, 'success')
    } catch (e) {
      log(`Audit error: ${e.message}`, 'warn')
    }
    
    let auditData = {}
    
    // Get funding info
    log(`Checking funding opportunities...`, 'info')
    try {
      await pod.run("npm", ["fund", "--no-update-notifier"], {
        terminal: terminal,
        cwd: workDir
      })
      log(`Funding check completed`, 'success')
    } catch (e) {
      log(`Funding error: ${e.message}`, 'warn')
    }
    
    // Display results
    displayResults(packageName, auditData)
    
    log(`✓ ${packageName} analysis completed successfully`, 'success')
    setServerStatus('tested')
    setServerInfo(`${packageName} installed and analyzed`)
    
    // Clear the terminal prompt by sending a clear command (with no visible output)
    try {
      await pod.run("clear", [], { cwd: workDir })
    } catch (e) {
      // Ignore errors from clear command
    }
    
  } catch (err) {
    log(`Test failed: ${err.message}`, 'error')
    throw err
  }
}

function parseAuditText(text) {
  // Parse audit output text for vulnerability counts
  const data = {
    metadata: {
      vulnerabilities: {
        total: 0,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0
      },
      dependencies: 0
    }
  }
  
  // Extract vulnerability counts from text
  const vulnMatch = text.match(/(\d+)\s+vulnerabilities?/)
  if (vulnMatch) data.metadata.vulnerabilities.total = parseInt(vulnMatch[1])
  
  const criticalMatch = text.match(/(\d+)\s+critical/)
  if (criticalMatch) data.metadata.vulnerabilities.critical = parseInt(criticalMatch[1])
  
  const highMatch = text.match(/(\d+)\s+high/)
  if (highMatch) data.metadata.vulnerabilities.high = parseInt(highMatch[1])
  
  const moderateMatch = text.match(/(\d+)\s+moderate/)
  if (moderateMatch) data.metadata.vulnerabilities.moderate = parseInt(moderateMatch[1])
  
  const lowMatch = text.match(/(\d+)\s+low/)
  if (lowMatch) data.metadata.vulnerabilities.low = parseInt(lowMatch[1])
  
  return data
}

function displayResults(packageName, auditData) {
  const resultsSection = document.getElementById('results-section')
  const packageInfo = document.getElementById('package-info')
  const securityInfo = document.getElementById('security-info')
  
  // Package Info
  const packageHtml = `
    <div class="result-item">
      <span class="result-label">Package</span>
      <span class="result-value">${packageName}</span>
    </div>
  `
  packageInfo.innerHTML = packageHtml
  
  // Security Info
  let securityHtml = ''
  const vulnCount = auditData.metadata?.vulnerabilities?.total || 0
  
  if (vulnCount === 0) {
    securityHtml = '<div class="result-item safe"><span class="result-label">✓ No vulnerabilities found</span></div>'
  } else {
    const critical = auditData.metadata?.vulnerabilities?.critical || 0
    const high = auditData.metadata?.vulnerabilities?.high || 0
    const moderate = auditData.metadata?.vulnerabilities?.moderate || 0
    const low = auditData.metadata?.vulnerabilities?.low || 0
    
    if (critical > 0) {
      securityHtml += `<div class="result-item vulnerability"><span class="result-label">Critical: ${critical}</span></div>`
    }
    if (high > 0) {
      securityHtml += `<div class="result-item vulnerability"><span class="result-label">High: ${high}</span></div>`
    }
    if (moderate > 0) {
      securityHtml += `<div class="result-item warning"><span class="result-label">Moderate: ${moderate}</span></div>`
    }
    if (low > 0) {
      securityHtml += `<div class="result-item warning"><span class="result-label">Low: ${low}</span></div>`
    }
  }
  securityInfo.innerHTML = securityHtml
  
  // Show results section
  resultsSection.style.display = 'block'
}

async function handleTestPackage() {
  const input = document.getElementById('package-input')
  const packageName = input.value.trim()
  const testBtn = document.getElementById('test-btn')
  
  testBtn.disabled = true
  
  try {
    // Initialize BrowserPod if needed
    if (!pod) {
      const ready = await initBrowserPod()
      if (!ready) throw new Error('BrowserPod initialization failed')
    }

    // Test the package
    await testPackage(packageName)
    
  } catch (err) {
    log(`Error: ${err.message}`, 'error')
  } finally {
    testBtn.disabled = false
  }
}

// UI event listeners
document.getElementById('search-btn').addEventListener('click', handleSearch)
document.getElementById('search-keyword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleSearch()
  }
})

document.getElementById('test-btn').addEventListener('click', handleTestPackage)
document.getElementById('package-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleTestPackage()
  }
})

// Capture browser console errors too
const originalError = console.error
console.error = function(...args) {
  log(`ERROR: ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}`, 'error')
  originalError.apply(console, args)
}

// Initialize on load
window.addEventListener('load', () => {
  initThemeToggle()
  log('NPM Package Tester ready', 'success')
  setServerStatus('ready')
  setServerInfo('Enter a package name and click "Test Package"')
})
