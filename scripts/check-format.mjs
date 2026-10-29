#!/usr/bin/env node
/**
 * Basic repository formatting guard.
 *
 * Deliberately dependency-free: it must be able to run in CI right after
 * `actions/checkout`, before `npm ci`, and it must never rewrite files.
 * It only reports; developers fix the issues by hand or with their editor.
 *
 * Rules:
 *   trailing-whitespace  no line may end with spaces or tabs
 *   tab-indent          code files indent with spaces only
 *   final-newline       every text file ends with a newline
 *   mixed-line-endings  a file uses CRLF or LF, never both
 *   conflict-marker     no leftover merge conflict markers
 *   json-parse          *.json must be valid JSON
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const MAX_REPORTED = 100;

const SKIP_DIRS = new Set([".git", ".workbuddy", "artifacts", "coverage", "dist", "node_modules"]);
const BINARY_EXT = new Set([
  ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".pdf", ".png", ".webp", ".woff", ".woff2", ".zip",
]);
const CODE_EXT = new Set([".cjs", ".css", ".html", ".js", ".json", ".jsx", ".mjs", ".sol", ".yaml", ".yml"]);
const TEXT_EXT = new Set([...CODE_EXT, ".md", ".txt"]);
/** Files without a useful extension. */
const TEXT_NAMES = new Set([".env.example", ".gitattributes", ".gitignore"]);

const problems = [];
const report = (file, line, rule, message) => problems.push({ file, line, rule, message });

async function collect(dir, found = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await collect(full, found);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (BINARY_EXT.has(ext)) continue;
    if (!TEXT_EXT.has(ext) && !TEXT_NAMES.has(entry.name)) continue;
    found.push(full);
  }
  return found;
}

async function checkFile(file) {
  const rel = relative(ROOT, file).split("\\").join("/");
  const buffer = await readFile(file);
  if (buffer.includes(0)) return; // binary payload with a text extension

  const text = buffer.toString("utf8");
  const ext = extname(file).toLowerCase();
  const codeLike = CODE_EXT.has(ext);

  const lines = text.split(/\r?\n/);
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const newlines = (text.match(/\n/g) ?? []).length;
  if (crlf > 0 && crlf !== newlines) {
    report(rel, 0, "mixed-line-endings", `${crlf} of ${newlines} line breaks use CRLF`);
  }

  lines.forEach((line, index) => {
    const number = index + 1;
    if (/[ \t]+$/.test(line)) report(rel, number, "trailing-whitespace", "line ends with whitespace");
    if (codeLike && /^\t/.test(line)) report(rel, number, "tab-indent", "code line starts with a tab");
  });

  if (text.length > 0 && !text.endsWith("\n")) {
    report(rel, lines.length, "final-newline", "file does not end with a newline");
  }

  if (/^<{7}(\s|$)/m.test(text) || /^>{7}(\s|$)/m.test(text)) {
    report(rel, 0, "conflict-marker", "leftover merge conflict marker");
  }

  if (ext === ".json") {
    try {
      JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch (error) {
      report(rel, 0, "json-parse", error.message);
    }
  }
}

const files = await collect(ROOT);
await Promise.all(files.map(checkFile));

if (problems.length === 0) {
  console.log(`Format check passed: ${files.length} text files scanned, 0 problems.`);
  process.exit(0);
}

problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule));
for (const problem of problems.slice(0, MAX_REPORTED)) {
  console.log(`${problem.file}:${problem.line}  ${problem.rule}  ${problem.message}`);
}
if (problems.length > MAX_REPORTED) {
  console.log(`... and ${problems.length - MAX_REPORTED} more problem(s)`);
}

const affected = new Set(problems.map((problem) => problem.file)).size;
console.log(`\nFormat check failed: ${problems.length} problem(s) in ${affected} of ${files.length} files.`);
console.log("Fix the issues above: trim trailing whitespace, indent with spaces, end files with a newline,");
console.log("keep one line ending per file, remove conflict markers, make *.json parseable.");
process.exit(1);
