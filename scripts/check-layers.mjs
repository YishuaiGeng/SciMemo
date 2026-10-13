/**
 * Layer dependency check.
 *
 * The dependency direction in docs/ARCHITECTURE.md §1 is only real if something
 * enforces it. This script parses every import (static and dynamic) in src/ and fails
 * when an inner layer reaches outward.
 *
 * It is deliberately a source-level textual check, not a type-aware analysis: it can
 * be fooled by a computed specifier, but it cannot be fooled by a normal edit, and it
 * needs no dependency beyond what the repo already has.
 */
import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';

const LAYERS = {
  'core/types.ts':0,
  'core/errors.ts':0,
  'core/domain.ts':1,
  'core/references.ts':2,
  'core/read':2,
  'core/workspace.ts':3,
  'core/sync.ts':3,
  'core/backup.ts':3,
  'core/demo.ts':3,
  'main.tsx':4,
  'ui':4,
  'platform':5,
};

/**
 * Applications that may be driven by a layer, even though they sit outside it.
 *
 * platform is a boundary adapter, not an inner layer: ui is expected to drive it
 * (createDriver, httpTransport). What must never happen is core reaching out to it,
 * which is what the direction rule below still enforces.
 */
const ALLOWED_OUTWARD = {
  'ui':['platform'],
};

/** Packages that may only appear at or outside a given layer. */
const BANNED = [
  {layer:4,pkg:/^(react|react-dom)(\/|$)/,why:'L1–L3 是纯领域逻辑，不得依赖 React'},
  {layer:5,pkg:/^@tauri-apps\//,why:'只有 L5 platform 可以接触 Tauri IPC'},
];

const layerNames = {0:'L0 types',1:'L1 domain',2:'L2 read',3:'L3 service',4:'L4 ui/app',5:'L5 platform'};

const toPosix = (p) => p.split(path.sep).join('/');

/** Match both `import ... from 'x'` and `import('x')`, including type-only imports. */
const IMPORT_RE = /(?:^|[^.\w])(?:import|export)\s*(?:[\s\S]*?\sfrom\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function importsOf(source) {
  const found = new Set();
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (spec) found.add(spec);
  }
  return [...found];
}

function classify(absPath) {
  const rel = toPosix(path.relative('src', absPath));
  const withoutExt = rel.replace(/\.[jt]sx?$/, '');
  // Keys may carry an extension (core/types.ts); strip it before comparing so a file
  // at src/core/types.ts matches either form.
  const keys = Object.keys(LAYERS)
    .map((key) => [key.replace(/\.[jt]sx?$/, ''), LAYERS[key]])
    .sort((a, b) => b[0].length - a[0].length);
  for (const [key, layer] of keys) {
    if (withoutExt === key || withoutExt.startsWith(`${key}/`)) return {layer,key};
  }
  return null;
}

async function walk(dir) {
  const entries = await readdir(dir, {withFileTypes:true});
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.[jt]sx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

const problems = [];
let fileCount = 0;
let importCount = 0;

for (const file of await walk('src')) {
  const source = await readFile(file, 'utf8');
  const from = classify(file);
  fileCount++;
  if (!from) {
    problems.push({file,message:'文件不属于任何已知层。请在 scripts/check-layers.mjs 的 LAYERS 中登记。'});
    continue;
  }
  for (const spec of importsOf(source)) {
    importCount++;
    for (const rule of BANNED) {
      if (from.layer < rule.layer && rule.pkg.test(spec)) {
        problems.push({file,message:`${layerNames[from.layer]} 不得导入 ${spec} —— ${rule.why}`});
      }
    }
    if (!spec.startsWith('.')) continue;
    // Relative specifier: resolve to a path inside src/ and compare layers.
    const resolved = toPosix(path.normalize(path.join(path.dirname(toPosix(file)), spec)));
    const to = classify(resolved);
    if (!to) continue;
    if (to.layer <= from.layer) continue;
    const allowed = ALLOWED_OUTWARD[from.key] ?? [];
    if (allowed.includes(to.key)) continue;
    problems.push({
      file,
      message:`${layerNames[from.layer] ?? `L${from.layer} ${from.key}`} 导入了外层 ${to.key}：${spec}。依赖只能由外向内。`,
    });
  }
}

for (const {file, message} of problems) console.error(`${toPosix(file)}: ${message}`);
console.log(`Layer check: ${fileCount} files, ${importCount} imports, ${problems.length} violations.`);
if (problems.length) {
  console.error('架构分层违规。规则见 docs/ARCHITECTURE.md §1。');
  process.exit(1);
}
