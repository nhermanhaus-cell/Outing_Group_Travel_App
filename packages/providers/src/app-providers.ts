import type { ProviderRegistry, PluginHandle } from './registry.js';
import type {
  DestinationsReq, DestinationsRes,
  PlacesReq, PlacesRes,
  EventsReq, EventsRes,
  LgbtqContextReq, LgbtqContextRes,
  CommunitySignalsReq, CommunitySignalsRes,
  WeatherReq, WeatherRes,
  FlightsReq, FlightsRes,
  LodgingReq, LodgingRes,
  CurrencyReq, CurrencyRes,
  MapsReq, MapsRes,
  TripsReq, TripsRes,
  AuthReq, AuthRes,
  AiReq, AiRes,
  AnalyticsReq, AnalyticsRes,
  ShareReq, ShareRes,
  EventInvitationReq, EventInvitationRes,
  ImagesReq, ImagesRes,
  NotificationsReq, NotificationsRes,
} from './interfaces.js';

// ── Plugin imports ─────────────────────────────────────────────────────────────

import { destinationsMockSeed }           from './plugins/destinations/mock-seed.js';
import { destinationsSupabaseShell }      from './plugins/destinations/supabase.shell.js';
import { placesMockSeed }                 from './plugins/places/mock-seed.js';
import { placesSupabaseShell }            from './plugins/places/supabase.shell.js';
import { placesGoogleShell }              from './plugins/places/google-places.shell.js';
import { eventsMockSeed }                 from './plugins/events/mock-seed.js';
import { eventsSupabaseShell }            from './plugins/events/supabase.shell.js';
import { eventsTicketmasterShell }        from './plugins/events/ticketmaster.shell.js';
import { lgbtqContextMockEditorial }      from './plugins/lgbtqContext/mock-editorial.js';
import { communitySignalsMockSeed }       from './plugins/communitySignals/mock-seed.js';
import { communitySignalsSupabaseShell }  from './plugins/communitySignals/supabase.shell.js';
import { weatherMockSeasonal }            from './plugins/weather/mock-seasonal.js';
import { weatherApiShell }               from './plugins/weather/weather-api.shell.js';
import { flightsMockBands }              from './plugins/flights/mock-bands.js';
import { flightsAmadeusShell }           from './plugins/flights/amadeus.shell.js';
import { lodgingMockBands }              from './plugins/lodging/mock-bands.js';
import { lodgingApiShell }               from './plugins/lodging/lodging-api.shell.js';
import { currencyMockRates }             from './plugins/currency/mock-rates.js';
import { currencyFxApiShell }            from './plugins/currency/fx-api.shell.js';
import { mapsRnMapsStub }                from './plugins/maps/rn-maps.stub.js';
import { tripsLocalDraft }               from './plugins/trips/local-draft.js';
import { tripsSupabaseShell }            from './plugins/trips/supabase.shell.js';
import { authMock }                      from './plugins/auth/mock.js';
import { authSupabaseShell }             from './plugins/auth/supabase.shell.js';
import { aiTemplateSummary }             from './plugins/ai/template-summary.js';
import { aiOpenAiShell }                 from './plugins/ai/openai-compatible.shell.js';
import { analyticsNoop }                 from './plugins/analytics/noop.js';
import { analyticsPosthogShell }         from './plugins/analytics/posthog.shell.js';
import { shareNativeShare }              from './plugins/share/native-share.js';
import { eventInvitationPartifulHandoff } from './plugins/eventInvitation/partiful-handoff.js';
import { imagesRemotePlaceholder }       from './plugins/images/remote-placeholder.js';
import { notificationsNoop }             from './plugins/notifications/noop.js';
import { notificationsExpoShell }        from './plugins/notifications/expo-notifications.shell.js';

// ── App providers facade ───────────────────────────────────────────────────────

export interface AppProviders {
  destinations:     PluginHandle<DestinationsReq,     DestinationsRes>;
  places:           PluginHandle<PlacesReq,           PlacesRes>;
  events:           PluginHandle<EventsReq,           EventsRes>;
  lgbtqContext:     PluginHandle<LgbtqContextReq,     LgbtqContextRes>;
  communitySignals: PluginHandle<CommunitySignalsReq, CommunitySignalsRes>;
  weather:          PluginHandle<WeatherReq,          WeatherRes>;
  flights:          PluginHandle<FlightsReq,          FlightsRes>;
  lodging:          PluginHandle<LodgingReq,          LodgingRes>;
  currency:         PluginHandle<CurrencyReq,         CurrencyRes>;
  maps:             PluginHandle<MapsReq,             MapsRes>;
  trips:            PluginHandle<TripsReq,            TripsRes>;
  auth:             PluginHandle<AuthReq,             AuthRes>;
  ai:               PluginHandle<AiReq,               AiRes>;
  analytics:        PluginHandle<AnalyticsReq,        AnalyticsRes>;
  share:            PluginHandle<ShareReq,            ShareRes>;
  eventInvitation:  PluginHandle<EventInvitationReq,  EventInvitationRes>;
  images:           PluginHandle<ImagesReq,           ImagesRes>;
  notifications:    PluginHandle<NotificationsReq,    NotificationsRes>;
}

/**
 * Registers all built-in plugins into the registry (if not already registered)
 * and resolves the active plugin for every slot, returning a typed facade.
 *
 * Resolution order per slot:
 *   1. In-app override (registry.setOverride)
 *   2. GAYI_PROVIDER_<SLOT> env var
 *   3. First non-mock plugin whose healthCheck passes
 *   4. Mock fallback
 */
export async function createAppProviders(registry: ProviderRegistry): Promise<AppProviders> {
  // Register shell plugins first so they are considered before mocks in env-key resolution.
  registry.register(destinationsSupabaseShell);
  registry.register(destinationsMockSeed);

  registry.register(placesSupabaseShell);
  registry.register(placesGoogleShell);
  registry.register(placesMockSeed);

  registry.register(eventsSupabaseShell);
  registry.register(eventsTicketmasterShell);
  registry.register(eventsMockSeed);

  registry.register(lgbtqContextMockEditorial);

  registry.register(communitySignalsSupabaseShell);
  registry.register(communitySignalsMockSeed);

  registry.register(weatherApiShell);
  registry.register(weatherMockSeasonal);

  registry.register(flightsAmadeusShell);
  registry.register(flightsMockBands);

  registry.register(lodgingApiShell);
  registry.register(lodgingMockBands);

  registry.register(currencyFxApiShell);
  registry.register(currencyMockRates);

  registry.register(mapsRnMapsStub);

  registry.register(tripsSupabaseShell);
  registry.register(tripsLocalDraft);

  registry.register(authSupabaseShell);
  registry.register(authMock);

  registry.register(aiOpenAiShell);
  registry.register(aiTemplateSummary);

  registry.register(analyticsPosthogShell);
  registry.register(analyticsNoop);

  registry.register(shareNativeShare);
  registry.register(eventInvitationPartifulHandoff);
  registry.register(imagesRemotePlaceholder);
  registry.register(notificationsExpoShell);
  registry.register(notificationsNoop);

  const [
    destinations, places, events, lgbtqContext, communitySignals,
    weather, flights, lodging, currency, maps, trips, auth, ai,
    analytics, share, eventInvitation, images, notifications,
  ] = await Promise.all([
    registry.resolve<DestinationsReq,     DestinationsRes>    ('destinations'),
    registry.resolve<PlacesReq,           PlacesRes>          ('places'),
    registry.resolve<EventsReq,           EventsRes>          ('events'),
    registry.resolve<LgbtqContextReq,     LgbtqContextRes>    ('lgbtqContext'),
    registry.resolve<CommunitySignalsReq, CommunitySignalsRes>('communitySignals'),
    registry.resolve<WeatherReq,          WeatherRes>         ('weather'),
    registry.resolve<FlightsReq,          FlightsRes>         ('flights'),
    registry.resolve<LodgingReq,          LodgingRes>         ('lodging'),
    registry.resolve<CurrencyReq,         CurrencyRes>        ('currency'),
    registry.resolve<MapsReq,             MapsRes>            ('maps'),
    registry.resolve<TripsReq,            TripsRes>           ('trips'),
    registry.resolve<AuthReq,             AuthRes>            ('auth'),
    registry.resolve<AiReq,               AiRes>              ('ai'),
    registry.resolve<AnalyticsReq,        AnalyticsRes>       ('analytics'),
    registry.resolve<ShareReq,            ShareRes>           ('share'),
    registry.resolve<EventInvitationReq,  EventInvitationRes> ('eventInvitation'),
    registry.resolve<ImagesReq,           ImagesRes>          ('images'),
    registry.resolve<NotificationsReq,    NotificationsRes>   ('notifications'),
  ]);

  return {
    destinations, places, events, lgbtqContext, communitySignals,
    weather, flights, lodging, currency, maps, trips, auth, ai,
    analytics, share, eventInvitation, images, notifications,
  };
}
