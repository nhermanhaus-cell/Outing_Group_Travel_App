import type { AssistantProposal } from '@gayi/shared';

export interface ProposalTripTarget {
  startDate?: string;
  endDate?: string;
  itineraryItems?: Array<Record<string, unknown>>;
}

export function applyAssistantProposalToTrip<T extends ProposalTripTarget>(
  trip: T,
  proposal: AssistantProposal,
): Partial<T> {
  const payload = proposal.payload;
  if (proposal.kind === 'change_dates') {
    return {
      ...(payload.startDate ? { startDate: payload.startDate } : {}),
      ...(payload.endDate ? { endDate: payload.endDate } : {}),
    } as Partial<T>;
  }

  const current = trip.itineraryItems ?? [];
  if (proposal.kind === 'remove_itinerary_item') {
    return {
      itineraryItems: current.filter((item) =>
        String(item.itemId ?? item.id ?? '') !== payload.itemId),
    } as Partial<T>;
  }

  const nextItem: Record<string, unknown> = {
    itemId: payload.itemId ?? `assistant-${proposal.id}`,
    id: payload.itemId ?? `assistant-${proposal.id}`,
    title: payload.title ?? proposal.title,
    placeId: payload.placeId,
    startAt: payload.startAt,
    endAt: payload.endAt,
    dayId: payload.dayId,
    notes: payload.notes,
    source: 'assistant_proposal',
    proposalId: proposal.id,
  };

  if (proposal.kind === 'replace_itinerary_item') {
    return {
      itineraryItems: current.map((item) =>
        String(item.itemId ?? item.id ?? '') === payload.itemId
          ? { ...item, ...nextItem }
          : item),
    } as Partial<T>;
  }

  if (proposal.kind === 'add_itinerary_item') {
    return { itineraryItems: [...current, nextItem] } as Partial<T>;
  }

  return {};
}
