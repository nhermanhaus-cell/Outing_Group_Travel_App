-- Let traveler-initiated itinerary edits use the existing review-and-vote pipeline.
alter table public.trip_plan_proposals
  drop constraint if exists trip_plan_proposals_proposal_kind_check;

alter table public.trip_plan_proposals
  add constraint trip_plan_proposals_proposal_kind_check
  check (proposal_kind in ('day_rework', 'item_edit', 'assistant_change', 'audit_fix'));
