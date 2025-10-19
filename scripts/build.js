#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
const repoRoot = path.join(__dirname, '..');
if (target) {
  console.log(`Prüfe Build-Artefakte für ${target} ...`);
}

function ensureFile(relativePath) {
  const absolute = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Erwartete Datei fehlt: ${relativePath}`);
  }
}

// Build script ensures that the static frontend assets exist so the server can
// deliver them. Additional build steps can be added later without changing the
// CLI interface.
ensureFile(path.join('apps', 'web', 'index.html'));
ensureFile(path.join('apps', 'web', 'main.js'));
console.log('Buildprüfung erfolgreich.');
