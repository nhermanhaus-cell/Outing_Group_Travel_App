# Privacy notes

- Optional identity considerations in the quiz are skippable and not sent to analytics by default
- **No scraping** of gay travel blogs or dating apps — blogs are inspiration + further-reading attribution only; place blurbs are original editorial
- Public LGBTQ+/travel datasets (OSM, ILGA, Wikidata, government advisories, Equaldex-cited scores) are loaded via fixture-first providers with attribution; see [`docs/providers.md`](providers.md)
- No precise real-time location storage by default
- Do not reveal that a specific person is in a destination without consent
- Distinguish editorial, community, AI summary, estimated, and live data in UI
- Never claim a place is universally “safe”
- Account deletion / export are wired as settings placeholders for MVP; implement against Supabase when auth is live
- Public/link-only trips must use `toTripPublicPayload` stripping sensitive fields
- Trip invite deep links use `gayi://trips/{id}/invite` (no public HTTPS OG pages in MVP)
