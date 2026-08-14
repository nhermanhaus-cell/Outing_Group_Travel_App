import type { AssistantProposal } from '@gayi/shared';
import type { ItineraryItem, TripPlan } from '@gayi/domain';

export interface ProposalTripTarget {
  startDate?: string;
  endDate?: string;
  itineraryItems?: Array<Record<string, unknown>>;
  tripPlan?: TripPlan;
}

export interface AssistantProposalPlaceResolution {
  placeId: string;
  title: string;
  category: string;
  coords: { lat: number; lng: number };
  address?: string;
  estimatedCost?: number;
  rating?: number;
}

function matchesItem(item: ItineraryItem, itemId: string): boolean {
  return item.itemId === itemId || item.placeId === itemId || `${item.day}-${item.placeId}-${item.time}` === itemId;
}

function replacePlanItem(
  plan: TripPlan,
  itemId: string,
  proposal: AssistantProposal,
  place?: AssistantProposalPlaceResolution,
): TripPlan {
  const payload = proposal.payload;
  return {
    ...plan,
    revision: plan.revision + 1,
    generatedAt: new Date().toISOString(),
    items: plan.items.map((item) => matchesItem(item, itemId) ? {
      ...item,
      title: place?.title ?? payload.title ?? proposal.title,
      summary: place?.address ?? payload.notes ?? proposal.summary,
      placeId: place?.placeId ?? payload.placeId ?? item.placeId,
      category: place?.category ?? payload.category ?? item.category,
      ...(place ? { coords: place.coords } : payload.lat !== undefined && payload.lng !== undefined ? { coords: { lat: payload.lat, lng: payload.lng } } : {}),
      ...(place?.estimatedCost !== undefined ? { estimatedCost: place.estimatedCost } : payload.estimatedCost !== undefined ? { estimatedCost: payload.estimatedCost } : {}),
      source: place || (payload.lat !== undefined && payload.lng !== undefined) ? 'google_places' : 'assistant_proposal',
      confidence: place?.rating ? Math.min(0.98, 0.65 + place.rating / 20) : Math.max(item.confidence, 0.75),
      whySelected: 'Chosen by you from Ask Outing recommendations.',
      kind: 'place' as const,
      locked: true,
      scheduleStatus: place || (payload.lat !== undefined && payload.lng !== undefined) ? 'verified' as const : 'estimated' as const,
      ...(payload.startAt ? { startsAt: payload.startAt } : {}),
      ...(payload.endAt ? { endsAt: payload.endAt } : {}),
    } : item),
  };
}

export function applyAssistantProposalToTrip<T extends ProposalTripTarget>(
  trip: T,
  proposal: AssistantProposal,
  place?: AssistantProposalPlaceResolution,
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
    if (trip.tripPlan && payload.itemId) {
      const tripPlan = replacePlanItem(trip.tripPlan, payload.itemId, proposal, place);
      return {
        tripPlan,
        itineraryItems: tripPlan.items as unknown as Array<Record<string, unknown>>,
      } as Partial<T>;
    }
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
