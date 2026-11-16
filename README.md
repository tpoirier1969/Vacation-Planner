# Lazy Acres Vacation Planner

Live site (after Pages deployment): https://tpoirier1969.github.io/Vacation-Planner/

## v0.2.0

Trip-specific workspaces with explicit Exit Trip, interactive Leaflet/OpenStreetMap map, location search (Nominatim), nearby OpenStreetMap POI discovery (Overpass), map-click place saving, per-trip saved places, itinerary, notes and packing preview. A trip remains active across page reloads in the same browser tab via sessionStorage. All saved records remain browser-local via localStorage and are not synchronized across devices.

**Limitations:** Suggestions are OSM listings, not personalized editorial recommendations; public search and discovery services can be rate-limited or unavailable. Map requires network access. Packing is not connected to household Shopping List. No shared Supabase writes, backend, API keys or GitHub Actions.

## Hosting

GitHub Pages from `main` / root. Static site; no build step.

## Project rules

See `PROJECT_RULES.md` and [Web-App-Standards](https://github.com/tpoirier1969/Web-App-Standards).
