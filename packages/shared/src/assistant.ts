import { z } from 'zod';

export const assistantScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('general') }),
  z.object({ kind: z.literal('destination'), destinationSlug: z.string().min(1).max(120) }),
  z.object({ kind: z.literal('trip'), tripId: z.string().uuid() }),
]);

export type AssistantScope = z.infer<typeof assistantScopeSchema>;

export const conversationVisibilitySchema = z.enum(['private', 'trip_shared']);
export type ConversationVisibility = z.infer<typeof conversationVisibilitySchema>;

export const assistantSourceSchema = z.object({
  id: z.string().min(1),
  provider: z.enum([
    'outing',
    'google_places',
    'ticketmaster',
    'open_meteo',
    'skyscanner',
    'viator',
  ]),
  label: z.string().min(1).max(240),
  url: z.string().url().optional(),
  retrievedAt: z.string().datetime(),
});

export type AssistantSource = z.infer<typeof assistantSourceSchema>;

export const proposalKindSchema = z.enum([
  'add_itinerary_item',
  'replace_itinerary_item',
  'remove_itinerary_item',
  'change_dates',
  'save_destination',
]);

export type AssistantProposalKind = z.infer<typeof proposalKindSchema>;

export const assistantProposalPayloadSchema = z.object({
  dayId: z.string().max(120).optional(),
  itemId: z.string().max(120).optional(),
  title: z.string().max(240).optional(),
  placeId: z.string().max(240).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  destinationSlug: z.string().max(120).optional(),
  notes: z.string().max(800).optional(),
}).strict();

export type AssistantProposalPayload = z.infer<typeof assistantProposalPayloadSchema>;

export const assistantProposalSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  tripId: z.string().uuid().nullable(),
  kind: proposalKindSchema,
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(800),
  payload: assistantProposalPayloadSchema,
  status: z.enum(['proposed', 'polling', 'applied', 'dismissed']),
  sources: z.array(assistantSourceSchema).max(12),
  createdAt: z.string().datetime(),
});

export type AssistantProposal = z.infer<typeof assistantProposalSchema>;

export const assistantStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: z.string().uuid(), messageId: z.string().uuid() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('sources'), sources: z.array(assistantSourceSchema) }),
  z.object({ type: z.literal('proposal'), proposal: assistantProposalSchema }),
  z.object({ type: z.literal('done'), durationMs: z.number().nonnegative() }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);

export type AssistantStreamEvent = z.infer<typeof assistantStreamEventSchema>;

export const assistantRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  scope: assistantScopeSchema,
  visibility: conversationVisibilitySchema,
  message: z.string().trim().min(1).max(4_000),
  evaluationProvider: z.enum(['mistral', 'qwen']).optional(),
}).superRefine((value, ctx) => {
  if (value.visibility === 'trip_shared' && value.scope.kind !== 'trip') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['visibility'],
      message: 'Shared conversations must belong to a trip.',
    });
  }
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

export interface ProposalVote {
  userId: string;
  choice: 'accept' | 'dismiss';
}

export interface ProposalDecision {
  result: 'accepted' | 'dismissed' | 'pending' | 'tie';
  accepts: number;
  dismisses: number;
  remaining: number;
}

export function decideProposalVote(input: {
  memberIds: string[];
  votes: ProposalVote[];
  organizerChoice?: 'accept' | 'dismiss';
}): ProposalDecision {
  const members = new Set(input.memberIds);
  const latest = new Map<string, ProposalVote['choice']>();
  for (const vote of input.votes) {
    if (members.has(vote.userId)) latest.set(vote.userId, vote.choice);
  }
  const accepts = [...latest.values()].filter((choice) => choice === 'accept').length;
  const dismisses = [...latest.values()].filter((choice) => choice === 'dismiss').length;
  const remaining = Math.max(0, members.size - latest.size);
  const majority = Math.floor(members.size / 2) + 1;

  if (accepts >= majority) return { result: 'accepted', accepts, dismisses, remaining };
  if (dismisses >= majority) return { result: 'dismissed', accepts, dismisses, remaining };
  if (remaining > 0) return { result: 'pending', accepts, dismisses, remaining };
  if (accepts === dismisses) {
    return {
      result: input.organizerChoice
        ? input.organizerChoice === 'accept' ? 'accepted' : 'dismissed'
        : 'tie',
      accepts,
      dismisses,
      remaining,
    };
  }
  return { result: accepts > dismisses ? 'accepted' : 'dismissed', accepts, dismisses, remaining };
}

export function canAccessAssistantConversation(input: {
  userId: string;
  ownerId: string;
  visibility: ConversationVisibility;
  isTripMember: boolean;
}): boolean {
  return input.userId === input.ownerId ||
    (input.visibility === 'trip_shared' && input.isTripMember);
}
