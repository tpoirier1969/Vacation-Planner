# Vacation Planner project rules

Governed by https://github.com/tpoirier1969/Web-App-Standards/blob/main/UNIVERSAL_PROJECT_RULES.md

- Canonical repository: `tpoirier1969/Vacation-Planner`, branch `main`; production GitHub Pages from `main`.
- Application entrypoint: root `index.html`; single release version source: `version.js`.
- Supabase is authoritative for all persistent planner data (trips, routes, Ideas, itinerary, notes, and packing). Do not save trip records in browser localStorage or use an offline browser write queue.
- This app uses the existing shared Supabase project. Restrict all app writes to its own `vacation_*` tables; review schema and authorization before database changes. Never touch unrelated tables.
- Preserve existing user data, IDs, and RLS controls; never assume permission for destructive migrations or resets.
- Keep exactly one rollback branch, `last-working-copy`, pointing to the previous owner-accepted working app. Update this branch only after the next canonical release has been verified live; don't accumulate backup branches, duplicate applications, or secondary deployments. Git history is the permanent archive.
- Avoid duplicate ownership of household Shopping & Packing, Scheduler, and campground data; integrate deliberately after source/schema review.
- Work mode is prohibited unless Tod first receives an explanation of a verified capability blocker and explicitly approves the handoff. Default to implementing with tools available in the current chat.
