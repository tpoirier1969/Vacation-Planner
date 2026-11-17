# Lazy Acres Vacation Planner

**Production:** https://tpoirier1969.github.io/Vacation-Planner/

A shared, trip-focused vacation workspace for Tod and Donna. Hosted as a static site on GitHub Pages from `main`.

## Current features

- Create and reopen trips, with a persistent trip workspace until **Exit trip**.
- Explore a Leaflet/OpenStreetMap map with a USGS aerial-imagery toggle, map click/right-click to save places, and colored category markers.
- Search locations through Nominatim and discover nearby businesses/points of interest through Geoapify within the visible map bounds, with a category filter and text search. Nearby listings display available short descriptions and business hours, with Geoapify Place Details fetched only as cards enter view; verified OpenStreetMap Wikipedia tags can provide an attributed Wikipedia summary. Each listing has a separate Google Maps search link for customer ratings/reviews; the app does not invent or republish customer star scores.
- **Ideas** are things under consideration (places, events, experiences, activities, etc.), grouped by category with a selectable category filter and counts, editable, and not required to have map coordinates. An Idea may retain a possible date, local time, and fixed-event constraint.
- **Itinerary** contains decided activities, with an unscheduled group for plans without a date. Choosing an Idea for the Itinerary hides it from consideration while preserving its map/source details; moving it back restores the Idea. Directly adding an itinerary item does not create an unwanted Idea.
- Itinerary entries support local start/end times, must-do priority, fixed dates, lodging checkout, booking status, confirmation number, and booking link.
- Edit research notes and manage/edit a 14-category packing checklist.
- Share trip data across authorized household accounts through Supabase Realtime table notifications, with a 15-second fallback refresh and refresh when the page becomes active.

## Data and access

**Authoritative data store:** the existing shared Supabase project, tables `vacation_trips`, `vacation_places` (the historical table name for considered Ideas), `vacation_itinerary`, `vacation_notes`, and `vacation_packing`. Household access is controlled by `vacation_members` and database RLS. An existing restricted `auth.users` trigger automatically enrolls preapproved household email addresses after successful email verification. Supabase Auth persists sign-in sessions in the browser; the browser may also remember the UI map-style preference and current tab's trip-navigation state. These are **not** alternate trip-data stores.

New trip-data edits are sent to Supabase and acknowledged before the app displays **Saved to Supabase**. Incoming changes update visible trip lists without reloading; an editor refuses to save if its record has visibly changed in the meantime. This is not a transactional simultaneous-edit lock. Failed saves are visibly flagged, retain unsaved state only in the current page's memory, and offer **Retry save**; leaving/reloading with pending writes shows a browser warning. Offline editing is not a durable supported workflow. Historical browser-local records are not automatically imported.

The independent household Shopping & Packing app remains separate. Trip packing is stored in the planner's own Supabase table.

## Running and deploying

The repository maintains one `last-working-copy` branch as a rollback snapshot, updated after owner-accepted live releases. Do not accumulate backup branches or duplicate hosted apps.

No build or package install is required. The entrypoint is `index.html`; `version.js` is the only canonical release-version value. `itinerary.js` and `ideas.js` own domain-level timing, validation, and consideration rules; `discovery-details.js` owns source-backed descriptions, Wikipedia links, opening-hours formatting, and external review-search URLs. The entrypoint uses that value to version CSS/JS resource URLs and display the version. GitHub Pages deploys from `main`/root.

Dependencies: pinned Leaflet 1.9.4, pinned Supabase JS 2.97.0, Geoapify free-tier API. Map, place search, and discovery require internet access and can be rate-limited.

## Verification

There is no on-repository automated test suite yet. The v0.6.17 work was checked with mocked source data for category filtering, hours formatting, description and exact Wikipedia attribution, no fabricated review scores, and nearby-result card rendering. The v0.6.15 and v0.6.16 development passes included mock-client tests for saving, remote refresh, offline retry, existing-record editing, conflict detection, grouped lists, Ideas-to-Itinerary decisions, timing constraints, and booking-information retention. A live authenticated two-browser acceptance test remains required: add/edit records on both accounts, confirm remote appearance and **Saved to Supabase**, reload, inspect the vacation tables, and verify mobile layouts and Donna's first verified sign-in.

## Project rules

See [PROJECT_RULES.md](./PROJECT_RULES.md), [ROADMAP.md](./ROADMAP.md) for outstanding work (including Suite integration and shared Supabase security review), and [Web-App-Standards](https://github.com/tpoirier1969/Web-App-Standards).
