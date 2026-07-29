import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"' && quoted && input[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = '';
    } else value += char;
  }
  return rows;
}

const response = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'Outing airport data sync/1.0' } });
if (!response.ok) throw new Error(`OurAirports returned HTTP ${response.status}`);
const rows = parseCsv(await response.text());
const headers = rows.shift();
const column = Object.fromEntries(headers.map((name, index) => [name, index]));
const airports = rows.flatMap((row) => {
  const iata = row[column.iata_code]?.trim().toUpperCase();
  const lat = Number(row[column.latitude_deg]);
  const lng = Number(row[column.longitude_deg]);
  const type = row[column.type];
  if (!iata || iata === '0' || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  if (row[column.scheduled_service] !== 'yes' || !['large_airport', 'medium_airport', 'small_airport'].includes(type)) return [];
  return [{ iata, name: row[column.name]?.trim() || iata, city: row[column.municipality]?.trim() || row[column.name]?.trim() || iata, countryCode: row[column.iso_country]?.trim().toUpperCase() || 'XX', lat, lng }];
}).sort((a, b) => a.iata.localeCompare(b.iata));

const root = resolve(import.meta.dirname, '..');
const payload = `${JSON.stringify({ source: 'OurAirports', sourceUrl: SOURCE_URL, license: 'Public domain', retrievedAt: new Date().toISOString(), airports }, null, 2)}\n`;
for (const target of ['fixtures/public/airports.json', 'apps/mobile/assets/public/airports.json']) {
  const path = resolve(root, target);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, payload);
}
console.log(`Synced ${airports.length} scheduled-service airports from OurAirports.`);
