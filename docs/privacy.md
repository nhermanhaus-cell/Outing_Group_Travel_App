# Privacy notes

- Optional identity considerations in the quiz are skippable and not sent to analytics by default
- No scraping of dating apps
- No precise real-time location storage by default
- Do not reveal that a specific person is in a destination without consent
- Distinguish editorial, community, AI summary, estimated, and live data in UI
- Never claim a place is universally “safe”
- Account deletion / export are wired as settings placeholders for MVP; implement against Supabase when auth is live
- Public/link-only trips must use `toTripPublicPayload` stripping sensitive fields
