/**
 * Builds a searchable snapshot of the Vailo repo for App Code Knowledge (admin Q&A).
 * Output: functions/data/codeKnowledgeIndex.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'functions', 'data');
const OUT_FILE = path.join(OUT_DIR, 'codeKnowledgeIndex.json');

const MAX_FILES = 220;
const MAX_CHUNK_CHARS = 6000;

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.firebase',
  'coverage',
  '.cursor',
  'mcps',
]);

const ALLOW_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json']);

const PRIORITY_PREFIXES = [
  'src/App.tsx',
  'src/lib/',
  'src/pages/',
  'src/components/',
  'src/context/',
  'src/hooks/',
  'functions/index.js',
  'functions/allTrailsSync.js',
  'functions/guestPortal',
  'firebase.json',
  'README.md',
];

function shouldSkipDir(name) {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function collectFiles(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.env')) continue;
    const rel = base ? `${base}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (shouldSkipDir(ent.name)) continue;
      out.push(...collectFiles(full, rel));
      continue;
    }
    const ext = path.extname(ent.name);
    if (!ALLOW_EXT.has(ext)) continue;
    if (rel.includes('package-lock') || rel.endsWith('.d.ts')) continue;
    if (rel.startsWith('functions/data/')) continue;
    out.push(rel);
  }
  return out;
}

function priorityScore(rel) {
  const idx = PRIORITY_PREFIXES.findIndex((p) => rel === p || rel.startsWith(p));
  return idx === -1 ? 1000 + rel.length : idx;
}

function readChunk(rel) {
  const full = path.join(ROOT, rel);
  let content = fs.readFileSync(full, 'utf8');
  if (content.length > MAX_CHUNK_CHARS) {
    content = `${content.slice(0, MAX_CHUNK_CHARS)}\n/* … truncated for index (${rel}) … */`;
  }
  return content;
}

function walk() {
  const files = [
    ...collectFiles(path.join(ROOT, 'src'), 'src'),
    ...collectFiles(path.join(ROOT, 'functions'), 'functions'),
  ];
  const rootFiles = ['README.md', 'firebase.json', 'package.json'].filter((f) =>
    fs.existsSync(path.join(ROOT, f))
  );
  const all = [...new Set([...rootFiles, ...files])].sort(
    (a, b) => priorityScore(a) - priorityScore(b) || a.localeCompare(b)
  );
  return all.slice(0, MAX_FILES);
}

function main() {
  const files = walk();
  const chunks = files.map((file) => ({
    file,
    content: readChunk(file),
  }));

  const payload = {
    builtAt: new Date().toISOString(),
    fileCount: chunks.length,
    chunks,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  console.log(`codeKnowledgeIndex: ${chunks.length} files → ${OUT_FILE}`);
}

main();
