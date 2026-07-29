#!/usr/bin/env node
/**
 * Build-time indexer for destination-specific queer travel guides.
 *
 * It reads robots.txt and public sitemaps, then stores only article metadata and
 * derived tags. It does not copy article bodies or publisher images. Every
 * result remains a link to the original publisher and requires editorial review
 * before its recommendations become Outing place data.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT = resolve(ROOT, 'fixtures/editorial/travel-blog-insights.json');
const USER_AGENT = 'OutingEditorialIndexer/1.0 (+https://gayi.expo.app; metadata-only)';
const REQUEST_TIMEOUT_MS = 12_000;
const REQUEST_DELAY_MS = 300;
const MAX_SITEMAPS_PER_SOURCE = 24;
const MAX_ARTICLES_PER_SOURCE = 20;

const SOURCES = [
  { id: 'nomadic-boys', name: 'Nomadic Boys', homeUrl: 'https://nomadicboys.com/' },
  { id: 'couple-of-men', name: 'Couple of Men', homeUrl: 'https://coupleofmen.com/' },
  { id: 'what-we-gan-did-next', name: 'What We Gan Did Next', homeUrl: 'https://www.whatwegandidnext.com/' },
  { id: 'out-with-ryan', name: 'Out With Ryan', homeUrl: 'https://www.outwithryan.com/' },
  { id: 'asian-maple-leaf', name: 'Asian Maple Leaf', homeUrl: 'https://asianmapleleaf.com/' },
  { id: 'two-bad-tourists', name: 'Two Bad Tourists', homeUrl: 'https://twobadtourists.com/' },
  { id: 'mr-hudson-explores', name: 'Mr Hudson Explores', homeUrl: 'https://mrhudsonexplores.com/' },
];

const DESTINATION_ALIASES = {
  'san-francisco': ['san francisco', 'san-francisco'],
  'palm-springs': ['palm springs', 'palm-springs'],
  'puerto-vallarta': ['puerto vallarta', 'puerto-vallarta'],
  'mexico-city': ['mexico city', 'mexico-city', 'cdmx'],
  'new-york-city': ['new york city', 'new-york-city', 'new york', 'new-york', 'nyc'],
  miami: ['miami'],
  provincetown: ['provincetown', 'p-town', 'ptown'],
  montreal: ['montreal', 'montréal'],
  london: ['london'],
  berlin: ['berlin'],
  madrid: ['madrid'],
  barcelona: ['barcelona'],
  lisbon: ['lisbon', 'lisboa'],
  amsterdam: ['amsterdam'],
  tokyo: ['tokyo'],
  guerneville: ['guerneville', 'russian river'],
  'los-angeles': ['los angeles', 'los-angeles'],
  'las-vegas': ['las vegas', 'las-vegas'],
};

const SIGNAL_WORDS = {
  nightlife: ['nightlife', 'bar', 'bars', 'club', 'clubs', 'party'],
  food: ['food', 'restaurant', 'restaurants', 'dining', 'brunch', 'tapas'],
  history: ['history', 'historic', 'heritage', 'museum'],
  culture: ['culture', 'art', 'arts', 'gallery', 'galleries'],
  beach: ['beach', 'beaches', 'coast'],
  pride: ['pride', 'worldpride'],
  lodging: ['hotel', 'hotels', 'stay', 'resort', 'resorts'],
  wellness: ['wellness', 'spa', 'relax'],
  outdoors: ['hike', 'hiking', 'outdoors', 'park'],
};

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function decodeHtml(value = '') {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.1' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text: await response.text(), finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

function parseRobots(text, origin) {
  const sitemaps = [];
  const disallowed = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === 'sitemap' && value) {
      try { sitemaps.push(new URL(value, origin).toString()); } catch { /* ignore malformed entries */ }
    } else if (field === 'user-agent') {
      const normalized = value.toLowerCase();
      applies =
        value === '*' ||
        normalized.includes('outingeditorialindexer') ||
        normalized.includes('gay-ieditorialindexer');
    } else if (field === 'disallow' && applies && value) {
      disallowed.push(value);
    }
  }
  return { sitemaps, disallowed };
}

function isAllowed(url, disallowed) {
  const path = new URL(url).pathname;
  return !disallowed.some((rule) => rule === '/' || path.startsWith(rule));
}

function xmlLocations(xml) {
  return [...xml.matchAll(/<loc(?:\s[^>]*)?>([\s\S]*?)<\/loc>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter(Boolean);
}

function pageLinks(html, baseUrl) {
  return [...html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)]
    .flatMap((match) => {
      try { return [new URL(decodeHtml(match[1]), baseUrl).toString()]; } catch { return []; }
    });
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const forward = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
  return decodeHtml(forward.exec(html)?.[1] ?? reverse.exec(html)?.[1] ?? '');
}

function canonicalUrl(html, fallback) {
  const match = /<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i.exec(html)
    ?? /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*canonical[^"']*["'][^>]*>/i.exec(html);
  try { return new URL(decodeHtml(match?.[1] ?? fallback), fallback).toString(); } catch { return fallback; }
}

function inferDestinationSlugs(value) {
  const normalized = decodeURIComponent(value).toLowerCase().replace(/[-_/]+/g, ' ');
  return Object.entries(DESTINATION_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias.replace(/-/g, ' '))))
    .map(([slug]) => slug);
}

function inferSignals(value) {
  const normalized = value.toLowerCase();
  return Object.entries(SIGNAL_WORDS)
    .filter(([, words]) => words.some((word) => new RegExp(`\\b${word}\\b`, 'i').test(normalized)))
    .map(([signal]) => signal);
}

function editorialRelevance(title, signals) {
  const normalized = title.toLowerCase();
  const strongTerms = ['guide', 'gay', 'lgbtq', 'queer', 'things to do', 'where to', 'best ', 'travel', 'weekend', '48 hours', 'itinerary'];
  const weakTerms = ['pride', 'food', 'restaurant', 'bar', 'hotel', 'tour', 'trip', 'getaway'];
  return strongTerms.filter((term) => normalized.includes(term)).length * 2
    + weakTerms.filter((term) => normalized.includes(term)).length
    + Math.min(3, signals.length);
}

function extractArticle(html, pageUrl, source) {
  const title = metaContent(html, 'og:title')
    || decodeHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '');
  if (!title) return null;
  const canonical = canonicalUrl(html, pageUrl);
  const description = metaContent(html, 'description') || metaContent(html, 'og:description');
  const destinationSlugs = inferDestinationSlugs(`${canonical} ${title} ${description}`);
  if (!destinationSlugs.length) return null;
  if (
    /\b(?:archives?|fullsizerender|animated[ -]?gif|attachment)\b|^tumblr_|^[^\s]+(?:-[^\s]+){2,}$/i.test(title)
  ) return null;
  const signals = inferSignals(`${title} ${description}`);
  const publishedAt = metaContent(html, 'article:published_time');
  const modifiedAt = metaContent(html, 'article:modified_time');
  return {
    id: `${source.id}:${new URL(canonical).pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home'}`,
    sourceId: source.id,
    sourceName: source.name,
    title: title.replace(/\s+[|•-]\s+[^|•-]+$/, '').trim(),
    url: canonical,
    destinationSlugs,
    signals,
    editorialRelevance: editorialRelevance(title, signals),
    ...(publishedAt ? { publishedAt } : {}),
    ...(modifiedAt ? { modifiedAt } : {}),
    reviewStatus: 'needs_editorial_review',
  };
}

async function collectSource(source) {
  const origin = new URL(source.homeUrl).origin;
  const errors = [];
  let robots = { sitemaps: [], disallowed: [] };
  try {
    robots = parseRobots((await fetchText(`${origin}/robots.txt`)).text, origin);
  } catch (error) {
    errors.push(`robots.txt: ${error instanceof Error ? error.message : String(error)}`);
  }

  const commonSitemaps = [`${origin}/wp-sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`];
  const sitemapQueue = [...new Set([...robots.sitemaps, ...commonSitemaps])];
  const seenSitemaps = new Set();
  const candidateUrls = new Set();
  while (sitemapQueue.length && seenSitemaps.size < MAX_SITEMAPS_PER_SOURCE) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);
    try {
      const locations = xmlLocations((await fetchText(sitemapUrl)).text);
      for (const location of locations) {
        if (/\.xml(?:\.gz)?(?:\?|$)/i.test(location)) {
          if (!seenSitemaps.has(location)) sitemapQueue.push(location);
        } else if (location.startsWith(origin) && isAllowed(location, robots.disallowed)) {
          candidateUrls.add(location);
        }
      }
    } catch {
      // Common fallback sitemap URLs often 404; that is not a source failure.
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (!candidateUrls.size) {
    try {
      const home = await fetchText(source.homeUrl);
      pageLinks(home.text, home.finalUrl)
        .filter((url) => url.startsWith(origin) && isAllowed(url, robots.disallowed))
        .forEach((url) => candidateUrls.add(url));
    } catch (error) {
      errors.push(`homepage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const relevantUrls = [...candidateUrls]
    .filter((url) => inferDestinationSlugs(url).length > 0)
    .filter((url) => !/\.(?:jpg|jpeg|png|gif|webp|pdf)(?:\?|$)|\/(?:tag|category|author|attachment)\//i.test(url))
    .slice(0, MAX_ARTICLES_PER_SOURCE);
  const articles = [];
  for (const url of relevantUrls) {
    try {
      const page = await fetchText(url);
      const article = extractArticle(page.text, page.finalUrl, source);
      if (article) articles.push(article);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  return {
    source: { ...source, robotsUrl: `${origin}/robots.txt` },
    articles,
    errors,
  };
}

const seedDestinations = JSON.parse(readFileSync(resolve(ROOT, 'fixtures/seed/destinations.json'), 'utf8'));
const validSlugs = new Set(seedDestinations.map((destination) => destination.slug));
const sourceResults = [];
for (const source of SOURCES) {
  console.log(`Indexing ${source.name}…`);
  sourceResults.push(await collectSource(source));
}

const dedupedArticles = new Map();
for (const article of sourceResults.flatMap((result) => result.articles)) {
  article.destinationSlugs = article.destinationSlugs.filter((slug) => validSlugs.has(slug));
  if (article.destinationSlugs.length) dedupedArticles.set(article.url, article);
}

const output = {
  generatedAt: new Date().toISOString(),
  policy: {
    mode: 'metadata_only',
    articleBodiesStored: false,
    publisherImagesStored: false,
    recommendationsRequireReview: true,
    note: 'Links and derived tags are research inputs. Venue facts and photos must be verified with the original source and Google Places before publication.',
  },
  sources: sourceResults.map((result) => result.source),
  articles: [...dedupedArticles.values()].sort((a, b) => a.sourceName.localeCompare(b.sourceName) || a.title.localeCompare(b.title)),
  diagnostics: sourceResults.flatMap((result) => result.errors.map((message) => ({ sourceId: result.source.id, message }))),
};

writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.articles.length} attributed guide records to ${OUTPUT}`);
