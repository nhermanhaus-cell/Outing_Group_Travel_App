import type { ProviderRegistry, PluginHandle } from './registry';
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
} from './interfaces';

// ── Plugin imports ─────────────────────────────────────────────────────────────

import { destinationsMockSeed }           from './plugins/destinations/mock-seed';
import { destinationsSupabaseShell }      from './plugins/destinations/supabase.shell';
import { placesMockSeed }                 from './plugins/places/mock-seed';
import { placesSupabaseShell }            from './plugins/places/supabase.shell';
import { placesGoogleShell }              from './plugins/places/google-places.shell';
import { placesOsmOverpass }              from './plugins/places/osm-overpass';
import { eventsMockSeed }                 from './plugins/events/mock-seed';
import { eventsSupabaseShell }            from './plugins/events/supabase.shell';
import { eventsTicketmasterShell }        from './plugins/events/ticketmaster.shell';
import { eventsWikidata }                 from './plugins/events/wikidata';
import { lgbtqContextMockEditorial }      from './plugins/lgbtqContext/mock-editorial';
import { lgbtqContextIlgaEurope }         from './plugins/lgbtqContext/ilga-europe';
import { lgbtqContextIlgaWorld }          from './plugins/lgbtqContext/ilga-world';
import { lgbtqContextEqualdexCited }      from './plugins/lgbtqContext/equaldex-cited';
import { lgbtqContextEqualdexApiShell }   from './plugins/lgbtqContext/equaldex-api.shell';
import { lgbtqContextGovAdvisories }      from './plugins/lgbtqContext/gov-advisories';
import { communitySignalsMockSeed }       from './plugins/communitySignals/mock-seed';
import { communitySignalsSupabaseShell }  from './plugins/communitySignals/supabase.shell';
import { weatherMockSeasonal }            from './plugins/weather/mock-seasonal';
import { weatherApiShell }               from './plugins/weather/weather-api.shell';
import { flightsMockBands }              from './plugins/flights/mock-bands';
import { flightsAmadeusShell }           from './plugins/flights/amadeus.shell';
import { lodgingMockBands }              from './plugins/lodging/mock-bands';
import { lodgingApiShell }               from './plugins/lodging/lodging-api.shell';
import { currencyMockRates }             from './plugins/currency/mock-rates';
import { currencyFxApiShell }            from './plugins/currency/fx-api.shell';
import { mapsRnMapsStub }                from './plugins/maps/rn-maps.stub';
import { tripsLocalDraft }               from './plugins/trips/local-draft';
import { tripsSupabaseShell }            from './plugins/trips/supabase.shell';
import { authMock }                      from './plugins/auth/mock';
import { authSupabaseShell }             from './plugins/auth/supabase.shell';
import { aiTemplateSummary }             from './plugins/ai/template-summary';
import { aiOpenAiShell }                 from './plugins/ai/openai-compatible.shell';
import { analyticsNoop }                 from './plugins/analytics/noop';
import { analyticsPosthogShell }         from './plugins/analytics/posthog.shell';
import { shareNativeShare }              from './plugins/share/native-share';
import { eventInvitationPartifulHandoff } from './plugins/eventInvitation/partiful-handoff';
import { imagesRemotePlaceholder }       from './plugins/images/remote-placeholder';
import { notificationsNoop }             from './plugins/notifications/noop';
import { notificationsExpoShell }        from './plugins/notifications/expo-notifications.shell';

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
  registry.register(placesOsmOverpass);
  registry.register(placesMockSeed);

  registry.register(eventsSupabaseShell);
  registry.register(eventsTicketmasterShell);
  registry.register(eventsWikidata);
  registry.register(eventsMockSeed);

  // Equaldex live API is registered but healthCheck stays false until commercial license.
  registry.register(lgbtqContextEqualdexApiShell);
  registry.register(lgbtqContextEqualdexCited);
  registry.register(lgbtqContextIlgaWorld);
  registry.register(lgbtqContextIlgaEurope);
  registry.register(lgbtqContextGovAdvisories);
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
