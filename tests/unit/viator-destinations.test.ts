import { describe, expect, it } from 'vitest';
import {
  normalizeViatorTaxonomy,
  resolveViatorDestination,
  type ViatorDestinationTaxonomyItem,
} from '../../supabase/functions/_shared/viator-destinations';

const taxonomy: ViatorDestinationTaxonomyItem[] = [
  { destinationId: '1', name: 'North America', type: 'REGION' },
  { destinationId: '2', name: 'United States', type: 'COUNTRY', parentDestinationId: '1', lookupId: '1.2' },
  { destinationId: '3', name: 'Washington', type: 'CITY', parentDestinationId: '2', lookupId: '1.2.3', center: { latitude: 38.9072, longitude: -77.0369 } },
  { destinationId: '4', name: 'Washington', type: 'STATE', parentDestinationId: '2', lookupId: '1.2.4', center: { latitude: 47.4, longitude: -120.7 } },
  { destinationId: '5', name: 'Indonesia', type: 'COUNTRY' },
  { destinationId: '6', name: 'Bali', type: 'ISLAND', parentDestinationId: '5', lookupId: '5.6', center: { latitude: -8.34, longitude: 115.09 } },
  { destinationId: '7', name: 'London', type: 'CITY', center: { latitude: 51.5072, longitude: -0.1276 } },
];

describe('Viator destination resolution', () => {
  it('normalizes the partner taxonomy response', () => {
    expect(normalizeViatorTaxonomy({
      destinations: [{ destinationId: 901, name: 'Buenos Aires', type: 'CITY', center: { latitude: -34.6, longitude: -58.37 } }],
    })).toEqual([expect.objectContaining({ destinationId: '901', name: 'Buenos Aires' })]);
  });

  it('uses city coordinates and type to disambiguate Washington, DC from Washington state', () => {
    expect(resolveViatorDestination({
      name: 'Washington, DC',
      country: 'United States',
      lat: 38.9072,
      lng: -77.0369,
      destinationType: 'city',
    }, taxonomy)?.destinationId).toBe('3');
  });

  it('resolves island destinations with accented and catalog-safe identity data', () => {
    expect(resolveViatorDestination({
      name: 'Bali',
      country: 'Indonesia',
      lat: -8.3405,
      lng: 115.092,
      destinationType: 'island',
    }, taxonomy)).toEqual(expect.objectContaining({ destinationId: '6', type: 'ISLAND' }));
  });

  it('does not return a same-name result in a geographically incompatible place', () => {
    expect(resolveViatorDestination({
      name: 'London',
      country: 'Canada',
      lat: 42.9849,
      lng: -81.2453,
      destinationType: 'city',
    }, taxonomy)).toBeNull();
  });
});
