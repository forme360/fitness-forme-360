# 360° Health & Performance OS

Forme is a mobile-first Next.js foundation for a personal health and performance system. Its central rule is that the database is the source of truth: AI can interpret and propose, but health records are saved only after user confirmation.

## Run the app

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Without credentials, the app runs in demo mode, shows empty health metrics rather than fabricated history, and labels entries as temporary. Keep the project folder to preserve your code; demo-session entries are not a backup and are cleared when the session ends.

## Set up Supabase

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_FORME360_SUPABASE_URL` and `NEXT_PUBLIC_FORME360_SUPABASE_PUBLISHABLE_KEY` for the Forme360 Supabase project. Existing local setups can continue using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as fallback names.
3. Apply migrations in order: `202610060001_initial_schema.sql`, `202610070001_integrations_ingestion.sql`, and `202610080001_health_model_plan_engine.sql`.
4. Enable email/password authentication and configure recovery redirect URLs.
5. `OPENAI_API_KEY` is optional. Without it, AI Coach uses a limited local rules parser for clearly stated common foods, activities, sleep notes, mood notes, and weight; this does not call an external AI service or estimate nutrition. Add `OPENAI_API_KEY` to enable broader language interpretation and plan drafts. `OPENAI_MODEL` is optional.

Never expose a Supabase service-role key to browser code. Current user writes use the authenticated session and RLS. Admin roles must be assigned through a trusted operator path. Private document storage uses a user-scoped path and private bucket policies.

## Current product foundation

- Today dashboard with truthful empty states.
- Today headline cards read only the signed-in user's saved sleep, training, nutrition, and weight records through an authenticated server endpoint; the view never substitutes sample health values.
- Today also shows the user's recent saved activity and a seven-day trend selector for weight, sleep, training, and protein. Missing days remain blank instead of being filled with assumed values.
- User navigation across Ask AI, Plan, Fuel, Train, Sleep, Recover, Body, Health & Biology, Mind, Lifestyle, Timeline, Insights, Connections, Social, and My Health Model.
- Account sign-in, sign-up, sign-out, and password recovery when Supabase is configured.
- Manual logging for nutrition, workouts, sleep, recovery, body measurements, mood/stress, and lifestyle context.
- A shared chronological timeline sourced from the user's saved records.
- Voice/text extraction architecture with editable proposals and explicit per-event confirmation before writing. A limited local parser works without an AI key; OpenAI adds broader natural-language interpretation.
- A goal-to-phased-plan workflow: AI drafts are editable and only become active after confirmation. AI plan context is consent-gated and can be revoked.
- Personal Health Model view for user-provided context, record coverage, and AI data-use choices.
- Secure document-upload flow, source-aware import schema, and duplicate-candidate logic for overlapping activity sources.
- Persistent Light, Dark, and Glow appearance choices; Glow is the initial theme, using dark teal surfaces and restrained mint accents.
- Mobile quick navigation for Today, Fuel, Log, Train, and Health, with a scrollable drawer containing every app section; changing sections returns the view to the page heading.
- A source directory for phone health hubs, wearables, training/nutrition apps, and future AI assistant connectors. Every item is clearly marked as not connected until a real provider flow exists.
- Server-side admin route and database role policies.
- Installable-web-app manifest foundation.

## Not live yet

Supabase credentials are required for authentication, cloud persistence, private uploads, admin roles, and saved timelines. OpenAI credentials are optional for broad natural-language extraction and generated plan proposals; without them, only the limited local parser is available. Apple Health and Android Health Connect require native permission-capable clients; Garmin access requires its developer program; Strava requires registered OAuth. Provider credentials/access are not configured here, so no wearable is currently connected or automatically synced.

The connections page is a truthful implementation directory, not a live integration screen. Professional/doctor sharing, sponsored products/ads, paid plans, full admin user controls, export/deletion workflows, offline sync, native mobile packaging, and automated weekly reviews are architecture targets rather than live features. Future offers need clear sponsor labels and separate consent; private health records must not be used for ad targeting. Clinician sharing should be user-selected, scoped, and revocable. Hormone-related content is informational and should direct users to a qualified clinician; this app does not diagnose or promise hormone regulation.

## Checks

```sh
npm run lint
npm run build
```
