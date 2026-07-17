import { defineProviderPlugin } from '../../registry.js';
import type { PlacesReq, PlacesRes } from '../../interfaces.js';
import type { Place } from '@gayi/shared';

const SEED: Place[] = [
  {
    placeId: 'bcn-arena',
    name: 'Arena Classic',
    category: 'club',
    coords: { lat: 41.3887, lng: 2.1596 },
    durationMinutes: 240,
    estimatedCostPerPerson: 20,
    bookingRequired: false,
    interests: ['nightlife', 'lgbtq_venues', 'music'],
    lgbtqRelevance: 'Iconic gay club in the heart of the Gayxample.',
    source: 'mock-seed',
  },
  {
    placeId: 'bcn-zelig',
    name: 'Zelig Bar',
    category: 'bar',
    coords: { lat: 41.3845, lng: 2.1631 },
    durationMinutes: 90,
    estimatedCostPerPerson: 15,
    bookingRequired: false,
    interests: ['nightlife', 'lgbtq_venues'],
    lgbtqRelevance: 'Popular lesbian bar in Eixample.',
    source: 'mock-seed',
  },
  {
    placeId: 'ams-reguliers',
    name: 'Café de Jaren',
    category: 'cafe',
    coords: { lat: 52.3687, lng: 4.8962 },
    durationMinutes: 60,
    estimatedCostPerPerson: 12,
    bookingRequired: false,
    interests: ['food', 'culture'],
    source: 'mock-seed',
  },
  {
    placeId: 'ams-club-church',
    name: 'Club Church',
    category: 'club',
    coords: { lat: 52.361, lng: 4.892 },
    durationMinutes: 300,
    estimatedCostPerPerson: 15,
    bookingRequired: false,
    interests: ['nightlife', 'lgbtq_venues'],
    lgbtqRelevance: 'Amsterdam\'s longest-running gay leather/fetish club.',
    source: 'mock-seed',
  },
];

export const placesMockSeed = defineProviderPlugin<PlacesReq, PlacesRes>({
  id: 'places:mock-seed',
  slot: 'places',
  label: 'Mock Seed Places',
  description: 'In-memory seed places for development and testing.',
  isMock: true,
  create() {
    return {
      async call(req) {
        let results = SEED.filter((p) => {
          if (req.destinationSlug === 'barcelona-es') return p.placeId.startsWith('bcn-');
          if (req.destinationSlug === 'amsterdam-nl') return p.placeId.startsWith('ams-');
          return false;
        });
        if (req.categories?.length) {
          results = results.filter((p) => req.categories!.includes(p.category));
        }
        if (req.searchQuery) {
          const q = req.searchQuery.toLowerCase();
          results = results.filter((p) => p.name.toLowerCase().includes(q));
        }
        return { places: req.limit != null ? results.slice(0, req.limit) : results };
      },
    };
  },
  async healthCheck() {
    return true;
  },
});
