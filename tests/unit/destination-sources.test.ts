import { describe, expect, it } from 'vitest';
import destinations from '../../apps/mobile/assets/seed/destinations.json';
import editorial from '../../apps/mobile/assets/editorial/travel-blog-insights.json';
import { buildTrustedDestinationSources } from '../../apps/mobile/src/lib/destinationSources';

describe('destination trusted sources', () => {
  it('excludes generic publisher homepages and global dataset landing pages', () => {
    const sources = buildTrustedDestinationSources({
      slug: 'san-francisco',
      name: 'San Francisco',
      sources: [
        { type: 'further_reading', label: 'Nomadic Boys', url: 'https://nomadicboys.com/' },
        { type: 'climate_data', label: 'Open-Meteo', url: 'https://open-meteo.com/en/docs/historical-weather-api' },
        { type: 'official_tourism', label: 'SF Travel', url: 'https://www.sftravel.com/' },
      ],
    });
    expect(sources.map((source) => source.label)).toEqual(['SF Travel']);
  });

  it('only includes editorial articles explicitly tagged to the current destination', () => {
    const sources = buildTrustedDestinationSources({ slug: 'paris', name: 'Paris' }, [
      {
        id: 'paris-guide',
        sourceName: 'Example',
        title: 'A guide to Paris',
        url: 'https://example.com/paris-guide',
        destinationSlugs: ['paris'],
        editorialRelevance: 8,
      },
      {
        id: 'rome-guide',
        sourceName: 'Example',
        title: 'A guide to Rome',
        url: 'https://example.com/rome-guide',
        destinationSlugs: ['rome'],
        editorialRelevance: 8,
      },
    ]);
    expect(sources.map((source) => source.label)).toEqual(['A guide to Paris']);
  });

  it('provides at least one destination-specific source for every published destination', () => {
    for (const destination of destinations) {
      const articles = editorial.articles.filter((article) =>
        article.destinationSlugs.includes(destination.slug));
      expect(
        buildTrustedDestinationSources(destination, articles).length,
        destination.slug,
      ).toBeGreaterThan(0);
    }
  });
});
