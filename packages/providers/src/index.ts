// ── Core registry ──────────────────────────────────────────────────────────────
export {
  defineProviderPlugin,
  ProviderRegistry,
  withTimeout,
  withSourceMeta,
} from './registry.js';
export type { PluginHandle, ProviderPlugin, SourceMeta } from './registry.js';

// ── Slots ──────────────────────────────────────────────────────────────────────
export { SLOTS } from './slots.js';
export type { Slot } from './slots.js';

// ── Interfaces ─────────────────────────────────────────────────────────────────
export type {
  // destinations
  DestinationsReq, DestinationsRes,
  // places
  PlacesReq, PlacesRes,
  // events
  LocalEvent, EventsReq, EventsRes,
  // lgbtqContext
  LgbtqContext, LgbtqContextReq, LgbtqContextRes,
  // communitySignals
  CommunitySignals, CommunitySignalsReq, CommunitySignalsRes,
  // weather
  WeatherData, WeatherReq, WeatherRes,
  // flights
  FlightBand, FlightsReq, FlightsRes,
  // lodging
  LodgingBand, LodgingReq, LodgingRes,
  // currency
  CurrencyReq, CurrencyRes,
  // maps
  MapMarker, MapsReq, MapsRes,
  // trips
  TripsReq, TripsRes,
  // auth
  AuthUser, AuthReq, AuthRes,
  // ai
  AiReq, AiRes,
  // analytics
  AnalyticsReq, AnalyticsRes,
  // share
  ShareReq, ShareRes,
  // eventInvitation
  EventInvitationReq, EventInvitationRes,
  // images
  ImageResult, ImagesReq, ImagesRes,
  // notifications
  NotificationsReq, NotificationsRes,
} from './interfaces.js';

// ── App providers ──────────────────────────────────────────────────────────────
export { createAppProviders } from './app-providers.js';
export type { AppProviders } from './app-providers.js';

// ── Plugins (named exports for custom registration) ────────────────────────────
export { destinationsMockSeed }           from './plugins/destinations/mock-seed.js';
export { destinationsSupabaseShell }      from './plugins/destinations/supabase.shell.js';
export { placesMockSeed }                 from './plugins/places/mock-seed.js';
export { placesSupabaseShell }            from './plugins/places/supabase.shell.js';
export { placesGoogleShell }              from './plugins/places/google-places.shell.js';
export { eventsMockSeed }                 from './plugins/events/mock-seed.js';
export { eventsSupabaseShell }            from './plugins/events/supabase.shell.js';
export { eventsTicketmasterShell }        from './plugins/events/ticketmaster.shell.js';
export { lgbtqContextMockEditorial }      from './plugins/lgbtqContext/mock-editorial.js';
export { communitySignalsMockSeed }       from './plugins/communitySignals/mock-seed.js';
export { communitySignalsSupabaseShell }  from './plugins/communitySignals/supabase.shell.js';
export { weatherMockSeasonal }            from './plugins/weather/mock-seasonal.js';
export { weatherApiShell }               from './plugins/weather/weather-api.shell.js';
export { flightsMockBands }              from './plugins/flights/mock-bands.js';
export { flightsAmadeusShell }           from './plugins/flights/amadeus.shell.js';
export { lodgingMockBands }              from './plugins/lodging/mock-bands.js';
export { lodgingApiShell }               from './plugins/lodging/lodging-api.shell.js';
export { currencyMockRates }             from './plugins/currency/mock-rates.js';
export { currencyFxApiShell }            from './plugins/currency/fx-api.shell.js';
export { mapsRnMapsStub }                from './plugins/maps/rn-maps.stub.js';
export { tripsLocalDraft }               from './plugins/trips/local-draft.js';
export { tripsSupabaseShell }            from './plugins/trips/supabase.shell.js';
export { authMock }                      from './plugins/auth/mock.js';
export { authSupabaseShell }             from './plugins/auth/supabase.shell.js';
export { aiTemplateSummary }             from './plugins/ai/template-summary.js';
export { aiOpenAiShell }                 from './plugins/ai/openai-compatible.shell.js';
export { analyticsNoop }                 from './plugins/analytics/noop.js';
export { analyticsPosthogShell }         from './plugins/analytics/posthog.shell.js';
export { shareNativeShare }              from './plugins/share/native-share.js';
export { eventInvitationPartifulHandoff } from './plugins/eventInvitation/partiful-handoff.js';
export { imagesRemotePlaceholder }       from './plugins/images/remote-placeholder.js';
export { notificationsNoop }             from './plugins/notifications/noop.js';
export { notificationsExpoShell }        from './plugins/notifications/expo-notifications.shell.js';
