# Vacation Planner — implementation backlog
Last reviewed: 2026-11-17

This is the working list to consult whenever Tod asks **what remains outstanding**. Do not infer that an unverified feature is complete solely because code was committed.

## Information model

- **Ideas:** things Tod and Donna are considering, whether locations, restaurants, experiences, activities, time-specific events, or other options. A map location is optional. Date and local time constraints may be recorded before deciding.
- **Itinerary:** only things the household has decided to do. A committed plan may be scheduled for a specific date/time or remain date-flexible. Fixed-date events and reservations are distinct attributes; a date alone does not imply a booking.
- **Maps:** discovery is one tool in the planning workspace, not the application's primary organizing concept.
- Converting an Idea into an Itinerary item hides it from the consideration list while retaining linked geographic/source details in its Supabase row. Returning it to Ideas restores the candidate and retains scheduling constraints. Do not automatically add a second Idea when an activity is entered directly into the Itinerary.
- Do not introduce per-device trip-data storage: Supabase remains authoritative for trips, ideas, itinerary, notes, and trip packing.

## Next priorities

1. Live two-account verification: Donna's email sign-in, shared household membership, Realtime refresh between two authenticated browsers, concurrent-edit behavior, save/reload, and mobile layout. Source code and mock tests are not enough.
2. Itinerary and Ideas UX acceptance: category balance, compact layout, promotion/return flows, date/time and fixed-event constraints, booking details, and visual checks in actual browsers.
3. **Add Vacation Planner to the Lazy Acres Suite landing page** after verifying the exact landing-page repository and its existing launcher conventions. Use the canonical production URL `https://tpoirier1969.github.io/Vacation-Planner/`. This is a separate app; do not assume a target and do not modify unrelated Suite entries.
4. Trip-specific sharing/access beyond current household model, if needed.
5. Scheduler integration: connect to the existing Lazy Acres Scheduler deliberately, without creating a second calendar system.
6. Cross-app integrations with existing Shopping/Packing and Boondocking apps, without migrating or duplicating their authoritative records.
7. Route display, comparing alternative routes, discovery along route corridors, configurable maximum detour time.
8. Deeper fishing access, boat launches, trails, events discovery, and weather along routes/dates.
9. Browser save extension, location-aware research notes, and optional trip photos.
10. Review quality of satellite imagery.
11. Construction/accident traffic alerts and costly integrations remain deferred for the $0 proof of concept unless a free sustainable data source emerges.

## Discovery source strategy and outstanding ratings

- v0.6.17: filter the Ideas list by category with live counts; enrich Discover Nearby cards with available descriptions and opening hours, lazy Geoapify Place Details, and Wikipedia summaries **only when OpenStreetMap provides an exact Wikipedia reference**. Every result can link to a Google Maps search for customer ratings. Missing fields are shown as unavailable, not invented.
- **Still outstanding:** automatically displaying genuine customer star ratings in the app. Do not use Geoapify category rankings, OpenTripMap attraction popularity, or Foursquare veracity scores as substitutes for customer reviews. Yelp, Google Places, or another licensed provider must be evaluated for billing, quotas, attribution, API use on the existing OpenStreetMap map, and privacy before integrating. Maintain the $0 new-recurring-cost proof-of-concept constraint. Public consumer review pages may be linked to; do not scrape them or silently reuse copyrighted review text.
- **Descriptions are not universally available** from open data, especially for smaller businesses. Assess additional openly licensed sources or business-owned descriptions if the user wants better coverage, with identity matching and original-source attribution.

## Security review — explicitly outstanding

**Review the security of the entire shared Supabase project, not just Vacation Planner**, when Tod asks for outstanding work. Supabase's security advisor reported privileged (`SECURITY DEFINER`) public functions callable by the `anon` and `authenticated` roles in other Lazy Acres apps (especially boondocking-related functions), plus functions with mutable `search_path`. Also review unused/missing RLS policies, authorization ownership, and grants. This is a **separate, cross-project security audit**; do not change unrelated applications' database functions during Vacation Planner development without a scoped plan and approval. Re-run the advisor and verify the current findings before proposing repairs.

## Release safety

- Canonical source: `tpoirier1969/Vacation-Planner` on `main`; GitHub Pages production.
- One rolling rollback branch: `last-working-copy`. Advance it only after a subsequent live release is confirmed working/accepted. No accumulating backup builds or duplicate applications.
- Before claiming a release complete, verify deployed GitHub Pages is serving the new `version.js` version; test the actual behavior where tools permit, and disclose any owner-only acceptance tests.
- Follow the shared `Web-App-Standards` rules. Never hand off to Work mode without Tod's explicit permission.
