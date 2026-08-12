# Destination catalog expansion

Outing's bundled catalog contains 60 destinations: the original 18 published records and 42 review-gated additions. The additions are visible only when `EXPO_PUBLIC_FEATURE_CATALOG_EXPANSION_V1=true`; they are not sent to the public Supabase catalog until they pass provider validation and human review.

## Author and validate

Edit compact authoring records in `fixtures/catalog/destination-expansion.mjs`, then regenerate and validate:

```bash
pnpm seed:expand-catalog
pnpm catalog:validate
```

The generator also creates the lightweight scoring fallback. It joins scoring and detail data by slug instead of embedding a duplicate catalog payload.

## Hydrate Google Places and Pexels

Keep `GOOGLE_PLACES_API_KEY` and `PEXELS_API_KEY` in the repository root `.env`; neither value may use an `EXPO_PUBLIC_` prefix. Preview the work without network calls:

```bash
pnpm catalog:hydrate -- --wave=lgbtq_priority
```

After confirming the server-side Google key can call Places API (New), apply one wave:

```bash
pnpm catalog:hydrate -- --wave=lgbtq_priority --apply
pnpm seed:expand-catalog
pnpm catalog:validate
```

Hydration writes `fixtures/catalog/destination-provider-enrichment.json`. Inspect every identity match, venue, hero image, and place-specific image. A location fallback is recorded only when a credible place-specific Pexels result is unavailable.

## Editorial review and publication

For each destination:

1. Verify the city, island, or resort-area identity and every venue's operating status.
2. Verify both event dates against organizer sources and change `scheduleStatus` to `verified` in reviewed data.
3. Review legal context against at least one authoritative human-rights, government, or local advocacy source plus a second current source.
4. Confirm that advisory language distinguishes law, enforcement, and local experience and never makes universal safety claims.
5. Confirm image relevance and accessibility notes.
6. Record `catalogFreshness` timestamps for legal context, venues, events, pricing, and climate.
7. Set the author record's `publicationStatus` to `published` and its `editorialReview` fields to approved only after review is complete.

The release gate must pass before any remote write:

```bash
pnpm catalog:validate:publish -- --wave=lgbtq_priority
pnpm db:publish-catalog -- --dry-run
```

Once the full wave passes, publish and re-index changed knowledge chunks:

```bash
pnpm db:publish-catalog
pnpm db:index-assistant
```

Release `lgbtq_priority` first. Keep `global_popular` gated until the first wave's search coverage, saves, trip starts, and empty-result metrics have been reviewed.
