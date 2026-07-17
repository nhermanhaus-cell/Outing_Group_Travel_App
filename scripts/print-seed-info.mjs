import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.cwd(), 'fixtures/seed/destinations.json');
const destinations = JSON.parse(readFileSync(file, 'utf8'));
console.log(`Gay-i seed: ${destinations.length} destinations ready at fixtures/seed/destinations.json`);
console.log('Scoring companion: fixtures/seed/destinations.scoring.json');
console.log('App also bundles copies under apps/mobile/assets/seed/');
