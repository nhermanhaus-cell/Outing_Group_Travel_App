// ── Core registry ──────────────────────────────────────────────────────────────
export {
  defineProviderPlugin,
  ProviderRegistry,
  withTimeout,
  withSourceMeta,
} from './registry';
export type { PluginHandle, ProviderPlugin, SourceMeta } from './registry';

// ── Slots ──────────────────────────────────────────────────────────────────────
export { SLOTS } from './slots';
export type { Slot } from './slots';

// ── Interfaces ─────────────────────────────────────────────────────────────────
export type {
  // destinations
  DestinationsReq, DestinationsRes,
  // places
  PlacesReq, PlacesRes,
  // events
  LocalEvent, EventsReq, EventsRes,
  // experiences
  Experience, ExperiencesReq, ExperiencesRes,
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
} from './interfaces';

// ── App providers ──────────────────────────────────────────────────────────────
export { createAppProviders } from './app-providers';
export type { AppProviders } from './app-providers';

// ── Plugins (named exports for custom registration) ────────────────────────────
export { destinationsMockSeed }           from './plugins/destinations/mock-seed';
export { destinationsSupabaseShell }      from './plugins/destinations/supabase.shell';
export { placesMockSeed }                 from './plugins/places/mock-seed';
export { placesSupabaseShell }            from './plugins/places/supabase.shell';
export { placesGoogleShell }              from './plugins/places/google-places.shell';
export { placesOsmOverpass }              from './plugins/places/osm-overpass';
export { eventsMockSeed }                 from './plugins/events/mock-seed';
export { eventsSupabaseShell }            from './plugins/events/supabase.shell';
export { eventsTicketmasterShell }        from './plugins/events/ticketmaster.shell';
export { eventsWikidata }                 from './plugins/events/wikidata';
export { experiencesMockEditorial }       from './plugins/experiences/mock-editorial';
export { experiencesViatorShell }         from './plugins/experiences/viator.shell';
export { experiencesGetYourGuideShell }   from './plugins/experiences/getyourguide.shell';
export { lgbtqContextMockEditorial }      from './plugins/lgbtqContext/mock-editorial';
export { lgbtqContextIlgaEurope }         from './plugins/lgbtqContext/ilga-europe';
export { lgbtqContextIlgaWorld }          from './plugins/lgbtqContext/ilga-world';
export { lgbtqContextEqualdexCited }      from './plugins/lgbtqContext/equaldex-cited';
export { lgbtqContextEqualdexApiShell }   from './plugins/lgbtqContext/equaldex-api.shell';
export { lgbtqContextGovAdvisories }      from './plugins/lgbtqContext/gov-advisories';
export { communitySignalsMockSeed }       from './plugins/communitySignals/mock-seed';
export { communitySignalsSupabaseShell }  from './plugins/communitySignals/supabase.shell';
export { weatherMockSeasonal }            from './plugins/weather/mock-seasonal';
export { weatherApiShell }               from './plugins/weather/weather-api.shell';
export { flightsMockBands }              from './plugins/flights/mock-bands';
export { flightsAmadeusShell }           from './plugins/flights/amadeus.shell';
export { lodgingMockBands }              from './plugins/lodging/mock-bands';
export { lodgingApiShell }               from './plugins/lodging/lodging-api.shell';
export { currencyMockRates }             from './plugins/currency/mock-rates';
export { currencyFxApiShell }            from './plugins/currency/fx-api.shell';
export { mapsRnMapsStub }                from './plugins/maps/rn-maps.stub';
export { tripsLocalDraft }               from './plugins/trips/local-draft';
export { tripsSupabaseShell }            from './plugins/trips/supabase.shell';
export { authMock }                      from './plugins/auth/mock';
export { authSupabaseShell }             from './plugins/auth/supabase.shell';
export { aiTemplateSummary }             from './plugins/ai/template-summary';
export { aiOpenAiShell }                 from './plugins/ai/openai-compatible.shell';
export { analyticsNoop }                 from './plugins/analytics/noop';
export { analyticsPosthogShell }         from './plugins/analytics/posthog.shell';
export { shareNativeShare }              from './plugins/share/native-share';
export { eventInvitationPartifulHandoff } from './plugins/eventInvitation/partiful-handoff';
export { imagesRemotePlaceholder }       from './plugins/images/remote-placeholder';
export { notificationsNoop }             from './plugins/notifications/noop';
export { notificationsExpoShell }        from './plugins/notifications/expo-notifications.shell';
