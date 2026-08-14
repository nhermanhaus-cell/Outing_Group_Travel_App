export interface DestinationSourceInput {
  slug: string;
  name: string;
  sources?: Array<{
    type?: string;
    label?: string;
    url?: string;
    accessedAt?: string;
  }> | null;
}

export interface DestinationEditorialSource {
  id: string;
  sourceName: string;
  title: string;
  url: string;
  destinationSlugs: string[];
  editorialRelevance?: number;
  publishedAt?: string;
}

export interface TrustedDestinationSource {
  id: string;
  label: string;
  publisher?: string;
  url: string;
  category: 'official_tourism' | 'local_context' | 'official_place' | 'independent_guide';
  categoryLabel: string;
  accessedAt?: string;
}

const DESTINATION_SCOPED_TYPES = new Set([
  'official_tourism',
  'local_advocacy',
  'government',
  'transport',
  'event_organizer',
  'editorial_research',
]);

const GENERIC_REFERENCE_URLS = new Set([
  'https://www.openstreetmap.org/copyright',
  'https://open-meteo.com/',
  'https://open-meteo.com/en/docs/historical-weather-api',
  'https://database.ilga.org/en',
  'https://spartacus.gayguide.travel/gaytravelindex.pdf',
  'https://ilga.org/',
  'https://nomadicboys.com/',
  'https://www.outwithryan.com/',
  'https://twobadtourists.com/',
  'https://www.twobadtourists.com/',
  'https://mrhudsonexplores.com/',
  'https://coupleofmen.com/',
  'https://www.whatwegandidnext.com/',
  'https://asianmapleleaf.com/',
]);

const CURATED_DESTINATION_SOURCES: Record<string, TrustedDestinationSource[]> = {
  guerneville: [{
    id: 'guerneville-sonoma-county-tourism',
    label: 'Guerneville destination guide',
    publisher: 'Sonoma County Tourism',
    url: 'https://www.sonomacounty.com/cities/guerneville/',
    category: 'official_tourism',
    categoryLabel: 'Official tourism',
  }],
};

function normalizedUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function isGenericReference(value: string): boolean {
  const normalized = normalizedUrl(value);
  if (!normalized) return true;
  return [...GENERIC_REFERENCE_URLS].some((url) => normalizedUrl(url) === normalized);
}

function categoryFor(type: string): Pick<TrustedDestinationSource, 'category' | 'categoryLabel'> {
  if (type === 'official_tourism') return { category: 'official_tourism', categoryLabel: 'Official tourism' };
  if (type === 'local_advocacy') return { category: 'local_context', categoryLabel: 'Local LGBTQ+ context' };
  if (type === 'government' || type === 'transport') return { category: 'official_place', categoryLabel: 'Official local information' };
  if (type === 'event_organizer') return { category: 'official_place', categoryLabel: 'Official event source' };
  return { category: 'official_place', categoryLabel: 'Official place or organization' };
}

/**
 * Returns only links that have an explicit destination association. Generic
 * publisher homepages and global datasets are deliberately excluded here.
 */
export function buildTrustedDestinationSources(
  destination: DestinationSourceInput,
  editorialArticles: DestinationEditorialSource[] = [],
): TrustedDestinationSource[] {
  const catalogSources = (destination.sources ?? []).flatMap((source, index) => {
    const type = source.type?.trim() ?? '';
    const label = source.label?.trim();
    const url = source.url?.trim();
    if (!DESTINATION_SCOPED_TYPES.has(type) || !label || !url || isGenericReference(url)) return [];
    const normalized = normalizedUrl(url);
    if (!normalized) return [];
    return [{
      id: `catalog-${destination.slug}-${index}`,
      label,
      url: normalized,
      ...categoryFor(type),
      ...(source.accessedAt ? { accessedAt: source.accessedAt } : {}),
    }];
  });

  const articleSources = editorialArticles.flatMap((article) => {
    if (!article.destinationSlugs.includes(destination.slug) || (article.editorialRelevance ?? 0) < 4) return [];
    const normalized = normalizedUrl(article.url);
    if (!normalized || isGenericReference(normalized)) return [];
    return [{
      id: `article-${article.id}`,
      label: article.title,
      publisher: article.sourceName,
      url: normalized,
      category: 'independent_guide' as const,
      categoryLabel: 'Independent destination guide',
      ...(article.publishedAt ? { accessedAt: article.publishedAt } : {}),
    }];
  });

  const deduped = new Map<string, TrustedDestinationSource>();
  for (const source of [
    ...(CURATED_DESTINATION_SOURCES[destination.slug] ?? []),
    ...catalogSources,
    ...articleSources,
  ]) {
    const key = normalizedUrl(source.url);
    if (key && !deduped.has(key)) deduped.set(key, { ...source, url: key });
  }
  return [...deduped.values()];
}
