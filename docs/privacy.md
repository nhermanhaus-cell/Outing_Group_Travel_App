# Privacy notes

- **No scraping** of gay travel blogs or dating apps — blogs are inspiration + further-reading attribution only; place blurbs are original editorial
- Public LGBTQ+/travel datasets (OSM, ILGA, Wikidata, government advisories, Equaldex-cited scores) are loaded via fixture-first providers with attribution; see [`docs/providers.md`](providers.md)
- Lodging address / Airbnb links on a trip are **trip-private** and must not appear in public trip payloads
- Affiliate outing links (Viator / GetYourGuide) should be disclosed when shown; booking happens on partner sites — Outing may earn a commission
- Google web-service and Viator secrets are server-only Supabase Edge Function secrets. Only the app-restricted native Maps SDK key ships in Expo.
- No precise real-time location storage by default
- Do not reveal that a specific person is in a destination without consent
- Distinguish editorial, community, AI summary, estimated, and live data in UI
- Never claim a place is universally “safe”
- Account deletion / export are wired as settings placeholders for MVP; implement against Supabase when auth is live
- Public/link-only trips must use `toTripPublicPayload` stripping sensitive fields
- Trip invites use one-use hashed tokens at `https://gayi.expo.app/invite?token=…`; contact phone numbers remain in an encrypted local draft.
- Google Maps export opens Maps URLs only — Outing cannot create collaborative Google Saved Lists via API
- Calendar access is requested only after an explicit export action. Outing writes selected itinerary blocks to the calendar chosen by the traveler and scans that calendar's trip-date window on-device for its own event markers to prevent duplicates. Calendar contents are not uploaded, and Google Calendar OAuth is not required.
- Product analytics uses a first-party Supabase ingest endpoint with typed, allowlisted properties. Raw search text, exact trip dates, lodging/address data, coordinates, contact details, comments, and free-text feedback are never analytics properties.
- PostHog receives a reduced semantic event stream. Destination slugs and collection IDs remain first-party in Supabase and are stripped before forwarding.
- Raw analytics events expire after 60 days. Behavioral preference signals are user-scoped, protected by RLS, deleted with the account, and ignored for ranking after 180 days without new evidence.
- Public session replay is disabled. Internal-only native replay requires two explicit build flags, samples 10%, masks text and images, disables logs/network telemetry, and excludes every sensitive route.
