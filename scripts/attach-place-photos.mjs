#!/usr/bin/env node
/**
 * Attach Unsplash landscape/landmark imageUrls to every seed place.
 * Uses curated photo IDs (no Unsplash API key). Attribution: Unsplash.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DEST_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');

function unsplash(id, w = 1200) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;
}

/** Curated pools by destination slug — landscapes + famous landmarks */
const GALLERIES = {
  'san-francisco': [
    unsplash('photo-1501594907352-04cda38ebc29'),
    unsplash('photo-1506146332389-18140dc7b2fb'),
    unsplash('photo-1521747116042-5a810fda9664'),
    unsplash('photo-1534050359320-81551a3eb7bb'),
  ],
  'palm-springs': [
    unsplash('photo-1518638150340-3dde83fc43b4'),
    unsplash('photo-1506905925346-21bda4d32df4'),
    unsplash('photo-1469854523086-cc02fe5d8800'),
  ],
  'puerto-vallarta': [
    unsplash('photo-1519046904884-53103b34b206'),
    unsplash('photo-1555881400-74d7eac42d06'),
    unsplash('photo-1507525428034-b723cf961d3e'),
  ],
  'mexico-city': [
    unsplash('photo-1518659526054-83363d59083b'),
    unsplash('photo-1585464231875-d9ef1f5ad396'),
    unsplash('photo-1518105779142-d975f22dec7d'),
  ],
  'new-york-city': [
    unsplash('photo-1496442226666-8d4d0e62e6e9'),
    unsplash('photo-1496588152823-86ff7695e68f'),
    unsplash('photo-1534430480872-3498386e7856'),
  ],
  miami: [
    unsplash('photo-1533106497176-dc7950421224'),
    unsplash('photo-1514214240173-6b9a4d66c1c6'),
    unsplash('photo-1507525428034-b723cf961d3e'),
  ],
  provincetown: [
    unsplash('photo-1507525428034-b723cf961d3e'),
    unsplash('photo-1500375592092-40eb2168fd21'),
    unsplash('photo-1469474968028-56623f02e42e'),
  ],
  montreal: [
    unsplash('photo-1519178614-68673b201f36'),
    unsplash('photo-1514924013411-cbf25faa35bb'),
    unsplash('photo-1555881400-74d7eac42d06'),
  ],
  london: [
    unsplash('photo-1513635269975-59663e0ac1ad'),
    unsplash('photo-1520986606214-8b456906c813'),
    unsplash('photo-1486290263857-0075e2e8e3b1'),
  ],
  berlin: [
    unsplash('photo-1560969184-10fe8719e047'),
    unsplash('photo-1528722325934-5c0f0d4f0c1c'),
    unsplash('photo-1599946347377-303664c627d4'),
  ],
  madrid: [
    unsplash('photo-1539037116277-4db20889f2d4'),
    unsplash('photo-1558642452-9d2a7deb7f62'),
    unsplash('photo-1555881400-74d7eac42d06'),
  ],
  barcelona: [
    unsplash('photo-1583422409516-2895a77efded'),
    unsplash('photo-1562883676-8c7feb83f09b'),
    unsplash('photo-1523531294919-4bcd7c65e216'),
  ],
  lisbon: [
    unsplash('photo-1555881404645-edf925303269'),
    unsplash('photo-1555881400-74d7eac42d06'),
    unsplash('photo-1513735492246-483525079872'),
  ],
  amsterdam: [
    unsplash('photo-1534351590666-13e3c96a0842'),
    unsplash('photo-1576924542622-772281b13aa8'),
    unsplash('photo-1584005903727-9f8e0e6f6b1d'),
  ],
  tokyo: [
    unsplash('photo-1540959733332-eab4deabeeaf'),
    unsplash('photo-1503899036084-c55cdd92da26'),
    unsplash('photo-1542051841857-5f90071e7989'),
  ],
  guerneville: [
    unsplash('photo-1448375240586-882707db888b'),
    unsplash('photo-1441974231531-c6227db76b6e'),
    unsplash('photo-1500534314209-a25ddb2bd429'),
  ],
  'los-angeles': [
    unsplash('photo-1500530855697-b586d89ba3ee'),
    unsplash('photo-1534190239940-9ccc78532e7b'),
    unsplash('photo-1515896769750-31548aa180ed'),
  ],
  'las-vegas': [
    unsplash('photo-1500534314209-a25ddb2bd429'),
    unsplash('photo-1581351721010-8cf859cb14cb'),
    unsplash('photo-1605833556294-ea5c7a74f57d'),
  ],
};

const FALLBACK = [
  unsplash('photo-1488646953014-85cb44e25828'),
  unsplash('photo-1469854523086-cc02fe5d8800'),
  unsplash('photo-1476514525535-07fb3b4ae5f1'),
];

const destinations = JSON.parse(readFileSync(DEST_PATH, 'utf8'));
let updated = 0;

for (const dest of destinations) {
  const pool = GALLERIES[dest.slug] ?? FALLBACK;
  dest.galleryImageUrls = pool;
  const places = dest.places ?? [];
  places.forEach((place, i) => {
    const a = pool[i % pool.length];
    const b = pool[(i + 1) % pool.length];
    const c = pool[(i + 2) % pool.length];
    place.imageUrls = [a, b, c].filter(Boolean);
    place.imageUrl = a;
    place.imageAttribution = 'Photo via Unsplash';
    updated += 1;
  });
}

writeFileSync(DEST_PATH, `${JSON.stringify(destinations, null, 2)}\n`);
console.log(`Attached imageUrls to ${updated} places across ${destinations.length} destinations`);
