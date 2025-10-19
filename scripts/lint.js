#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const defaultTargets = [
  path.join('apps', 'server', 'src'),
  path.join('apps', 'web')
];
const targets = args.length ? args : defaultTargets;

const jsFiles = [];

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (/\.(js|mjs|cjs)$/i.test(dir)) {
      jsFiles.push(dir);
    }
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    collectFiles(path.join(dir, entry));
  }
}

for (const target of targets) {
  collectFiles(target);
}

let hasError = false;

for (const file of jsFiles) {
  try {
    execSync(`node --check "${file}"`, { stdio: 'ignore' });
    const content = fs.readFileSync(file, 'utf8').split('\n');
    content.forEach((line, index) => {
      if (/\s$/.test(line)) {
        console.error(`Trailing whitespace in ${file}:${index + 1}`);
        hasError = true;
      }
    });
  } catch (error) {
    console.error(`Syntaxfehler in ${file}: ${error.message}`);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`Lint erfolgreich für ${jsFiles.length} Dateien.`);
}
