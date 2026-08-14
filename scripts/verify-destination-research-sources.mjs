import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const RESEARCH_PATH = resolve(ROOT, 'fixtures/catalog/destination-editorial-research.json');
const apply = process.argv.includes('--apply');
const concurrency = 8;
const research = JSON.parse(readFileSync(RESEARCH_PATH, 'utf8'));

const urls = [...new Set(Object.values(research).flatMap((entry) =>
  (entry.sources ?? []).flatMap((source) => typeof source.url === 'string' ? [source.url] : [])))];
const results = new Map();

async function check(url) {
  let status = 0;
  let finalUrl = url;
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Outing destination editorial link checker/1.0' },
      signal: AbortSignal.timeout(8_000),
    });
    status = response.status;
    finalUrl = response.url || url;
    if (status === 405 || status === 501) {
      const fallback = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'Outing destination editorial link checker/1.0', Range: 'bytes=0-1024' },
        signal: AbortSignal.timeout(8_000),
      });
      status = fallback.status;
      finalUrl = fallback.url || finalUrl;
      await fallback.body?.cancel();
    }
    await response.body?.cancel();
    return {
      verificationStatus: status >= 200 && status < 400
        ? 'reachable'
        : [401, 403, 406, 409, 429].includes(status)
          ? 'access_restricted'
          : [404, 410].includes(status)
            ? 'broken'
            : 'unverified',
      httpStatus: status,
      finalUrl,
    };
  } catch (error) {
    return {
      verificationStatus: 'unverified',
      httpStatus: status || null,
      finalUrl,
      errorCategory: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network_error',
    };
  }
}

let next = 0;
async function worker() {
  while (next < urls.length) {
    const index = next;
    next += 1;
    const url = urls[index];
    results.set(url, await check(url));
    if ((index + 1) % 25 === 0 || index + 1 === urls.length) console.log(`Checked ${index + 1}/${urls.length} unique source URLs.`);
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const verifiedAt = new Date().toISOString();
for (const entry of Object.values(research)) {
  entry.sources = (entry.sources ?? []).map((source) => ({
    ...source,
    ...(results.get(source.url) ?? { verificationStatus: 'unverified' }),
    verifiedAt,
  }));
}

const counts = {};
for (const result of results.values()) counts[result.verificationStatus] = (counts[result.verificationStatus] ?? 0) + 1;
console.log(counts);
if (apply) {
  writeFileSync(RESEARCH_PATH, `${JSON.stringify(research, null, 2)}\n`);
  console.log('Saved source verification metadata. Broken links remain visible to editors but are excluded from generated catalog sources.');
} else {
  console.log('Dry run only. Re-run with --apply to store verification metadata.');
}
