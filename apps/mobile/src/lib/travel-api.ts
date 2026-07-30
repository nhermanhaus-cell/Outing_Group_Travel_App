import { supabase } from './supabase';
import { featureFlags } from './featureFlags';
import { validateTravelApiContract } from '@gayi/shared';

export class TravelApiError extends Error {
  constructor(message: string, readonly code = 'TRAVEL_API_ERROR') {
    super(message);
    this.name = 'TravelApiError';
  }
}

export interface ApiPhoto {
  name?: string;
  url?: string;
  widthPx?: number;
  heightPx?: number;
  attribution?: string;
}

export interface ApiPlace {
  providerPlaceId: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  types: string[];
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  openingHours?: unknown[];
  weekdayDescriptions?: string[];
  photos: ApiPhoto[];
  googleMapsUri?: string;
  websiteUri?: string;
  verifiedAt: string;
}

export interface ApiExperience {
  productCode: string;
  title: string;
  description?: string;
  productUrl?: string;
  images: Array<{ url: string; width?: number; height?: number }>;
  rating?: number;
  reviewCount?: number;
  priceFrom?: number;
  currency?: string;
  durationMinutes?: number;
  itinerary?: unknown;
  inclusions?: unknown;
  exclusions?: unknown;
  logistics?: unknown;
  cancellationPolicy?: unknown;
  tags?: unknown;
  provider: 'viator';
  bookingMode: 'external' | 'none';
}

export interface ApiAttributedImage {
  url: string;
  thumbnailUrl?: string;
  sourcePage: string;
  author?: string;
  authorUrl?: string;
  license?: string;
  licenseUrl?: string;
  provider?: 'pexels' | 'wikimedia_commons';
  alt?: string;
  matchType?: 'specific' | 'destination_fallback';
}
export type ApiLocationImageKind = 'activity' | 'place' | 'destination';
export interface ApiLocationImageResult {
  images: ApiAttributedImage[];
  match: 'specific' | 'destination_fallback' | 'none';
  query: string;
  source: 'pexels';
}
export interface ApiWeatherDay { date: string; weatherCode?: number; temperatureMaxC?: number; temperatureMinC?: number; precipitationProbabilityMax?: number }
export interface ApiWeather { timezone: string; currentTemperatureC?: number; currentWeatherCode?: number; daily: ApiWeatherDay[]; source: 'open_meteo'; retrievedAt: string }
export interface ApiLiveEvent { id: string; name: string; url: string; startDate?: string; startTime?: string; venueName?: string; city?: string; imageUrl?: string; genre?: string; source: 'ticketmaster' }
export interface ApiPark { id: string; name: string; description?: string; designation?: string; states?: string; url: string; imageUrl?: string; imageAttribution?: string; lat?: number; lng?: number; source: 'nps' }
export interface ApiBookingStay { id: string; name: string; url: string; imageUrls: string[]; reviewScore?: number; reviewCount?: number; price?: number; currency?: string; address?: string; travelProud?: boolean; source: 'booking_com' }
export interface ApiFlightDeal { id: string; originIata?: string; destinationIata?: string; destinationName: string; destinationCountry?: string; departureDate?: string; returnDate?: string; price: number; currency: string; direct: boolean; observedAt: string; baselinePrice?: number; savingsPercent?: number; observationCount?: number; source: 'skyscanner_indicative' }

export async function invokeTravelApi<T>(
  operation: string,
  input: Record<string, unknown>,
): Promise<T> {
  if (operation.startsWith('viator') && !featureFlags.viatorV2) throw new TravelApiError('Viator v2 is disabled');
  if (!operation.startsWith('viator') && !featureFlags.smartItineraryV2) throw new TravelApiError('Smart itinerary v2 is disabled');
  if (!supabase) throw new TravelApiError('Live travel APIs are not configured', 'NOT_CONFIGURED');
  const { data, error } = await supabase.functions.invoke('travel-api', {
    body: { operation, ...input },
  });
  if (error) throw new TravelApiError(error.message);
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new TravelApiError(data.error);
  }
  return validateTravelApiResponse<T>(operation, data);
}

export const searchCommonsImages = (query: string, limit = 5) =>
  invokeTravelApi<{ images: ApiAttributedImage[] }>('commonsImageSearch', { query, limit });

export const searchLocationImages = (input: {
  subject: string;
  destination: string;
  category?: string;
  kind: ApiLocationImageKind;
  limit?: number;
  variant?: number;
}) => invokeTravelApi<ApiLocationImageResult>('locationImageSearch', input);

export const loadWeatherForecast = (lat: number, lng: number) =>
  invokeTravelApi<{ weather: ApiWeather }>('weatherForecast', { lat, lng });

export const loadTicketmasterEvents = (lat: number, lng: number, options: { startDate?: string; endDate?: string; keyword?: string; limit?: number } = {}) =>
  invokeTravelApi<{ events: ApiLiveEvent[] }>('ticketmasterEvents', { lat, lng, ...options });

export const loadNearbyParks = (query: string, limit = 5) =>
  invokeTravelApi<{ parks: ApiPark[] }>('npsNearby', { query, limit });

export const loadBookingStays = (input: { airportIata: string; checkin: string; checkout: string; adults: number; rooms?: number; currency?: string; limit?: number }) =>
  invokeTravelApi<{ stays: ApiBookingStay[]; destinationId?: string }>('bookingStays', input);

export const loadIndicativeFlightDeals = (input: { originIata: string; destinationIata?: string; currency?: string; market?: string; locale?: string; departureMonth?: string; returnMonth?: string; limit?: number }) =>
  invokeTravelApi<{ deals: ApiFlightDeal[]; observedAt: string; indicative: true }>('skyscannerIndicative', input);

export function validateTravelApiResponse<T>(operation: string, data: unknown): T {
  try { return validateTravelApiContract<T>(operation, data); }
  catch (error) { throw new TravelApiError(error instanceof Error ? error.message : 'Invalid response', 'INVALID_RESPONSE'); }
}
