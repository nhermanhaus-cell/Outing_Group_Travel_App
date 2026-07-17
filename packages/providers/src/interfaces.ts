import type { Destination, Place, PlaceCategory, Trip } from '@gayi/shared';

// ── destinations ──────────────────────────────────────────────────────────────

export type { Destination };

export interface DestinationsReq {
  slugs?: string[];
  limit?: number;
  filter?: {
    legalStatuses?: string[];
    minSafetyScore?: number;
    continentCode?: string;
  };
}
export interface DestinationsRes {
  destinations: Destination[];
}

// ── places ────────────────────────────────────────────────────────────────────

export type { Place, PlaceCategory };

export interface PlacesReq {
  destinationSlug: string;
  categories?: PlaceCategory[];
  limit?: number;
  searchQuery?: string;
  /** When set, Nearby Search ranks around lodging coords */
  lodging?: { lat: number; lng: number };
}
export interface PlacesRes {
  places: Place[];
}

// ── events ────────────────────────────────────────────────────────────────────

export interface LocalEvent {
  eventId: string;
  name: string;
  destinationSlug: string;
  startDate: string;
  endDate?: string;
  type: 'pride' | 'festival' | 'conference' | 'party' | 'club_night' | 'other';
  venue?: string;
  ticketUrl?: string;
  priceRange?: { min: number; max: number; currency: string };
  lgbtqFocused: boolean;
}
export interface EventsReq {
  destinationSlug: string;
  months?: number[];
  limit?: number;
}
export interface EventsRes {
  events: LocalEvent[];
}

// ── experiences ───────────────────────────────────────────────────────────────

export interface Experience {
  id: string;
  destinationSlug: string;
  title: string;
  summary: string;
  imageUrls: string[];
  durationHours?: number;
  priceFrom?: number;
  currency?: string;
  tags: string[];
  lgbtqRelevance?: string;
  lat?: number;
  lng?: number;
  provider: 'editorial' | 'viator' | 'getyourguide';
  affiliateUrl?: string;
  bookingMode: 'none' | 'external';
}
export interface ExperiencesReq {
  destinationSlug: string;
  limit?: number;
}
export interface ExperiencesRes {
  experiences: Experience[];
}

// ── lgbtqContext ──────────────────────────────────────────────────────────────

export interface LgbtqContext {
  destinationSlug: string;
  editorialSummary: string;
  safetyTips: string[];
  neighborhoodsToKnow: string[];
  annualHighlights: string[];
  communityNotes: string;
  lastReviewed: string;
}
export interface LgbtqContextReq {
  destinationSlug: string;
}
export interface LgbtqContextRes {
  context: LgbtqContext;
}

// ── communitySignals ──────────────────────────────────────────────────────────

export interface CommunitySignals {
  destinationSlug: string;
  activeUserCount: number;
  recentCheckins: number;
  popularPlaceIds: string[];
  trendingEventIds: string[];
  lastUpdated: string;
}
export interface CommunitySignalsReq {
  destinationSlug: string;
}
export interface CommunitySignalsRes {
  signals: CommunitySignals;
}

// ── weather ───────────────────────────────────────────────────────────────────

export interface WeatherData {
  destinationSlug: string;
  month: number;
  avgHighC: number;
  avgLowC: number;
  avgRainyDays: number;
  description: string;
  uvIndex: number;
}
export interface WeatherReq {
  destinationSlug: string;
  month: number;
}
export interface WeatherRes {
  weather: WeatherData;
}

// ── flights ───────────────────────────────────────────────────────────────────

export interface FlightBand {
  label: string;
  minUsd: number;
  maxUsd: number;
  typicalDurationHours: number;
  airlines: string[];
  stopCount: number;
}
export interface FlightsReq {
  originIata: string;
  destinationSlug: string;
  departDate: string;
  returnDate?: string;
  adults?: number;
}
export interface FlightsRes {
  bands: FlightBand[];
}

// ── lodging ───────────────────────────────────────────────────────────────────

export interface LodgingBand {
  label: string;
  minUsdPerNight: number;
  maxUsdPerNight: number;
  exampleProperties: string[];
  lgbtqWelcoming: boolean;
}
export interface LodgingReq {
  destinationSlug: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
}
export interface LodgingRes {
  bands: LodgingBand[];
}

// ── currency ──────────────────────────────────────────────────────────────────

export interface CurrencyReq {
  from: string;
  to: string;
  amount?: number;
}
export interface CurrencyRes {
  rate: number;
  convertedAmount?: number;
  from: string;
  to: string;
  updatedAt: string;
}

// ── maps ──────────────────────────────────────────────────────────────────────

export interface MapMarker {
  lat: number;
  lng: number;
  label?: string;
}
export interface MapsReq {
  coords: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
}
export interface MapsRes {
  mapUri: string;
}

// ── trips ─────────────────────────────────────────────────────────────────────

export type { Trip };

export type TripsReq =
  | { action: 'get'; userId: string; tripId?: string }
  | { action: 'save'; trip: Trip }
  | { action: 'delete'; tripId: string; userId: string };

export type TripsRes =
  | { action: 'get'; trips: Trip[] }
  | { action: 'save'; trip: Trip }
  | { action: 'delete'; success: boolean };

// ── auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  userId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

export type AuthReq =
  | { action: 'signIn'; email: string; password: string }
  | { action: 'signInWithProvider'; provider: 'google' | 'apple' | 'facebook' }
  | { action: 'signOut' }
  | { action: 'getSession' };

export type AuthRes =
  | {
      action: 'signIn' | 'signInWithProvider' | 'getSession';
      user: AuthUser | null;
      token?: string;
    }
  | { action: 'signOut'; success: boolean };

// ── ai ────────────────────────────────────────────────────────────────────────

export interface AiReq {
  prompt: string;
  systemPrompt?: string;
  context?: Record<string, unknown>;
  maxTokens?: number;
}
export interface AiRes {
  text: string;
  model?: string;
  tokensUsed?: number;
}

// ── analytics ─────────────────────────────────────────────────────────────────

export interface AnalyticsReq {
  event: string;
  properties?: Record<string, unknown>;
  userId?: string;
}
export interface AnalyticsRes {
  tracked: boolean;
}

// ── share ─────────────────────────────────────────────────────────────────────

export interface ShareReq {
  title: string;
  message: string;
  url?: string;
}
export interface ShareRes {
  shared: boolean;
  platform?: string;
}

// ── eventInvitation ───────────────────────────────────────────────────────────

export interface EventInvitationReq {
  tripId: string;
  eventName: string;
  destinationSlug: string;
  startDate: string;
  guestEmails?: string[];
}
export interface EventInvitationRes {
  url: string;
  platform: string;
}

// ── images ────────────────────────────────────────────────────────────────────

export interface ImageResult {
  url: string;
  attribution?: string;
  altText?: string;
}
export interface ImagesReq {
  query?: string;
  destinationSlug?: string;
  width?: number;
  height?: number;
  count?: number;
}
export interface ImagesRes {
  images: ImageResult[];
}

// ── notifications ─────────────────────────────────────────────────────────────

export interface NotificationsReq {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}
export interface NotificationsRes {
  sent: boolean;
  notificationId?: string;
}
