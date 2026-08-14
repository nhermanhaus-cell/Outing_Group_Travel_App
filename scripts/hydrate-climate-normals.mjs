import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = resolve(ROOT, 'fixtures/seed/destinations.json');
const SOURCE_URL = 'https://open-meteo.com/en/docs/historical-weather-api';
const START_DATE = process.env.CLIMATE_START_DATE ?? '2016-01-01';
const END_DATE = process.env.CLIMATE_END_DATE ?? '2025-12-31';
// Open-Meteo accepts comma-separated coordinates. Keeping the catalog in one
// request avoids hitting the public API's minute-level request limit.
const BATCH_SIZE = 60;

function round(value) {
  return Math.round(value * 10) / 10;
}

function monthlyAverages(times, values) {
  const totals = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));
  times.forEach((time, index) => {
    const value = values[index];
    const month = Number(String(time).slice(5, 7));
    if (!Number.isFinite(value) || month < 1 || month > 12) return;
    totals[month - 1].sum += value;
    totals[month - 1].count += 1;
  });
  return totals.map(({ sum, count }, index) => {
    if (!count) throw new Error(`Missing climate observations for month ${index + 1}`);
    return round(sum / count);
  });
}

async function fetchBatch(destinations) {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive');
  url.searchParams.set('latitude', destinations.map((item) => item.lat).join(','));
  url.searchParams.set('longitude', destinations.map((item) => item.lng).join(','));
  url.searchParams.set('start_date', START_DATE);
  url.searchParams.set('end_date', END_DATE);
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
  url.searchParams.set('timezone', 'GMT');
  url.searchParams.set('models', 'era5_seamless');
  const response = await fetch(url, { headers: { 'User-Agent': 'Outing catalog climate hydration' } });
  if (!response.ok) throw new Error(`Open-Meteo climate request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length !== destinations.length) throw new Error(`Expected ${destinations.length} climate rows, received ${rows.length}`);
  return rows.map((row, index) => {
    const daily = row.daily ?? {};
    if (!Array.isArray(daily.time) || !Array.isArray(daily.temperature_2m_max) || !Array.isArray(daily.temperature_2m_min)) {
      throw new Error(`Climate response for ${destinations[index].slug} is incomplete`);
    }
    return {
      slug: destinations[index].slug,
      avgHighByMonth: monthlyAverages(daily.time, daily.temperature_2m_max),
      avgLowByMonth: monthlyAverages(daily.time, daily.temperature_2m_min),
    };
  });
}

const destinations = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
const climateBySlug = new Map();
for (let start = 0; start < destinations.length; start += BATCH_SIZE) {
  const batch = destinations.slice(start, start + BATCH_SIZE);
  const climateRows = await fetchBatch(batch);
  climateRows.forEach((row) => climateBySlug.set(row.slug, row));
  console.log(`Hydrated climate normals for ${Math.min(start + BATCH_SIZE, destinations.length)}/${destinations.length} destinations`);
}

const accessedAt = new Date().toISOString().slice(0, 10);
const updated = destinations.map((destination) => {
  const climate = climateBySlug.get(destination.slug);
  if (!climate) throw new Error(`Missing climate normals for ${destination.slug}`);
  const priorSources = Array.isArray(destination.sources) ? destination.sources : [];
  const sources = [
    ...priorSources.filter((source) => source.url !== SOURCE_URL),
    {
      type: 'climate_data',
      label: `Open-Meteo ERA5 historical daily temperatures (${START_DATE.slice(0, 4)}–${END_DATE.slice(0, 4)})`,
      url: SOURCE_URL,
      accessedAt,
    },
  ];
  return {
    ...destination,
    weatherProfile: {
      avgHighByMonth: climate.avgHighByMonth,
      avgLowByMonth: climate.avgLowByMonth,
    },
    sources,
  };
});

writeFileSync(CATALOG_PATH, `${JSON.stringify(updated, null, 2)}\n`);
console.log(`Wrote sourced climate normals for ${updated.length} destinations to ${CATALOG_PATH}`);
