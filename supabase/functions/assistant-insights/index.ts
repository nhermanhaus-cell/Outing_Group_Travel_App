import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.24.2';
import { corsHeaders } from '../_shared/http.ts';
import {
  auditTripRow,
  compareDestinationRows,
  dynamicStarterPrompts,
  filterFreshPreferenceSignals,
  groupPreferenceSummary,
  rankDestinationRows,
  safeConstraintRelaxations,
  type CommunitySignal,
  type Json,
  type PersonalizationContext,
} from '../_shared/assistant-intelligence.ts';

const searchIntentSchema = z.object({
  query: z.string().trim().min(2).max(400),
  interests: z.array(z.string().min(1).max(80)).max(12).default([]),
  month: z.number().int().min(1).max(12).optional(),
  budgetLevel: z.string().max(80).optional(),
  climate: z.enum(['warm', 'cool', 'mild', 'any']).optional(),
  destinationHint: z.string().max(160).optional(),
  hardConstraints: z.array(z.string().min(1).max(160)).max(12).default([]),
});

const insightIntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('screen') }),
  z.object({
    kind: z.literal('compare'),
    entityKind: z.enum(['destination', 'date_window', 'activity', 'neighborhood']),
    optionIds: z.array(z.string().min(1).max(200)).min(2).max(4),
  }),
  z.object({ kind: z.literal('search'), search: searchIntentSchema }),
  z.object({ kind: z.literal('audit') }),
  z.object({ kind: z.literal('group') }),
]);

const requestSchema = z.object({
  surface: z.enum(['home', 'destination', 'trip', 'ask']),
  destinationSlug: z.string().max(120).optional(),
  tripId: z.string().uuid().optional(),
  trigger: z.enum([
    'screen', 'quiz_completed', 'profile_changed', 'destination_saved', 'trip_changed',
    'feedback_submitted', 'vote_resolved', 'manual_refresh',
  ]).default('screen'),
  intent: insightIntentSchema.default({ kind: 'screen' }),
  force: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.surface === 'destination' && !value.destinationSlug) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationSlug'], message: 'Destination required' });
  }
  if (value.surface === 'trip' && !value.tripId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tripId'], message: 'Trip required' });
  }
  if ((value.intent.kind === 'audit' || value.intent.kind === 'group') && !value.tripId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['intent'], message: 'Trip decision intelligence requires a trip' });
  }
});

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || undefined;
}

function enabled(name: string): boolean {
  const value = optionalEnv(name)?.toLowerCase();
  return value === 'true' || value === '1';
}

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : [];
}

function scoreCatalogPlace(place: Json, context: PersonalizationContext): number {
  const text = [place.name, place.category, place.summary, place.lgbtqRelevance]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const explicitMatches = [...context.explicit.interests, ...(context.trip?.interests ?? [])]
    .filter((interest) => text.includes(interest.toLowerCase())).length;
  const inferredAdjustment = context.inferred
    .filter((signal) => signal.subjectType === 'activity_category' && text.includes(signal.subjectKey.toLowerCase()))
    .reduce((sum, signal) => sum + signal.score * signal.confidence * 8, 0);
  return Math.max(40, Math.min(95, Math.round(62 + explicitMatches * 9 + inferredAdjustment)));
}

function daysConfidence(tripRow: Json): number {
  const plan = record(record(tripRow.payload).tripPlan);
  const days = Array.isArray(plan.days) ? plan.days : [];
  if (!days.length) return 0.35;
  const itemCount = days.reduce((sum, value) => {
    const day = record(value);
    return sum + (Array.isArray(day.items) ? day.items.length : 0);
  }, 0);
  return Math.max(0.45, Math.min(0.9, 0.45 + itemCount / 30));
}

async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

function formatInsight(row: Json) {
  const payload = record(row.payload);
  return {
    id: row.id,
    surface: row.surface,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    recommendations: Array.isArray(payload.recommendations) ? payload.recommendations : [],
    prompts: strings(payload.prompts),
    ...(payload.decisionCard ? { decisionCard: payload.decisionCard } : {}),
    ...(payload.comparison ? { comparison: payload.comparison } : {}),
    ...(payload.audit ? { audit: payload.audit } : {}),
    relaxations: Array.isArray(payload.relaxations) ? payload.relaxations : [],
    contextFingerprint: row.context_fingerprint,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
  };
}

async function embedQuery(query: string, signal: AbortSignal): Promise<number[] | undefined> {
  if (!enabled('AI_ENABLE_SEMANTIC_RETRIEVAL')) return undefined;
  const apiKey = optionalEnv('MISTRAL_API_KEY');
  if (!apiKey) return undefined;
  const response = await fetch('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: optionalEnv('MISTRAL_EMBED_MODEL') ?? 'mistral-embed-2312',
      input: [query.slice(0, 2_000)],
    }),
    signal,
  });
  if (!response.ok) return undefined;
  const body = await response.json().catch(() => ({})) as Json;
  const data = Array.isArray(body.data) ? body.data : [];
  const embedding = record(data[0]).embedding;
  return Array.isArray(embedding) && embedding.length === 1024
    ? embedding.filter((value): value is number => typeof value === 'number')
    : undefined;
}

async function semanticDestinationSlugs(
  service: ReturnType<typeof createClient<any>>,
  query: string,
  signal: AbortSignal,
): Promise<string[]> {
  const embedding = await embedQuery(query, signal).catch(() => undefined);
  if (!embedding) return [];
  const { data, error } = await service.rpc('match_assistant_knowledge', {
    query_embedding: embedding,
    match_count: 40,
    filter_destination_slug: null,
    filter_entity_types: ['destination', 'destination_context', 'place', 'event', 'experience', 'neighborhood', 'editorial'],
  });
  if (error) return [];
  const slugs: string[] = (data ?? []).flatMap((row: Json) =>
    typeof row.destination_slug === 'string' ? [row.destination_slug] : []);
  return [...new Set<string>(slugs)].slice(0, 20);
}

async function polishDecisionCard(card: Json, signal: AbortSignal): Promise<Json> {
  const apiKey = optionalEnv('MISTRAL_API_KEY');
  if (!apiKey) return card;
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: optionalEnv('MISTRAL_MODEL') ?? 'mistral-small-2603',
        temperature: 0.1,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'system',
          content: 'Rewrite the supplied Outing decision title and summary to be warm, concise, specific, and useful. Use only supplied facts. Do not add facts, rankings, prices, safety claims, or guarantees. Return JSON with title and summary only.',
        }, {
          role: 'user',
          content: JSON.stringify({
            title: card.title,
            summary: card.summary,
            fitReasons: card.fitReasons,
            tradeoffs: card.tradeoffs,
          }).slice(0, 4_000),
        }],
      }),
      signal,
    });
    if (!response.ok) return card;
    const body = await response.json().catch(() => ({})) as Json;
    const choice = record(Array.isArray(body.choices) ? body.choices[0] : undefined);
    const content = record(choice.message).content;
    if (typeof content !== 'string') return card;
    const copy = record(JSON.parse(content));
    const title = typeof copy.title === 'string' ? copy.title.trim().slice(0, 240) : '';
    const summary = typeof copy.summary === 'string' ? copy.summary.trim().slice(0, 800) : '';
    return title && summary ? { ...card, title, summary } : card;
  } catch {
    return card;
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405);
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Authentication required' }, 401);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return response({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, 400);
  const input = parsed.data;

  const url = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const userClient = createClient<any>(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient<any>(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData } = await userClient.auth.getUser();
  const user = authData.user;
  if (!user) return response({ error: 'Authentication required' }, 401);

  const [preferenceResult, signalResult, savedResult, privacyResult] = await Promise.all([
    service.from('user_preferences').select('preferences').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1),
    service.from('user_preference_signals')
      .select('subject_type,subject_key,score,confidence,last_observed_at')
      .eq('user_id', user.id)
      .gte('last_observed_at', new Date(Date.now() - 180 * 24 * 60 * 60_000).toISOString())
      .order('confidence', { ascending: false })
      .limit(30),
    service.from('saved_destinations').select('destination_slug').eq('user_id', user.id).limit(30),
    service.from('user_privacy_settings').select('personalization_enabled').eq('user_id', user.id).maybeSingle(),
  ]);
  const profile = record(preferenceResult.data?.[0]?.preferences);
  let tripRow: Json | undefined;
  if (input.tripId) {
    const { data } = await userClient
      .from('trips')
      .select('id,destination_slug,start_date,end_date,traveler_count,glamour_level,payload')
      .eq('id', input.tripId)
      .maybeSingle();
    if (!data) return response({ error: 'Trip unavailable' }, 403);
    tripRow = data as Json;
  }
  const tripPayload = record(tripRow?.payload);
  const planning = record(tripPayload.planningPreferences);
  const freshSignalRows = filterFreshPreferenceSignals((signalResult.data ?? []).map((row) => ({
    ...row,
    lastObservedAt: String(row.last_observed_at ?? ''),
  })));
  const inferred = privacyResult.data?.personalization_enabled === false ? [] : freshSignalRows.flatMap((row) => {
    if (!['destination', 'destination_region', 'activity_category', 'pace', 'provider'].includes(row.subject_type)) return [];
    return [{
      subjectType: row.subject_type as PersonalizationContext['inferred'][number]['subjectType'],
      subjectKey: String(row.subject_key),
      score: Math.max(-1, Math.min(1, Number(row.score))),
      confidence: Math.max(0, Math.min(1, Number(row.confidence))),
    }];
  });
  const explicit = {
    interests: strings(tripPayload.interests).length ? strings(tripPayload.interests) : strings(profile.defaultInterests),
    tripGoals: strings(planning.goals).length ? strings(planning.goals) : strings(profile.defaultTripGoals),
    vacationStyles: strings(planning.vacationStyles).length ? strings(planning.vacationStyles) : strings(profile.defaultVacationStyles),
    preferredMonths: Array.isArray(profile.preferredTravelMonths)
      ? profile.preferredTravelMonths.filter((item): item is number => typeof item === 'number')
      : [],
    departureAirports: Array.isArray(profile.homeAirports)
      ? profile.homeAirports.flatMap((item) => {
          const airport = record(item);
          return typeof airport.iata === 'string' ? [airport.iata.toUpperCase()] : [];
        }).slice(0, 6)
      : [],
    homeCountryCodes: Array.isArray(profile.homeAirports)
      ? [...new Set(profile.homeAirports.flatMap((item) => {
          const airport = record(item);
          return typeof airport.countryCode === 'string' && /^[A-Za-z]{2}$/.test(airport.countryCode)
            ? [airport.countryCode.toUpperCase()]
            : [];
        }))].slice(0, 6)
      : [],
    preferredTravelRanges: strings(tripPayload.travelRanges).length
      ? strings(tripPayload.travelRanges)
      : strings(profile.preferredTravelRanges),
    transportModes: strings(profile.longDistanceTransportModes),
    ...(typeof profile.maxTravelTimeHours === 'number' ? { maxTravelTimeHours: profile.maxTravelTimeHours } : {}),
    ...(['domestic', 'international', 'either'].includes(String(profile.travelScope))
      ? { travelScope: profile.travelScope as 'domestic' | 'international' | 'either' }
      : {}),
    ...(typeof tripRow?.glamour_level === 'string' ? { budgetLevel: tripRow.glamour_level } : {}),
    ...(typeof profile.defaultTripLengthDays === 'number' ? { tripLengthDays: profile.defaultTripLengthDays } : {}),
    ...(typeof tripRow?.traveler_count === 'number'
      ? { groupSize: tripRow.traveler_count }
      : typeof profile.defaultGroupSize === 'number' ? { groupSize: profile.defaultGroupSize } : {}),
    ...(typeof planning.dayRhythm === 'string'
      ? { dayRhythm: planning.dayRhythm }
      : typeof profile.defaultDayRhythm === 'string' ? { dayRhythm: profile.defaultDayRhythm } : {}),
    ...(typeof tripPayload.activityPace === 'string' ? { activityPace: tripPayload.activityPace } : {}),
    mealPreferences: strings(planning.mealPreferences).length ? strings(planning.mealPreferences) : strings(profile.defaultMealPreferences),
    avoidances: strings(planning.avoidances).length ? strings(planning.avoidances) : strings(profile.defaultAvoidances),
    accessibilityNeeds: strings(planning.accessibilityNeeds).length
      ? strings(planning.accessibilityNeeds)
      : strings(profile.accessibilityNeeds),
    ...(typeof tripPayload.lgbtqSafetyPriority === 'number' ? { lgbtqSafetyPriority: Math.max(0, Math.min(1, tripPayload.lgbtqSafetyPriority)) } : {}),
    ...(typeof tripPayload.nightlifeImportance === 'number' ? { nightlifeImportance: Math.max(0, Math.min(1, tripPayload.nightlifeImportance)) } : {}),
  };
  const baseContext = {
    version: 'v1' as const,
    explicit,
    inferred,
    savedDestinationSlugs: (savedResult.data ?? []).map((row) => row.destination_slug).filter(Boolean),
    ...(tripRow ? {
      trip: {
        tripId: String(tripRow.id),
        ...(typeof tripRow.destination_slug === 'string' ? { destinationSlug: tripRow.destination_slug } : {}),
        ...(typeof tripRow.start_date === 'string' ? { startDate: tripRow.start_date } : {}),
        ...(typeof tripRow.end_date === 'string' ? { endDate: tripRow.end_date } : {}),
        travelerCount: typeof tripRow.traveler_count === 'number' ? tripRow.traveler_count : 1,
        interests: strings(tripPayload.interests),
        ...(typeof tripPayload.activityPace === 'string' ? { activityPace: tripPayload.activityPace } : {}),
        ...(groupPreferenceSummary(tripPayload.memberPrefs) ? { groupPreferenceSummary: groupPreferenceSummary(tripPayload.memberPrefs) } : {}),
      },
    } : {}),
    explanationSignals: [
      ...(explicit.interests.length ? [`Interests: ${explicit.interests.slice(0, 3).join(', ')}`] : []),
      ...(inferred.some((item) => item.confidence >= 0.6) ? ['Recent saves and feedback'] : []),
    ],
  };
  const context: PersonalizationContext = {
    ...baseContext,
    contextFingerprint: await hash({
      ...baseContext,
      surface: input.surface,
      destinationSlug: input.destinationSlug ?? null,
      tripId: input.tripId ?? null,
      intent: input.intent,
      intentState: input.intent.kind === 'audit'
        ? record(tripPayload.tripPlan)
        : input.intent.kind === 'group'
          ? { memberPrefs: tripPayload.memberPrefs, polls: tripPayload.polls }
          : null,
    }),
  };
  const decisionKey = input.intent.kind === 'screen'
    ? 'screen'
    : `${input.intent.kind}:${(await hash(input.intent)).slice(0, 24)}`;
  const now = new Date().toISOString();

  if (!input.force) {
    let cachedQuery = service.from('assistant_insights')
      .select('*')
      .eq('user_id', user.id)
      .eq('surface', input.surface)
      .eq('decision_key', decisionKey)
      .eq('context_fingerprint', context.contextFingerprint)
      .eq('status', 'active')
      .gt('expires_at', now);
    cachedQuery = input.destinationSlug ? cachedQuery.eq('destination_slug', input.destinationSlug) : cachedQuery.is('destination_slug', null);
    cachedQuery = input.tripId ? cachedQuery.eq('trip_id', input.tripId) : cachedQuery.is('trip_id', null);
    const { data: cached } = await cachedQuery.order('generated_at', { ascending: false });
    if (cached?.length) return response({ insights: cached.map((row) => formatInsight(row as Json)), cached: true });
  }

  const { data: destinationRows } = await service
    .from('destinations')
    .select('slug,name,country,editorial_summary,payload,data_freshness')
    .eq('published', true)
    .limit(250);
  const communitySignals: CommunitySignal[] = enabled('AI_ENABLE_COMMUNITY_SIGNALS')
    ? ((await service.from('community_recommendation_aggregates')
        .select('subject_type,subject_key,distinct_users,score')
        .limit(500)).data ?? []).flatMap((row: Json) => {
          if (!['destination', 'activity_category', 'provider'].includes(String(row.subject_type))) return [];
          return [{
            subjectType: String(row.subject_type) as CommunitySignal['subjectType'],
            subjectKey: String(row.subject_key),
            distinctUsers: Number(row.distinct_users),
            score: Number(row.score),
          }];
        })
    : [];
  const semanticSlugs = input.intent.kind === 'search'
    ? await semanticDestinationSlugs(service, input.intent.search.query, request.signal)
    : [];
  const searchableRows = semanticSlugs.length
    ? (destinationRows ?? []).filter((row) => semanticSlugs.includes(String(row.slug)))
    : destinationRows ?? [];
  const searchHardConstraints = input.intent.kind === 'search' ? input.intent.search.hardConstraints : [];
  const rankingContext: PersonalizationContext = input.intent.kind === 'search'
    ? {
        ...context,
        explicit: {
          ...context.explicit,
          ...(input.intent.search.budgetLevel ? { budgetLevel: input.intent.search.budgetLevel } : {}),
          accessibilityNeeds: [
            ...context.explicit.accessibilityNeeds,
            ...(searchHardConstraints.some((item) => /wheelchair/i.test(item)) ? ['wheelchair access'] : []),
          ],
          avoidances: [
            ...context.explicit.avoidances,
            ...searchHardConstraints.flatMap((item) => {
              const match = item.match(/^avoid:\s*(.+)$/i);
              return match?.[1] ? [match[1]] : [];
            }),
          ],
        },
      }
    : context;
  const ranked = rankDestinationRows(searchableRows as Json[], rankingContext, {
    interests: input.intent.kind === 'search' ? input.intent.search.interests : undefined,
    month: input.intent.kind === 'search' ? input.intent.search.month : undefined,
    limit: 6,
    communitySignals,
  });
  const generatedAt = new Date().toISOString();
  const ttlHours = input.surface === 'home' ? 24 : input.surface === 'destination' ? 12 : 6;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60_000).toISOString();
  const drafts: Array<{
    kind: string;
    title: string;
    summary: string;
    recommendations: Json[];
    prompts: string[];
    decisionCard?: Json;
    comparison?: Json;
    audit?: Json;
    relaxations?: Json[];
  }> = [];

  if (input.intent.kind === 'compare') {
    const comparison = input.intent.entityKind === 'destination'
      ? compareDestinationRows(
          (destinationRows ?? []) as Json[],
          context,
          input.intent.optionIds,
          generatedAt,
          communitySignals,
        )
      : undefined;
    if (comparison) {
      const top = comparison.options[0]!;
      drafts.push({
        kind: 'comparison',
        title: `${top.title} leads this comparison`,
        summary: comparison.recommendation,
        recommendations: comparison.options,
        prompts: [`What tradeoff matters most between ${comparison.options.map((item) => item.title).join(' and ')}?`],
        comparison: comparison as unknown as Json,
        decisionCard: {
          version: 'v1',
          id: `comparison-${await hash(input.intent.optionIds)}`,
          kind: 'comparison',
          title: `${top.title} is the strongest current fit`,
          summary: comparison.recommendation,
          fitReasons: top.fitReasons,
          tradeoffs: comparison.tradeoffs.slice(0, 4),
          sourceIds: comparison.sourceIds,
          confidence: comparison.confidence,
          sourceFreshness: 'cached',
          generatedAt,
          action: { type: 'open_destination', value: top.destinationSlug, label: `Open ${top.title}` },
        },
      });
    }
  } else if (input.intent.kind === 'audit' && tripRow) {
    const audit = auditTripRow(tripRow, generatedAt);
    const primaryIssue = audit.issues.find((issue) => issue.severity === 'blocking') ?? audit.issues[0];
    drafts.push({
      kind: 'trip_audit',
      title: audit.score >= 90 ? 'Your plan is in good shape' : `${audit.issues.length} checks before this plan is ready`,
      summary: audit.summary,
      recommendations: [],
      prompts: primaryIssue ? [`Help me resolve: ${primaryIssue.title}`] : ['Where could this itinerary use more breathing room?'],
      audit: audit as unknown as Json,
      decisionCard: {
        version: 'v1',
        id: `trip-audit-${String(tripRow.id)}`,
        kind: 'trip_audit',
        title: audit.score >= 90 ? 'Plan health looks strong' : `Plan health: ${audit.score}/100`,
        summary: primaryIssue?.summary ?? audit.summary,
        fitReasons: audit.issues.length ? [] : ['No timing, pace, avoidance, or reservation conflicts found'],
        tradeoffs: audit.issues.slice(0, 4).map((issue) => issue.title),
        sourceIds: audit.sourceIds,
        confidence: daysConfidence(tripRow),
        sourceFreshness: 'recent',
        generatedAt,
        action: { type: 'ask_follow_up', value: primaryIssue ? `Help me fix ${primaryIssue.title}` : 'How can I improve this itinerary?', label: 'Review with Ask Outing' },
      },
    });
  } else if (input.intent.kind === 'group' && tripRow) {
    const group = groupPreferenceSummary(record(record(tripRow.payload)).memberPrefs);
    const shared = group?.sharedInterests ?? [];
    const popular = group?.popularInterests ?? [];
    const tripPayloadValue = record(tripRow.payload);
    const polls = Array.isArray(tripPayloadValue.polls) ? tripPayloadValue.polls.map(record) : [];
    const unresolved = polls.filter((poll) => !poll.resolution).length;
    const summary = shared.length
      ? `The group aligns most clearly around ${shared.slice(0, 3).join(', ')}${unresolved ? `, with ${unresolved} open ${unresolved === 1 ? 'decision' : 'decisions'}` : ''}.`
      : `The group has different priorities${popular.length ? ` across ${popular.slice(0, 3).join(', ')}` : ''}; compare anchor options before filling free time.`;
    drafts.push({
      kind: 'group_brief',
      title: shared.length ? 'Where the group agrees' : 'A decision worth making together',
      summary,
      recommendations: [],
      prompts: ['Give us three group anchor options and explain the tradeoffs', 'Suggest solo ideas only inside our free windows'],
      decisionCard: {
        version: 'v1',
        id: `group-brief-${String(tripRow.id)}`,
        kind: 'group_brief',
        title: shared.length ? 'Build around your shared interests' : 'Resolve the anchor before filling the day',
        summary,
        fitReasons: shared.slice(0, 4).map((interest) => `Shared interest: ${interest}`),
        tradeoffs: popular.filter((interest) => !shared.includes(interest)).slice(0, 4).map((interest) => `Not everyone prioritized ${interest}`),
        sourceIds: ['outing-trip'],
        confidence: group ? 0.78 : 0.45,
        sourceFreshness: 'recent',
        generatedAt,
        action: { type: 'ask_follow_up', value: 'Give us three group anchor options for our next open window', label: 'Compare group options' },
      },
    });
  } else if (input.intent.kind === 'search') {
    const relaxations = safeConstraintRelaxations({
      query: input.intent.search.query,
      resultCount: ranked.length,
      hasDates: input.intent.search.month !== undefined,
      hasBudget: input.intent.search.budgetLevel !== undefined,
      hasDestinationHint: input.intent.search.destinationHint !== undefined,
    });
    const top = ranked[0];
    drafts.push({
      kind: 'decision_brief',
      title: top ? `${top.title} fits this search best` : 'Outing needs a little more room',
      summary: top
        ? `${top.fitScore}% fit after applying your visible filters and keeping hard requirements fixed.`
        : 'No reviewed destination currently satisfies this search and your explicit requirements.',
      recommendations: ranked,
      prompts: top ? [`Compare ${top.title} with the next two options`] : ['Help me adjust this search without changing my hard requirements'],
      relaxations,
      decisionCard: {
        version: 'v1',
        id: `search-brief-${await hash(input.intent.search)}`,
        kind: 'decision_brief',
        title: top ? `${top.title} rises to the top` : 'No strong match yet',
        summary: top?.summary ?? 'Outing will only broaden dates, location, or budget after you approve the change.',
        fitReasons: top?.fitReasons ?? [],
        tradeoffs: top?.tradeoffs ?? ['The current catalog has limited matching evidence'],
        sourceIds: top?.sourceIds ?? ['outing-catalog'],
        confidence: top?.confidence ?? 0.35,
        sourceFreshness: semanticSlugs.length ? 'recent' : 'cached',
        generatedAt,
        ...(top ? { action: { type: 'open_destination', value: top.destinationSlug, label: `Open ${top.title}` } } : {}),
      },
    });
    if (relaxations.length) drafts.push({
      kind: 'search_relaxation',
      title: 'Ways to broaden this search',
      summary: 'These changes affect only one flexible dimension. Your accessibility, safety, and avoidance requirements stay fixed.',
      recommendations: [],
      prompts: [],
      relaxations,
    });
  } else if (input.surface === 'home') {
    drafts.push({
      kind: 'destination_matches',
      title: 'Places that fit you now',
      summary: 'Ranked from your questionnaire, saved places, and recent planning feedback.',
      recommendations: ranked.slice(0, 3),
      prompts: [],
    });
    const timingDestination = ranked[0];
    if (timingDestination) {
      drafts.unshift({
        kind: 'decision_brief',
        title: `${timingDestination.title} is your clearest next decision`,
        summary: `${timingDestination.fitScore}% fit from your stated preferences, timing, and current catalog evidence.`,
        recommendations: [timingDestination],
        prompts: [`Compare ${timingDestination.title} with two alternatives before I plan`],
        decisionCard: {
          version: 'v1',
          id: `home-brief-${timingDestination.destinationSlug}`,
          kind: 'decision_brief',
          title: `${timingDestination.title} fits where you are now`,
          summary: timingDestination.summary,
          fitReasons: timingDestination.fitReasons,
          tradeoffs: timingDestination.tradeoffs,
          sourceIds: timingDestination.sourceIds,
          confidence: timingDestination.confidence,
          sourceFreshness: 'cached',
          generatedAt,
          action: { type: 'open_destination', value: timingDestination.destinationSlug, label: `Explore ${timingDestination.title}` },
        },
      });
      drafts.push({
        kind: 'timing',
        title: `A stronger window for ${timingDestination.title}`,
        summary: timingDestination.fitReasons.find((reason) => reason.toLowerCase().includes('season'))
          ?? 'Ask Outing to compare seasonal fit, events, and any available fare observations before choosing dates.',
        recommendations: [timingDestination],
        prompts: [`When should I visit ${timingDestination.title} for the best value and things to do?`],
      });
    }
  } else if (input.surface === 'ask') {
    drafts.push({
      kind: 'starter_prompts',
      title: 'Start with what matters now',
      summary: 'These questions use your current preferences and saved destinations.',
      recommendations: ranked.slice(0, 3),
      prompts: dynamicStarterPrompts(context, 'general'),
    });
  } else if (input.surface === 'destination') {
    const destination = ranked.find((item) => item.destinationSlug === input.destinationSlug);
    drafts.push({
      kind: 'destination_matches',
      title: destination ? `${destination.fitScore}% fit for you` : 'Your fit for this destination',
      summary: destination?.fitReasons.join(' · ') || 'Outing needs more preference or catalog data to score this destination.',
      recommendations: destination ? [destination] : [],
      prompts: [`What should I prioritize in ${destination?.title ?? input.destinationSlug}?`],
    });
    if (destination) drafts.unshift({
      kind: 'decision_brief',
      title: `What matters for your ${destination.title} decision`,
      summary: `${destination.fitScore}% fit based on your current travel profile.`,
      recommendations: [destination],
      prompts: [`What are the strongest tradeoffs for me in ${destination.title}?`],
      decisionCard: {
        version: 'v1',
        id: `destination-brief-${destination.destinationSlug}`,
        kind: 'decision_brief',
        title: `${destination.fitScore}% fit for you`,
        summary: destination.summary,
        fitReasons: destination.fitReasons,
        tradeoffs: destination.tradeoffs,
        sourceIds: destination.sourceIds,
        confidence: destination.confidence,
        sourceFreshness: 'cached',
        generatedAt,
        action: { type: 'ask_follow_up', value: `What should I know before choosing ${destination.title}?`, label: 'Ask about the tradeoffs' },
      },
    });
  } else {
    const tripDestination = (destinationRows ?? []).find((row) => row.slug === tripRow?.destination_slug) as Json | undefined;
    const catalog = record(record(tripDestination?.payload).scoring).catalog
      ? record(record(record(tripDestination?.payload).scoring).catalog)
      : record(tripDestination?.payload);
    const places = Array.isArray(catalog.places) ? catalog.places as Json[] : [];
    const matchedPlaces = [...places]
      .map((place) => ({ place, fitScore: scoreCatalogPlace(place, context) }))
      .sort((left, right) => right.fitScore - left.fitScore)
      .slice(0, 3);
    const activityRecommendations = matchedPlaces.map(({ place, fitScore }, index) => ({
      id: `trip-place-${String(place.id ?? index)}`,
      kind: 'itinerary_option',
      title: String(place.name ?? 'Activity option'),
      summary: String(place.summary ?? 'A possible group anchor activity.'),
      fitScore,
      fitReasons: [
        'Fits an open group window',
        ...(typeof place.category === 'string' && explicit.interests.includes(place.category) ? [`Matches the group’s interest in ${place.category}`] : []),
        ...(typeof place.lgbtqRelevance === 'string' ? [place.lgbtqRelevance] : []),
      ].slice(0, 3),
      tradeoffs: ['Confirm current hours and group availability'],
      sourceIds: ['outing-catalog'],
      confidence: 0.7,
      provisional: false,
      bookable: false,
      action: { type: 'ask_follow_up', value: `Compare ${String(place.name ?? 'this activity')} with two alternatives for our group` },
    }));
    drafts.push({
      kind: 'activity_options',
      title: 'Three ways to anchor an open window',
      summary: 'Keep the group together for one anchor, then use surrounding free time for solo or partial-group ideas.',
      recommendations: activityRecommendations,
      prompts: dynamicStarterPrompts(context, 'trip'),
    });
  }

  const primaryDecisionDraft = drafts.find((draft) => draft.decisionCard);
  if (primaryDecisionDraft?.decisionCard) {
    primaryDecisionDraft.decisionCard = await polishDecisionCard(primaryDecisionDraft.decisionCard, request.signal);
    primaryDecisionDraft.title = String(primaryDecisionDraft.decisionCard.title ?? primaryDecisionDraft.title);
    primaryDecisionDraft.summary = String(primaryDecisionDraft.decisionCard.summary ?? primaryDecisionDraft.summary);
  }
  if (request.signal.aborted) return response({ error: 'Request cancelled' }, 499);

  await service.from('assistant_insights').update({ status: 'expired', updated_at: generatedAt })
    .eq('user_id', user.id).eq('surface', input.surface).eq('decision_key', decisionKey).eq('status', 'active');
  const rows = drafts.map((draft) => ({
    user_id: user.id,
    trip_id: input.tripId ?? null,
    destination_slug: input.destinationSlug ?? null,
    surface: input.surface,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    payload: {
      recommendations: draft.recommendations,
      prompts: draft.prompts,
      ...(draft.decisionCard ? { decisionCard: draft.decisionCard } : {}),
      ...(draft.comparison ? { comparison: draft.comparison } : {}),
      ...(draft.audit ? { audit: draft.audit } : {}),
      relaxations: draft.relaxations ?? [],
    },
    payload_version: 'v1',
    source_freshness: String(draft.decisionCard?.sourceFreshness ?? 'cached'),
    decision_key: decisionKey,
    context_fingerprint: context.contextFingerprint,
    status: 'active',
    generated_at: generatedAt,
    expires_at: expiresAt,
  }));
  const { data: inserted, error: insertError } = await service.from('assistant_insights').insert(rows).select('*');
  if (insertError) return response({ error: 'Could not cache assistant insights' }, 500);
  await service.from('assistant_insight_jobs').upsert({
    user_id: user.id,
    trip_id: input.tripId ?? null,
    destination_slug: input.destinationSlug ?? null,
    trigger: input.trigger,
    context_fingerprint: context.contextFingerprint,
    status: 'complete',
    attempts: 1,
    updated_at: generatedAt,
  }, { onConflict: 'user_id,trigger,context_fingerprint' });
  return response({ insights: (inserted ?? []).map((row) => formatInsight(row as Json)), cached: false });
});
