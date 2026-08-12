import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const ROOT = process.cwd();

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function copyJsonFiles(sourceDir, targetDir) {
  ensureDir(targetDir);
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.json') continue;
    copyFileSync(resolve(sourceDir, entry.name), resolve(targetDir, entry.name));
  }
}

ensureDir(resolve(ROOT, 'apps/mobile/assets/seed'));
copyFileSync(
  resolve(ROOT, 'fixtures/seed/destinations.json'),
  resolve(ROOT, 'apps/mobile/assets/seed/destinations.json'),
);
copyFileSync(
  resolve(ROOT, 'fixtures/seed/destinations.scoring.json'),
  resolve(ROOT, 'apps/mobile/assets/seed/destinations.scoring.json'),
);
copyFileSync(
  resolve(ROOT, 'fixtures/seed/destinations.scoring.json'),
  resolve(ROOT, 'packages/providers/src/plugins/destinations/catalog-scoring.json'),
);
copyFileSync(
  resolve(ROOT, 'fixtures/seed/experiences.json'),
  resolve(ROOT, 'apps/mobile/assets/seed/experiences.json'),
);

copyJsonFiles(
  resolve(ROOT, 'fixtures/editorial'),
  resolve(ROOT, 'apps/mobile/assets/editorial'),
);
copyJsonFiles(
  resolve(ROOT, 'fixtures/public'),
  resolve(ROOT, 'apps/mobile/assets/public'),
);

console.log('Synced seed, editorial, and public JSON into apps/mobile/assets/');
