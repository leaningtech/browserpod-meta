import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SHIM_SUFFIX = ".shim.mjs";
const prefix = dirname(dirname(process.execPath));
const root = process.argv[2] || join(prefix, "lib", "node_modules");

function findTypebox(dir, found = []) {
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
    if (full.endsWith(join("@sinclair", "typebox"))) {
      if (existsSync(join(full, "package.json"))) found.push(full);
      continue;
    }
    findTypebox(full, found);
  }
  return found;
}

function shimSource(cjsFile, mod) {
  const names = Object.keys(mod).filter(
    (k) => /^[A-Za-z_$][\w$]*$/.test(k) && k !== "default" && !(k in globalThis),
  );
  const lines = [
    'import { createRequire } from "node:module";',
    "const require = createRequire(import.meta.url);",
    `const m = require("./${cjsFile}");`,
    "export default m;",
    ...names.map((k) => `export const ${k} = m.${k};`),
  ];
  return lines.join("\n") + "\n";
}

function patch(pkgDir) {
  const pkgPath = join(pkgDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const req = createRequire(pkgPath);
  let count = 0;
  for (const [sub, cond] of Object.entries(pkg.exports || {})) {
    const cjs = cond?.require?.default;
    if (typeof cjs !== "string" || !cjs.endsWith(".js") || !cond.import) continue;
    const cjsAbs = join(pkgDir, cjs);
    const shimRel = cjs.replace(/\.js$/, SHIM_SUFFIX);
    const shimAbs = join(pkgDir, shimRel);
    const base = cjsAbs.slice(dirname(cjsAbs).length + 1);
    writeFileSync(shimAbs, shimSource(base, req(cjsAbs)));
    cond.import.default = shimRel;
    count++;
    console.log(`  ${sub} -> ${shimRel}`);
  }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  return count;
}

const dirs = findTypebox(root);
if (dirs.length === 0) {
  console.error(`No @sinclair/typebox found under ${root}`);
  process.exit(1);
}
for (const dir of dirs) {
  console.log(`Patching ${dir}`);
  console.log(`  ${patch(dir)} entry points redirected`);
}
