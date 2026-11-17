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
3. **Completed:** Added Vacation Planner to `tpoirier1969/Lazy-Acres-Suite` household launcher in Suite v0.1.84; verified deployed module registry and live Suite version. Its card opens `https://tpoirier1969.github.io/Vacation-Planner/` and uses the original Vacation Planner sign artwork.
4. Trip-specific sharing/access beyond current household model, if needed.
5. Scheduler integration: connect to the existing Lazy Acres Scheduler deliberately, without creating a second calendar system.
6. Cross-app integrations with existing Shopping/Packing and Boondocking apps, without migrating or duplicating their authoritative records.
7. Basic route builder implemented in v0.6.19: multiple named Supabase routes, Geoapify driving paths, road-shaping clicks, ordered waypoints, linked Ideas/itinerary stops, start/end date/time, route preferences, visibility, alternative copies and distance/time comparisons. **Outstanding:** route-corridor attraction discovery, configurable maximum detour time, true alternate geometry suggestions and simultaneous map overlays, and schedule-linked multi-day routing.
8. Deeper fishing access, boat launches, trails, events discovery, and weather along routes/dates.
9. Browser save extension, location-aware research notes, and optional trip photos.
10. Review quality of satellite imagery.
11. Construction/accident traffic alerts and costly integrations remain deferred for the $0 proof of concept unless a free sustainable data source emerges.

## UI and map usability — outstanding

- Rework the header following the approved concept: enlarge the roadside-sign logo to occupy the left portion of the header/trip region, relocate the compact trip title, date and Edit/Exit controls to the right; maintain compact mobile responsiveness. **The visual concept was approved but has not been implemented in code.**
- Add independent **Ideas**, **Itinerary**, and **Route** visibility controls for map overlays. These are temporary display choices; hiding items must never delete persistent records. Existing category filtering should still work alongside them.
- Provide **Build route from Itinerary** using selected day/date range and decided mapped activities; preserve fixed-time appointment order and clearly distinguish manual itinerary order from suggested travel order, without rewriting itinerary dates.
- v0.6.20: direct map clicks again look up named nearby places and reverse-geocode when necessary, do not offer an immediate blank-name Save button while lookup is underway, and prefill the chosen name in Save Idea. Mocked acceptance checks passed, but verify with real map clicks after deployment.

## Route release acceptance and limitations

- **Verify v0.6.19 live** in an authenticated browser: start and destination geocoding, map click to choose road-shaping points, Geoapify Routing API access using the existing referrer-restricted browser key, road geometry overlay, show/hide, vehicle/avoid preferences, save/reload and cross-account synchronization, mobile/desktop layouts, and comparison of routes.
- The Routes editor deliberately uses the existing Geoapify free plan; avoids are routing preferences and not legal guarantees. Driving-time estimates exclude live traffic, weather, stops, and overnight rests. Towing/camper-specific height, weight, length, and road closure verification are **not** implemented.
- Start/end date and time are planning fields, not inputs to a live time-dependent traffic model. Stops are ordered manually; multi-day stop scheduling and route-corridor detour searches remain future work.
- **Restaurant results** now filter generic OpenStreetMap catering labels, retaining actual dine-in/cafe/takeout venues based on explicit dining classifications. Check live local coverage to identify false positives/false negatives.

## Discovery source strategy and outstanding ratings

- v0.6.17: filter the Ideas list by category with live counts; enrich Discover Nearby cards with available descriptions and opening hours, lazy Geoapify Place Details, and Wikipedia summaries **only when OpenStreetMap provides an exact Wikipedia reference**. Every result can link to a Google Maps search for customer ratings. Missing fields are shown as unavailable, not invented.
- **Still outstanding:** automatically displaying genuine customer star ratings in the app. Do not use Geoapify category rankings, OpenTripMap attraction popularity, or Foursquare veracity scores as substitutes for customer reviews. Yelp, Google Places, or another licensed provider must be evaluated for billing, quotas, attribution, API use on the existing OpenStreetMap map, and privacy before integrating. Maintain the $0 new-recurring-cost proof-of-concept constraint. Public consumer review pages may be linked to; do not scrape them or silently reuse copyrighted review text.
- v0.6.18: enrich *map popups* and direct map-click identified places using explicit OSM/Geoapify Wikipedia or Wikidata IDs and a transparent OSM feature type when sources lack fuller descriptions; show corrected winery categories from the full Geoapify tag set and place name. Inline per-Idea category changes preserve all other fields and require a confirmed Supabase save. Existing stored categories are **not** automatically rewritten.
- OpenTripMap is another potential free attraction-details source, but its API requires an account/key. Evaluate it separately if the current open identifiers leave too many unknown attractions; do not ship a nonfunctional integration or unknown credentials.
- **Descriptions are not universally available** from open data, especially for smaller businesses. Assess additional openly licensed sources or business-owned descriptions if the user wants better coverage, with identity matching and original-source attribution.

## Security review — explicitly outstanding

**Review the security of the entire shared Supabase project, not just Vacation Planner**, when Tod asks for outstanding work. Supabase's security advisor reported privileged (`SECURITY DEFINER`) public functions callable by the `anon` and `authenticated` roles in other Lazy Acres apps (especially boondocking-related functions), plus functions with mutable `search_path`. Also review unused/missing RLS policies, authorization ownership, and grants. This is a **separate, cross-project security audit**; do not change unrelated applications' database functions during Vacation Planner development without a scoped plan and approval. Re-run the advisor and verify the current findings before proposing repairs.

## Release safety

- Canonical source: `tpoirier1969/Vacation-Planner` on `main`; GitHub Pages production.
- One rolling rollback branch: `last-working-copy`. Advance it only after a subsequent live release is confirmed working/accepted. No accumulating backup builds or duplicate applications.
- Before claiming a release complete, verify deployed GitHub Pages is serving the new `version.js` version; test the actual behavior where tools permit, and disclose any owner-only acceptance tests.
- Follow the shared `Web-App-Standards` rules. Never hand off to Work mode without Tod's explicit permission.
