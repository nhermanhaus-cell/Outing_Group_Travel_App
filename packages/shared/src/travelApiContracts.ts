import { z } from 'zod';

const photo = z.object({ name: z.string().optional(), url: z.string().url().optional(), widthPx: z.number().optional(), heightPx: z.number().optional(), attribution: z.string().optional() });
const place = z.object({
  providerPlaceId: z.string(), name: z.string(), address: z.string().optional(), lat: z.number(), lng: z.number(), types: z.array(z.string()),
  rating: z.number().optional(), reviewCount: z.number().optional(), priceLevel: z.string().optional(), businessStatus: z.string().optional(),
  openingHours: z.array(z.unknown()).optional(), weekdayDescriptions: z.array(z.string()).optional(), photos: z.array(photo),
  googleMapsUri: z.string().optional(), websiteUri: z.string().optional(), verifiedAt: z.string(),
});
const experience = z.object({
  productCode: z.string(), title: z.string(), description: z.string().optional(), productUrl: z.string().url().optional(),
  images: z.array(z.object({ url: z.string().url(), width: z.number().optional(), height: z.number().optional() })),
  rating: z.number().optional(), reviewCount: z.number().optional(), priceFrom: z.number().optional(), currency: z.string().optional(), durationMinutes: z.number().optional(),
  itinerary: z.unknown().optional(), inclusions: z.unknown().optional(), exclusions: z.unknown().optional(), logistics: z.unknown().optional(),
  cancellationPolicy: z.unknown().optional(), tags: z.unknown().optional(), provider: z.literal('viator'), bookingMode: z.enum(['external', 'none']),
});

const attributedImage = z.object({
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  sourcePage: z.string().url(),
  author: z.string().optional(),
  license: z.string().optional(),
  licenseUrl: z.string().url().optional(),
});

const weather = z.object({
  timezone: z.string(),
  currentTemperatureC: z.number().optional(),
  currentWeatherCode: z.number().optional(),
  daily: z.array(z.object({
    date: z.string(),
    weatherCode: z.number().optional(),
    temperatureMaxC: z.number().optional(),
    temperatureMinC: z.number().optional(),
    precipitationProbabilityMax: z.number().optional(),
  })),
  source: z.literal('open_meteo'),
  retrievedAt: z.string(),
});

const liveEvent = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  startDate: z.string().optional(),
  startTime: z.string().optional(),
  venueName: z.string().optional(),
  city: z.string().optional(),
  imageUrl: z.string().url().optional(),
  genre: z.string().optional(),
  source: z.literal('ticketmaster'),
});

const park = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  designation: z.string().optional(),
  states: z.string().optional(),
  url: z.string().url(),
  imageUrl: z.string().url().optional(),
  imageAttribution: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  source: z.literal('nps'),
});

const bookingStay = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  imageUrls: z.array(z.string().url()),
  reviewScore: z.number().optional(),
  reviewCount: z.number().optional(),
  price: z.number().optional(),
  currency: z.string().optional(),
  address: z.string().optional(),
  travelProud: z.boolean().optional(),
  source: z.literal('booking_com'),
});

const flightDeal = z.object({
  id: z.string(),
  originIata: z.string().optional(),
  destinationIata: z.string().optional(),
  destinationName: z.string(),
  destinationCountry: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  price: z.number(),
  currency: z.string(),
  direct: z.boolean(),
  observedAt: z.string(),
  baselinePrice: z.number().optional(),
  savingsPercent: z.number().optional(),
  observationCount: z.number().int().nonnegative().optional(),
  source: z.literal('skyscanner_indicative'),
});

const schemas: Record<string, z.ZodTypeAny> = {
  placeSearch: z.object({ places: z.array(place) }), placeTextSearch: z.object({ places: z.array(place) }), placeDetails: z.object({ place: place.nullable() }),
  geocode: z.object({ result: z.object({ formattedAddress: z.string().optional(), lat: z.number(), lng: z.number() }).nullable() }),
  routeMatrix: z.object({ elements: z.array(z.unknown()) }), route: z.object({ routes: z.array(z.unknown()) }),
  viatorSearch: z.object({ products: z.array(experience) }), viatorProduct: z.object({ product: experience.nullable() }), viatorSchedule: z.object({ schedule: z.unknown() }),
  commonsImageSearch: z.object({ images: z.array(attributedImage) }),
  weatherForecast: z.object({ weather }),
  ticketmasterEvents: z.object({ events: z.array(liveEvent) }),
  npsNearby: z.object({ parks: z.array(park) }),
  bookingStays: z.object({ stays: z.array(bookingStay), destinationId: z.string().optional() }),
  skyscannerIndicative: z.object({ deals: z.array(flightDeal), observedAt: z.string(), indicative: z.literal(true) }),
};

export function validateTravelApiContract<T>(operation: string, data: unknown): T {
  const schema = schemas[operation];
  if (!schema) throw new Error(`Unsupported travel operation: ${operation}`);
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('Travel provider returned a malformed response');
  return parsed.data as T;
}
