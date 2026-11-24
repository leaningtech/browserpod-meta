import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const prefix = dirname(dirname(process.execPath));
const root = process.argv[2] || join(prefix, "lib", "node_modules");
const PKG = "pi-coding-agent";

const ABORT_FROM = `                const onAbort = () => {
                    if (child.pid)
                        killProcessTree(child.pid);
                };`;
const ABORT_TO = `                /* browserpod-abort-fix */
                const forceExit = () => setTimeout(() => {
                    child.stdout?.destroy();
                    child.stderr?.destroy();
                    child.emit("exit", null, "SIGKILL");
                }, 500);
                const onAbort = () => {
                    if (child.pid)
                        killProcessTree(child.pid);
                    forceExit();
                };`;
const TIMEOUT_FROM = `                        timedOut = true;
                        if (child.pid)
                            killProcessTree(child.pid);`;
const TIMEOUT_TO = `${TIMEOUT_FROM}
                        forceExit();`;

// cd carries over between calls
const IMPORT_FROM = `import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from "./truncate.js";`;
const IMPORT_TO = `${IMPORT_FROM}
/* pipod-shared-cwd */
import { readFileSync as readCwdFile } from "node:fs";
import { currentCwd, setSharedCwd } from "./path-utils.js";
const CWD_FILE = join(tmpdir(), \`pi-cwd-\${process.pid}\`);
function recordCwd() {
    try {
        const dir = readCwdFile(CWD_FILE, "utf-8").trim();
        if (dir && existsSync(dir))
            setSharedCwd(dir);
    }
    catch { }
}`;
const SPAWN_FROM = `            const spawnContext = resolveSpawnContext(resolvedCommand, cwd, spawnHook);`;
const SPAWN_TO = `            const wrappedCommand = \`\${resolvedCommand}\\n__pipod_ec=$?; pwd > '\${CWD_FILE}' 2>/dev/null; exit $__pipod_ec\`;
            const spawnContext = resolveSpawnContext(wrappedCommand, currentCwd(cwd), spawnHook);`;
const THEN_FROM = `                    .then(({ exitCode }) => {
                    // Combine the rolling buffer chunks.`;
const THEN_TO = `                    .then(({ exitCode }) => {
                    recordCwd();
                    // Combine the rolling buffer chunks.`;
const CATCH_FROM = `                    .catch((err) => {
                    // Close temp file stream and include buffered output in the error message.`;
const CATCH_TO = `                    .catch((err) => {
                    recordCwd();
                    // Close temp file stream and include buffered output in the error message.`;

const RESOLVE_FROM = `    return resolvePath(cwd, expanded);`;
const RESOLVE_TO = `    return resolvePath(currentCwd(cwd), expanded);`;
const SHARED_CWD = `
/* pipod-shared-cwd */
let sharedDir;
export function setSharedCwd(dir) {
    sharedDir = dir;
    try {
        process.chdir(dir);
    }
    catch { }
}
export function currentCwd(cwd) {
    if (sharedDir && !fileExists(sharedDir))
        setSharedCwd(cwd);
    return sharedDir ?? cwd;
}
`;

const PATCHES = [
  {
    file: join("dist", "core", "tools", "bash.js"),
    edits: [
      ["/* browserpod-abort-fix */", ABORT_FROM, ABORT_TO],
      ["/* browserpod-abort-fix */", TIMEOUT_FROM, TIMEOUT_TO],
      ["/* pipod-shared-cwd */", IMPORT_FROM, IMPORT_TO],
      ["/* pipod-shared-cwd */", SPAWN_FROM, SPAWN_TO],
      ["/* pipod-shared-cwd */", THEN_FROM, THEN_TO],
      ["/* pipod-shared-cwd */", CATCH_FROM, CATCH_TO],
    ],
  },
  {
    file: join("dist", "core", "tools", "path-utils.js"),
    edits: [["/* pipod-shared-cwd */", RESOLVE_FROM, RESOLVE_TO]],
    append: SHARED_CWD,
  },
];

function findPackages(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;
    if (name === PKG) {
      found.push(full);
      continue;
    }
    findPackages(full, found);
  }
  return found;
}

function countOf(src, text) {
  return src.split(text).length - 1;
}

const packages = findPackages(root);
if (packages.length === 0) {
  console.error(`No ${PKG} found under ${root}`);
  process.exit(1);
}
let failed = false;
for (const pkg of packages) {
  for (const patch of PATCHES) {
    const file = join(pkg, patch.file);
    let src = readFileSync(file, "utf-8");
    const original = src;
    if (patch.edits.every(([marker]) => original.includes(marker))) {
      console.log(`Already patched ${file}`);
      continue;
    }
    const bad = patch.edits.find(([, from]) => countOf(original, from) !== 1);
    if (bad) {
      console.error(`Unexpected code in ${file}, not patched:\n${bad[1]}`);
      failed = true;
      continue;
    }
    for (const [, from, to] of patch.edits) src = src.replace(from, () => to);
    if (patch.append) src += patch.append;
    writeFileSync(file, src);
    console.log(`Patched ${file}`);
  }
}
if (failed) process.exit(1);
