# PackagePod 📦

**Test npm packages instantly in your browser using BrowserPod.**

PackagePod allows you to search for, install, and analyze npm packages in a fully virtualized Node.js environment running directly in your browser. No local installation needed — everything runs safely in a sandboxed BrowserPod instance.

## How It Works

1. **BrowserPod Sandbox**: Provides an isolated Node.js environment in the browser
2. **npm Registry Integration**: Search packages from the official npm registry
3. **Package Testing**: Install packages and run npm commands in the sandbox
4. **Security Analysis**: Audit packages for vulnerabilities automatically
5. **Live Terminal**: Real-time output from npm operations

## Features

- 🔍 **Search packages** by keyword with pagination
- 📦 **Install packages** directly in the browser sandbox
- 🔒 **Security audits** showing vulnerabilities (critical, high, moderate, low)
- ️ **Live terminal** with real-time npm output
- 🌓 **Dark/Light mode** toggle
- 🏗️ **Isolated sandbox** — no system access, completely safe
- 🚀 **Zero infrastructure** — no backend servers needed

## Getting Started

### Prerequisites

- Node.js and npm
- BrowserPod API key

### Installation

```bash
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```
VITE_BP_APIKEY=your_api_key_here
```

### Development

```bash
npm run dev
```

Visit `http://localhost:5173` in your browser.

## Using PackagePod

### Search for a Package

1. Enter a keyword in the search field (e.g., "testing", "database", "utility")
2. Click "Search Packages" or press Enter
3. Browse paginated results
4. Click on a package name to auto-fill the test field

### Test a Package

1. Enter a package name in the "Package name" field (or select from search results)
2. Click "Test Package" or press Enter
3. The app will:
   - Install the package and its dependencies
   - Show the dependency tree
   - Run a security audit
   - Display all results

### View Results

After testing, two cards appear:

- **Package Info**: Name of the tested package
- **Security**: Vulnerability breakdown by severity (critical, high, moderate, low)

All npm operations are logged in the **Terminal** section above the results.

## Theme Toggle

Click the theme toggle in the top-right corner to switch between light and dark modes. Your preference is saved to local storage.

### Build

```bash
npm run build
```

## Project Structure

```
PackagePod/
├── index.html           # Main HTML structure
├── package.json         # Dependencies
├── vite.config.js       # Vite configuration
├── .env                 # Environment variables (BrowserPod API key)
└── src/
    ├── main.js          # Core application logic
    ├── ui.js            # UI utilities (theme toggle, logging)
    └── style.css        # Complete styling system
```

## Technologies

- **BrowserPod** (Leaning Technologies): Node.js sandbox in browser
- **npm Registry API**: Package search and metadata
- **Vite**: Development server with COOP/COEP headers
- **Vanilla JavaScript**: No framework dependencies
- **CSS3**: Modern styling with CSS variables for theme support

## How It Works Under the Hood

1. **Package Search**: Queries the npm registry API with pagination
2. **BrowserPod Initialization**: Creates an isolated Node.js environment on first test
3. **Package Installation**: Runs `npm install <package>` in the sandbox
4. **Dependency Analysis**: Executes `npm ls` to show the dependency tree
5. **Security Audit**: Runs `npm audit` and parses the output for vulnerability data
6. **Results Display**: Shows package info, security status, and dependency count

All operations happen within the BrowserPod sandbox — nothing is installed on your system.

## Why This Matters

PackagePod demonstrates BrowserPod's capability to run real developer tools entirely in the browser. It provides:

- **Safe exploration** of unfamiliar packages before local installation
- **Security audits** without downloading to your system
- **Zero impact** on your development environment
- **Learning tool** for understanding npm and package structures

## License

MIT

