export type GlamourLevel =
  | 'shoestring_slay'
  | 'cute_but_controlled'
  | 'comfortably_fabulous'
  | 'luxury_gaycation'
  | 'no_budget_just_vibes';

export type LgbtqLegalStatus =
  | 'marriage_equality'
  | 'civil_union'
  | 'limited_protections'
  | 'no_recognition'
  | 'criminalized'
  | 'heavily_criminalized';

export type WeatherPreference = 'hot' | 'warm' | 'mild' | 'cool' | 'any';

export type Interest =
  | 'beach'
  | 'hiking'
  | 'culture'
  | 'nightlife'
  | 'food'
  | 'art'
  | 'history'
  | 'shopping'
  | 'wellness'
  | 'adventure'
  | 'pride'
  | 'sports'
  | 'music'
  | 'lgbtq_venues'
  | 'drag';

export type LookingFor =
  | 'community'
  | 'romance'
  | 'friendship'
  | 'dancing'
  | 'relaxation'
  | 'exploration'
  | 'activism';

export type ActivityPace = 'packed' | 'balanced' | 'downtime';

export type LodgingStatus = 'none' | 'booked';

export interface TravelPreferences {
  budgetLevel: GlamourLevel;
  /** IATA airport codes */
  departureAirports: string[];
  /** Month numbers 1–12 */
  travelMonths: number[];
  tripDurationDays: number;
  groupSize: number;
  interests: Interest[];
  accessibilityNeeds: string[];
  /** 0–1 */
  nightlifeImportance: number;
  weatherPreference: WeatherPreference;
  /** 0–1 */
  lgbtqSafetyPriority: number;
  soloTravel: boolean;
  lookingFor: LookingFor[];
  /** Day-to-day activities vs downtime preference */
  activityPace?: ActivityPace;
  /** Whether lodging is already booked */
  lodgingStatus?: LodgingStatus;
  /** Free-text lodging address or Airbnb/hotel URL */
  lodgingAddress?: string;
  lodgingLat?: number;
  lodgingLng?: number;
}

/** Per-member preference snapshot for group blending */
export interface MemberPreferenceSnapshot {
  memberId: string;
  displayName?: string;
  interests?: Interest[];
  nightlifeImportance?: number;
  activityPace?: ActivityPace;
  lookingFor?: LookingFor[];
}

export interface DestinationEvent {
  name: string;
  /** Month number 1–12 */
  month: number;
  type: 'pride' | 'festival' | 'conference' | 'party' | 'other';
  url?: string;
}

export interface AccessibilityInfo {
  wheelchairFriendly: boolean;
  brailleAvailable: boolean;
  notes: string;
}

export interface CostPerDay {
  /** USD per person, budget tier */
  budget: number;
  /** USD per person, mid tier */
  mid: number;
  /** USD per person, luxury tier */
  luxury: number;
}

export interface Destination {
  slug: string;
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2 continent shorthand e.g. "EU" */
  continentCode: string;
  /** IATA codes for nearest airports */
  nearestAirportCodes: string[];
  legalStatus: LgbtqLegalStatus;
  /** 0–100 */
  safetyScore: number;
  /** 0–100 platform community score */
  communityScore: number;
  /** 0–100 */
  nightlifeScore: number;
  /** Month numbers 1–12 that are considered peak/best */
  bestMonths: number[];
  /** Average daily high temp °C keyed by month number */
  avgTempCByMonth: Partial<Record<number, number>>;
  interests: Interest[];
  upcomingEvents: DestinationEvent[];
  accessibility: AccessibilityInfo;
  costPerDay: CostPerDay;
  /** ISO date string of last data refresh */
  lastUpdated: string;
  /** 0–5 */
  reviewScore?: number;
  reviewCount?: number;
  typicalStayDays?: { min: number; max: number };
}

export type PlaceCategory =
  | 'bar'
  | 'club'
  | 'restaurant'
  | 'cafe'
  | 'museum'
  | 'park'
  | 'beach'
  | 'spa'
  | 'hotel'
  | 'tour'
  | 'event'
  | 'shop'
  | 'landmark'
  | 'other';

export interface PlaceHours {
  open: string;
  close: string;
}

export interface Place {
  placeId: string;
  name: string;
  category: PlaceCategory;
  coords: { lat: number; lng: number };
  /** Typical visit duration in minutes */
  durationMinutes: number;
  estimatedCostPerPerson: number;
  bookingRequired: boolean;
  interests: Interest[];
  accessibilityNotes?: string;
  lgbtqRelevance?: string;
  source: string;
  openingHours?: PlaceHours[];
}

export interface Trip {
  tripId: string;
  userId: string;
  destinationSlug: string;
  startDate: string;
  endDate: string;
  groupSize: number;
  isPublic: boolean;
  lodgingAddress?: string;
  bookingConfirmations?: Record<string, string>;
  legalName?: string;
  sensitivePreferences?: Record<string, unknown>;
  highlights?: string[];
  photoCount?: number;
}
