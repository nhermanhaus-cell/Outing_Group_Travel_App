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

export type DestinationType = 'city' | 'island' | 'resort_area';
export type TravelerAdvisoryLevel = 'standard' | 'caution' | 'elevated' | 'severe';

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
export type DayRhythm = 'early' | 'flexible' | 'late';
export type TripGoal =
  | 'explore'
  | 'recharge'
  | 'celebrate'
  | 'connect'
  | 'romance'
  | 'learn'
  | 'indulge';
export type VacationStyle =
  | 'iconic_highlights'
  | 'local_neighborhoods'
  | 'hidden_gems'
  | 'reservation_worthy'
  | 'spontaneous'
  | 'photogenic';

export interface TripPlanningPreferences {
  goals: TripGoal[];
  vacationStyles: VacationStyle[];
  dayRhythm: DayRhythm;
  mealPreferences: string[];
  avoidances: string[];
  hallmarkIds: string[];
  hallmarkNames: string[];
  freeformWish?: string;
}

export type LodgingStatus = 'none' | 'booked';

export type TravelRange =
  | 'road_trip'
  | 'short_flight'
  | 'long_domestic'
  | 'international';

export type PreferredTransportMode = 'auto' | 'walking' | 'transit' | 'driving';

export type LongDistanceTransportMode = 'car' | 'train' | 'plane' | 'boat';
export type TravelScope = 'domestic' | 'international' | 'either';

export interface HomeAirport {
  iata: string;
  name: string;
  city?: string;
  countryCode?: string;
  coords?: { lat: number; lng: number };
  primary: boolean;
  source: 'manual' | 'nearby_suggestion' | 'profile_import';
}

export interface UserTravelProfile {
  homeAirports: HomeAirport[];
  coarseHomeRegion?: string;
  defaultInterests: Interest[];
  preferredTravelMonths?: number[];
  defaultGroupSize?: number;
  defaultTripLengthDays?: number;
  preferredTravelRanges: TravelRange[];
  preferredTransportMode: PreferredTransportMode;
  maxTravelTimeHours?: number;
  travelScope?: TravelScope;
  longDistanceTransportModes?: LongDistanceTransportMode[];
  defaultTripGoals?: TripGoal[];
  defaultVacationStyles?: VacationStyle[];
  defaultDayRhythm?: DayRhythm;
  defaultMealPreferences?: string[];
  defaultAvoidances?: string[];
  updatedAt: string;
}

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
  dayRhythm?: DayRhythm;
  /** Whether lodging is already booked */
  lodgingStatus?: LodgingStatus;
  /** Free-text lodging address or Airbnb/hotel URL */
  lodgingAddress?: string;
  lodgingLat?: number;
  lodgingLng?: number;
  /** Acceptable distance/transport categories for destination recommendations. */
  travelRanges?: TravelRange[];
  /** Saved airport profiles; departureAirports remains the compact scoring input. */
  homeAirports?: HomeAirport[];
  preferredTransportMode?: PreferredTransportMode;
  /** Maximum acceptable one-way journey time. Omitted when the traveler has no limit. */
  maxTravelTimeHours?: number;
  /** Whether recommendations should stay domestic, cross borders, or include either. */
  travelScope?: TravelScope;
  /** Acceptable ways to reach the destination. */
  longDistanceTransportModes?: LongDistanceTransportMode[];
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
  destinationType?: DestinationType;
  travelerAdvisoryLevel?: TravelerAdvisoryLevel;
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
  /** 0 (Sunday) through 6 (Saturday). Omitted for legacy daily hours. */
  dayOfWeek?: number;
  open: string;
  close: string;
}

export interface PlacePhoto {
  url: string;
  attribution?: string;
  provider: string;
}

export type BookingProvider =
  | 'viator'
  | 'getyourguide'
  | 'booking_com'
  | 'expedia'
  | 'skyscanner'
  | 'google_flights'
  | 'direct'
  | 'other';

export interface BookableOffer {
  provider: BookingProvider;
  /** Exact provider page for this product/search; never a fabricated checkout URL. */
  url: string;
  affiliate: boolean;
  disclosure?: string;
  price?: number;
  currency?: string;
  cancellationSummary?: string;
}

export interface Place {
  placeId: string;
  name: string;
  /** Short factual explanation used when travelers review activity options. */
  summary?: string;
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
  providerPlaceId?: string;
  address?: string;
  rating?: number;
  reviewCount?: number;
  photos?: PlacePhoto[];
  businessStatus?: 'operational' | 'closed_temporarily' | 'closed_permanently' | 'unknown';
  priceLevel?: number;
  verifiedAt?: string;
  fixedStartTimes?: string[];
  timezone?: string;
  bookingOffer?: BookableOffer;
  /** Explainable-ranking metadata. Provider facts remain authoritative. */
  fitReasons?: string[];
  /** Confidence that identity and recommendation metadata are sufficient for planning. */
  confidence?: number;
  routeTimeMinutes?: number;
  freshness?: 'live' | 'recent' | 'cached' | 'stale' | 'limited';
  neighborhood?: string;
  providerDisclosure?: string;
}

export type ActivityPreferenceChoice =
  | 'very_interested'
  | 'interested'
  | 'neutral'
  | 'uninterested'
  | 'very_uninterested'
  /** Legacy values accepted for backward-compatible decoding. */
  | 'must_do'
  | 'maybe'
  | 'not_for_this_trip'
  | 'not_interested';

export interface ActivityPreferenceVote {
  placeId: string;
  memberId: string;
  choice: ActivityPreferenceChoice;
  category: string;
  createdAt: string;
}


export interface PendingInvite {
  id: string;
  displayName: string;
  phoneNumber: string;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
}

export interface TripDraft {
  draftId: string;
  mode: 'recommendations' | 'manual';
  destinationSlug?: string;
  destinationName?: string;
  name?: string;
  preferences: Partial<TravelPreferences>;
  pendingInvites: PendingInvite[];
  createdAt: string;
  updatedAt: string;
}

export interface CollectionHighlight {
  title: string;
  description: string;
  destinationSlug?: string;
  placeName?: string;
}

export interface EditorialCollection {
  id: string;
  title: string;
  kicker: string;
  whyVisit: string;
  heroImageUrl: string;
  attribution: string;
  destinationSlugs: string[];
  highlights: CollectionHighlight[];
  bestFor: string[];
  travelRanges?: TravelRange[];
  bestMonths?: number[];
  seasonGuidance: string;
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
