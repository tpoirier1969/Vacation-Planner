# Lazy Acres Vacation Planner

**Production:** https://tpoirier1969.github.io/Vacation-Planner/

A shared, trip-focused vacation workspace for Tod and Donna. Hosted as a static site on GitHub Pages from `main`.

## Current features

- Create and reopen trips, with a persistent trip workspace until **Exit trip**.
- Explore a Leaflet/OpenStreetMap map with a USGS aerial-imagery toggle, map click/right-click to save places, and colored category markers.
- Search locations through Nominatim and discover nearby businesses/points of interest through Geoapify within the visible map bounds, with a category filter and text search.
- Save and edit places grouped into collapsible categories; create and edit day-grouped or unscheduled itinerary entries (including lodging check-in/check-out dates), edit research notes, and manage/edit a 14-category packing checklist.
- Share trip data across authorized household accounts through Supabase Realtime table notifications, with a 15-second fallback refresh and refresh when the page becomes active.

## Data and access

**Authoritative data store:** the existing shared Supabase project, tables `vacation_trips`, `vacation_places`, `vacation_itinerary`, `vacation_notes`, and `vacation_packing`. Household access is controlled by `vacation_members` and database RLS. An existing restricted `auth.users` trigger automatically enrolls preapproved household email addresses after successful email verification. Supabase Auth persists sign-in sessions in the browser; the browser may also remember the UI map-style preference and current tab's trip-navigation state. These are **not** alternate trip-data stores.

New trip-data edits are sent to Supabase and acknowledged before the app displays **Saved to Supabase**. Incoming changes update visible trip lists without reloading; an editor refuses to save if its record has visibly changed in the meantime. This is not a transactional simultaneous-edit lock. Failed saves are visibly flagged, retain unsaved state only in the current page's memory, and offer **Retry save**; leaving/reloading with pending writes shows a browser warning. Offline editing is not a durable supported workflow. Historical browser-local records are not automatically imported.

The independent household Shopping & Packing app remains separate. Trip packing is stored in the planner's own Supabase table.

## Running and deploying

The repository maintains one `last-working-copy` branch as a rollback snapshot, updated after owner-accepted live releases. Do not accumulate backup branches or duplicate hosted apps.

No build or package install is required. The entrypoint is `index.html`; `version.js` is the only canonical release-version value. The entrypoint uses that value to version CSS/JS resource URLs and display the version. GitHub Pages deploys from `main`/root.

Dependencies: pinned Leaflet 1.9.4, pinned Supabase JS 2.97.0, Geoapify free-tier API. Map, place search, and discovery require internet access and can be rate-limited.

## Verification

There is no on-repository automated test suite yet. The v0.6.15 development pass included mock-client tests for saving, remote refresh, offline retry, existing-record editing, conflict detection, and grouped lists. A live authenticated two-browser acceptance test remains required: add/edit records on both accounts, confirm remote appearance and **Saved to Supabase**, reload, inspect the vacation tables, and verify mobile layouts and Donna's first verified sign-in.

## Project rules

See [PROJECT_RULES.md](./PROJECT_RULES.md) and [Web-App-Standards](https://github.com/tpoirier1969/Web-App-Standards).
