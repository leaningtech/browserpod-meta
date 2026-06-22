// Mirror SLOTH's runtime dependency closure into t-slide-mix/pod-modules/ so
// the Pod gets a ready node_modules without running `npm install`.
//
// Why this exists: shipping the source files first and then installing from the
// npm registry made the Pod depend on the registry at runtime. Instead we
// resolve the runtime closure here, copy it in, and main.js writes it straight
// into /project/node_modules. lodash (4.9M, used by node-emoji for one
// function) is replaced with a tiny toArray shim.
//
// Run from the t-slide-mix directory:  node scripts/build-pod-modules.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.resolve(here, '..')        // t-slide-mix
const repoRoot = path.resolve(projectDir, '..')    // the SLOTH repo
const repoModules = path.join(repoRoot, 'node_modules')
const outDir = path.join(projectDir, 'pod-modules')

const require = createRequire(pathToFileURL(path.join(repoRoot, 'noop.js')))

// SLOTH's direct runtime deps (matches package.json minus dev/unused ones).
const ROOTS = [
  'ansi-escapes', 'charm', 'colors', 'hipster',
  'insert-queue', 'keypress', 'node-emoji', 'optimist'
]

// lodash is excluded from the copy and shimmed instead.
const SHIMMED = new Set(['lodash'])

// File extensions worth shipping; everything else (docs, tests, .ts, maps) is
// skipped to keep the bundle small.
const KEEP_EXT = new Set(['.js', '.json', '.node'])
const SKIP_DIRS = new Set(['test', 'tests', '__tests__', 'docs', 'doc', '.github', 'example', 'examples', 'benchmark', 'coverage'])

function pkgDir (name, fromDir) {
  try {
    return path.dirname(require.resolve(name + '/package.json', { paths: [fromDir] }))
  } catch (e) {
    return null
  }
}

// Walk the dependency closure, recording each package's on-disk directory.
const closure = new Map() // realDir -> { name, dir }
function walk (name, fromDir) {
  if (SHIMMED.has(name)) return
  const dir = pkgDir(name, fromDir)
  if (!dir || closure.has(dir)) return
  let pj
  try {
    pj = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  } catch (e) {
    return
  }
  closure.set(dir, { name, dir })
  for (const dep of Object.keys(pj.dependencies || {})) walk(dep, dir)
}
for (const r of ROOTS) walk(r, repoRoot)

// Compute each package's path relative to repo's node_modules so nested
// node_modules (e.g. hipster/node_modules/charm) are preserved exactly.
function relUnderModules (dir) {
  const rel = path.relative(repoModules, dir)
  return rel.split(path.sep).join('/')
}

function copyPkg (srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const name = entry.name
    const src = path.join(srcDir, name)
    const dest = path.join(destDir, name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      // recurse, including nested node_modules
      copyPkg(src, dest)
    } else if (entry.isFile()) {
      const ext = path.extname(name)
      // always keep package.json; otherwise filter by extension
      if (name !== 'package.json' && !KEEP_EXT.has(ext)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    }
  }
}

// Fresh output dir.
fs.rmSync(outDir, { recursive: true, force: true })
fs.mkdirSync(outDir, { recursive: true })

let files = 0
for (const { dir } of closure.values()) {
  const rel = relUnderModules(dir)
  const dest = path.join(outDir, rel)
  copyPkg(dir, dest)
}

// Write the lodash/toArray shim node-emoji needs. lodash/toArray splits a
// string into an array of code points (emoji stay intact) and returns the
// values of arrays/objects. Array.from gives the correct Unicode split.
const lodashDir = path.join(outDir, 'lodash')
fs.mkdirSync(lodashDir, { recursive: true })
fs.writeFileSync(path.join(lodashDir, 'package.json'), JSON.stringify({
  name: 'lodash',
  version: '0.0.0-sloth-shim',
  description: 'Minimal shim: only toArray, used by node-emoji.',
  main: 'index.js'
}, null, 2) + '\n')
fs.writeFileSync(path.join(lodashDir, 'index.js'),
  "module.exports = { toArray: require('./toArray') }\n")
fs.writeFileSync(path.join(lodashDir, 'toArray.js'),
`// Minimal stand-in for lodash/toArray. node-emoji passes strings; lodash
// splits them by Unicode code point (so emoji are single elements). Array.from
// does exactly that. Arrays return a shallow copy; objects return their values.
module.exports = function toArray (value) {
  if (value == null) return []
  if (typeof value === 'string') return Array.from(value)
  if (Array.isArray(value)) return value.slice()
  if (typeof value.length === 'number') return Array.prototype.slice.call(value)
  return Object.keys(value).map(function (k) { return value[k] })
}
`)

// Count what we produced.
function countFiles (dir) {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name))
    else n++
  }
  return n
}
files = countFiles(outDir)

console.log('pod-modules built at', path.relative(repoRoot, outDir))
console.log('packages:', closure.size + 1, '(incl. lodash shim)')
console.log('files:', files)
