#!/usr/bin/env node
/**
 * Lint əvəzi: bütün .js fayllarında sintaksis yoxlaması (node --check).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', 'temp', 'sessions', 'data']);
let failed = 0;
let count = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) {
      count += 1;
      try {
        execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
      } catch (e) {
        failed += 1;
        console.error(`✖ ${path.relative(root, full)}\n${e.stderr?.toString() || e.message}`);
      }
    }
  }
}

walk(root);
console.log(`${count} fayl yoxlandı, ${failed} xəta.`);
process.exit(failed ? 1 : 0);
