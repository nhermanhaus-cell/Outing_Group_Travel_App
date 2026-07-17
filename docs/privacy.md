# Privacy notes

- Optional identity considerations in the quiz are skippable and not sent to analytics by default
- **No scraping** of gay travel blogs or dating apps — blogs are inspiration + further-reading attribution only; place blurbs are original editorial
- Public LGBTQ+/travel datasets (OSM, ILGA, Wikidata, government advisories, Equaldex-cited scores) are loaded via fixture-first providers with attribution; see [`docs/providers.md`](providers.md)
- Lodging address / Airbnb links on a trip are **trip-private** and must not appear in public trip payloads
- Affiliate outing links (Viator / GetYourGuide) should be disclosed when shown; booking happens on partner sites — Gay-i may earn a commission
- Google Places Nearby / Geocoding keys used in the Expo client should be **API-restricted** (bundle ID / app restriction). Prefer `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` or `app.config.js` extra injection
- Viator Affiliate keys in the client are a temporary MVP bridge; prefer a server proxy before production scale
- No precise real-time location storage by default
- Do not reveal that a specific person is in a destination without consent
- Distinguish editorial, community, AI summary, estimated, and live data in UI
- Never claim a place is universally “safe”
- Account deletion / export are wired as settings placeholders for MVP; implement against Supabase when auth is live
- Public/link-only trips must use `toTripPublicPayload` stripping sensitive fields
- Trip invite deep links use `gayi://trips/{id}/invite` (no public HTTPS OG pages in MVP)
- Google Maps export opens Maps URLs only — Gay-i cannot create collaborative Google Saved Lists via API
