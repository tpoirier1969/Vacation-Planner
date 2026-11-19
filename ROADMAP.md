# Vacation Planner — implementation backlog
Last reviewed: 2026-11-18

This is the working list to consult whenever Tod asks **what remains outstanding**. Do not infer that an unverified feature is complete solely because code was committed.

## Information model

- **Ideas:** things Tod and Donna are considering, whether locations, restaurants, experiences, activities, time-specific events, or other options. A map location is optional. Date and local time constraints may be recorded before deciding.
- **Itinerary:** only things the household has decided to do. A committed plan may be scheduled for a specific date/time or remain date-flexible. Fixed-date events and reservations are distinct attributes; a date alone does not imply a booking.
- **Maps:** discovery is one tool in the planning workspace, not the application's primary organizing concept.
- Converting an Idea into an Itinerary item hides it from the consideration list while retaining linked geographic/source details in its Supabase row. Returning it to Ideas restores the candidate and retains scheduling constraints. Do not automatically add a second Idea when an activity is entered directly into the Itinerary.
- Do not introduce per-device trip-data storage: Supabase remains authoritative for trips, ideas, itinerary, notes, and trip packing.

## Current implementation checkpoint

- **v0.6.34 (2026-11-19):** Address-only reverse geocodes are no longer offered as business names. Point lookup uses fallback Overpass mirror; missing POI triggers direct name-entry form at tapped coordinate, rather than an address choice list. Fixed header title/status overlap on mobile. Verify Fika tap and add on signed-in iPhone; no Supabase data/schema writes performed in release.

- **v0.6.33 (2026-11-19):** Map-tap lookup now checks OSM on every tap, includes named commercial buildings, eliminates unrelated 217m-away candidate results, and sorts genuine nearby matches. Coffee discovery adds name-matched bakeries/named buildings (e.g. Fika Bakery & Coffee House, Egg Harbor) without turning every bakery into a coffee shop. Manual save still works. No Supabase modifications; live device/source acceptance pending.

- **v0.6.32 (2026-11-19):** Broadened coffee places to cafés and coffee/tea retailers. Supplement café searches with a single on-demand small-area OpenStreetMap query, deduplicate near-identical named places, increase pages to 100, and surface Load next results before the list. Route generic map-search terms to Discover Nearby. No data/schema changes. Accuracy still limited to available free sources; compare live Door County results and keep Google Maps-only venues manually addable.

- **v0.6.31 (2026-11-19):** The bounded OpenStreetMap named-place fallback now operates in both search entry points if Geoapify misses a named business. The stand-alone preview was retired; all authorized releases target one canonical app on `main`. No Supabase changes. Real authenticated browser and phone testing still outstanding.

- **v0.6.30 released to canonical main (2026-11-19):** Both Explore search types now use visible map rectangle only; coffee terminology and named-place fallback improved; map-click OpenStreetMap POI fallback added; all paged results numbered on map. Integrated route-section editor, draggable alternatives (up to 3), and mobile Ideas/Itinerary browsing promoted from preview. No Supabase modifications. Live authenticated device/Geoapify acceptance outstanding.

- **v0.6.28 (2026-11-18):** Password setup minimum reduced to 8; iPhone login continues to use each member's own Supabase account. Database check found only one existing `vacation_members` record in `tod-donna-shared`. Donna must be enrolled separately as a second approved user; cannot infer her identity from the existing member record. Avoid automatic self-approval.

- **v0.6.27 password login (2026-11-18):** Primary sign-in method now Supabase `signInWithPassword`, with existing approved-account membership verification. Logged-in household members can set their password through `auth.updateUser` without a new email, then authenticate in the iPhone Home Screen shortcut. Email link retained as optional fallback. Four mocked regression tests and read-only web preview verified; real iPhone Safari/Home Screen acceptance still required. This supersedes the earlier OTP proposal, avoiding free-tier mail rate limits during normal sign-in.

- **v0.6.26 Coffee Shops category (2026-11-18):** First-class Coffee Shops option in discovery filter and all saved Idea/Itinerary/place forms, map category filters/colored pins and category counts. Geoapify café category is used for discovery. Existing saved category values remain untouched; Supabase category columns accept text. iPhone/desktop acceptance still needs a real account session.


- **v0.6.25 mobile interface accepted for production (2026-11-18):** Compact phone navigation; collapsed/full-screen map results; miles instead of kilometers; simplified add/edit; partial named-business searches with split Geoapify category groups and nearby/global fallback; + Idea and + Itinerary in both search result types; route editing controls wrapped/stacked for narrow screens. Real-CSS browser fixture verified visible route panels with no horizontal overflow at 320/375/390/430/720 px. Live authenticated iPhone review is still necessary; do not treat static fixture as a substitute for a genuine device session.


- **v0.6.24 source changes, browser acceptance outstanding:** Fixed invalid outbound/return persistence (existing database only permits route kind `day` or `journey`), added independent Ideas/Itinerary/Routes map visibility, and added importing mapped scheduled itinerary activities for a selected route start day. Verified the route type choices with a mock controller and tested date/time order, duplicate prevention, unchanged source itinerary, and one Supabase persist callback per import. Still verify in signed-in production browser; there is no claim of confirmed live iPhone operation.


- **v0.6.22 committed:** Route editor now lists adjacent driving sections with disconnect/reconnect actions while keeping stops, and supports route ordering and day/outbound/return classifications. Disconnected sections are stored in existing `vacation_routes.disconnected_legs`, and per-connected-run road geometry uses existing `route_segments`. No database migration or data reset was performed. Syntax checked; live authenticated routing and iPhone interaction still require acceptance. Map clicks select the first section of a connected run, not yet the exact tapped leg when several legs share the same polyline.
- **v0.6.23 authentication diagnostics committed:** The app now verifies the logged-in Supabase user instead of trusting only the cached session, and shows the exact signed-in email on membership denial; this does not grant permission or bypass RLS. Live iPhone Home Screen testing remains required.
- **iPhone launcher sign-in still unresolved:** Suite standalone Home Screen context may hold a separate Supabase session from Safari, and membership must be checked using the signed-in user ID. Do not grant membership automatically or bypass RLS to mask the issue. Verify which account appears in each context before changing authorization.

## Next priorities

1. Live two-account verification: Donna's email sign-in, shared household membership, Realtime refresh between two authenticated browsers, concurrent-edit behavior, save/reload, and mobile layout. Source code and mock tests are not enough.
2. Itinerary and Ideas UX acceptance: category balance, compact layout, promotion/return flows, date/time and fixed-event constraints, booking details, and visual checks in actual browsers.
3. **Completed:** Added Vacation Planner to `tpoirier1969/Lazy-Acres-Suite` household launcher in Suite v0.1.84; verified deployed module registry and live Suite version. Its card opens `https://tpoirier1969.github.io/Vacation-Planner/` and uses the original Vacation Planner sign artwork.
4. Trip-specific sharing/access beyond current household model, if needed.
5. Scheduler integration: connect to the existing Lazy Acres Scheduler deliberately, without creating a second calendar system.
6. Cross-app integrations with existing Shopping/Packing and Boondocking apps, without migrating or duplicating their authoritative records.
7. Basic route builder implemented in v0.6.19: multiple named Supabase routes, Geoapify driving paths, road-shaping clicks, ordered waypoints, linked Ideas/itinerary stops, start/end date/time, route preferences, visibility, alternative copies and distance/time comparisons. **Outstanding:** route-corridor attraction discovery, configurable maximum detour time, schedule-linked multi-day routing, and real-device alternate route acceptance.
8. Deeper fishing access, boat launches, trails, events discovery, and weather along routes/dates.
9. Browser save extension, location-aware research notes, and optional trip photos.
10. Review quality of satellite imagery.
11. Construction/accident traffic alerts and costly integrations remain deferred for the $0 proof of concept unless a free sustainable data source emerges.

## UI and map usability — outstanding

- **Completed in v0.6.21:** Rebuilt the masthead to display the enlarged roadside-sign logo at left and a compact active-trip summary with destination, dates, Edit Trip, and Exit Trip at right. Moved connection status into the same masthead, removed the redundant full-width trip hero, and added responsive desktop/tablet/phone sizing. Visual acceptance on actual devices remains pending.
- **Implemented in v0.6.24; awaiting live QA:** Independent **Ideas**, **Itinerary**, and **Route** visibility controls for map overlays. These are temporary display choices; hiding items does not delete persistent records. Category filtering remains supported.
- **Partially implemented in v0.6.24:** Add mapped itinerary stops for one selected route start date, sorted by time without rewriting itinerary dates. Still outstanding: selected date ranges, fixed-time conflict handling, and suggested route order versus manual itinerary order.
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
