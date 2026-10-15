# 360° Health OS — product and system architecture

## Product definition

**A personal health and performance intelligence system:** one private, longitudinal record that helps a person understand their health context and choose a useful next action. The app supports daily self-management and professional collaboration; it does not replace a clinician, therapist, dietitian, trainer, or physiotherapist.

Product principle: **one person → many sources → one evidence-linked health model → one personal intelligence layer → plans and actions → new feedback.** The database, not the model, is the source of truth.

## Product pillars

| Pillar | Scope |
|---|---|
| Body | User-measured weight, height, circumferences, body composition when supplied, progress photos. No exact body-fat inference from photos. |
| Fuel | Meals, portions, estimated nutrition, hydration, dietary preferences, allergies, supplements, meal plans, Indian/local foods. |
| Train | Strength, running, cycling, swimming, sports, mobility, yoga, conditioning, progression and performance. |
| Sleep | Duration, timing, consistency, quality, device-derived stages where supported, optional context. |
| Recover | Fatigue, soreness, subjective readiness, HR/HRV where available, rest and recovery sessions. |
| Health / Biology | User-provided medical context, secure documents, laboratory values with the source laboratory's units/ranges, medications as records only, injuries and care notes. Hormones are a biology subdomain. |
| Mind | Explicitly self-reported mood, stress, energy, journaling and life context. No diagnosis or emotion inference from a life event alone. |
| Lifestyle | Optional movement, work/travel context, caffeine, alcohol, sunlight, routine and environment. |
| Social | Optional accountability, community and challenges; intimate relationship/life-event logging remains private and optional. |
| Goals & Plans | Goal → phases → daily/weekly actions → measurement → review → adaptation. |
| Timeline | A chronological projection of verified and user-confirmed events across all pillars; not a second source of truth. |
| Insights | Evidence-linked longitudinal patterns and uncertainty, generated only when enough real data exists. |

AI Coach, integrations, the personal health model and the admin console are **cross-cutting system layers**, not separate databases or disconnected chatbots.

## Application layers

```text
USER PWA / MOBILE CLIENT                  ADMIN CONSOLE (separate authorization)
            └──────────────────────────┬─────────────────────────────┘
                                  Next.js App Router
                     server actions / route handlers / domain services
              ┌───────────────────────┼────────────────────────┐
          Supabase Auth          PostgreSQL + RLS          Private Storage
              │                 canonical records         reports / photos
              └───────────────────────┬────────────────────────┘
                  source adapters → normalize → dedupe → validate
                                      │
                  retrieval → specialist reasoning → evidence answer
                                      │
                     user review → explicit confirmation → write
```

## Appearance system

The app has a shared typography and spacing scale with three user-selectable themes: Light, Dark, and Glow. The Glow palette uses near-black teal surfaces and restrained mint illumination for focus states and primary actions; it is a visual mode, not a separate feature set. The selected appearance is stored locally in the browser and does not require syncing personal health data.

The same Next.js application can host user and admin routes, but authorization is checked on the server and in RLS. Admin access is a least-privilege operational role, not a front-end visibility flag. User health data is not available to ad targeting. Sponsored products, if added, must be clearly labeled, separately consented, and must not receive private health records for targeting.

## Canonical data and source ingestion

Each record carries `user_id`, timestamp, source/provider, external event identity where available, provenance (`MEASURED`, `ESTIMATED`, `USER_PROVIDED`, `AI_INFERRED`), and confirmation/consent state as appropriate. Original provider records remain traceable. Provider credentials are never stored in a client-readable table; use OAuth/native permission flows and a protected server-side secret store.

Import pipeline:

1. Obtain narrow, purpose-specific consent; store scopes and revocation state.
2. Fetch provider pages with cursor/rate-limit handling. Idempotency key is `(user_id, provider, external_id)`.
3. Convert units and provider types into canonical domain records while preserving source IDs and original values.
4. Deduplicate by event identity first, then event type, time overlap, duration and distance. Similar events become duplicate candidates; conflicting values become `review_required`. **Never add two sources' distances or calories because they may be two observations of the same activity.** User/source priority and corrections remain auditable.
5. Store the canonical event and its source observations; retain rejected/unmatched source records only under the user's retention setting.
6. Revoke stops future reads. Deletion/export applies to imported records and provider tokens too.

Apple Health and Android Health Connect require native platform permissions; a browser-only PWA cannot read those stores. Garmin/provider integrations require the provider's developer access, and Strava requires registered OAuth. No connection is represented as active until the consent flow and first sync succeed.

## Personal health model

The model is a **derived, refreshable view** over normalized records—not a mutable blob that replaces them. It contains:

- identity/preferences the user chose to provide;
- goal and plan state;
- current, dated measurements and observations;
- temporal signals from each connected source;
- source/provenance, units, quality and missingness;
- evidence references for every insight or recommendation.

Server retrieval is scoped by authenticated `user_id` and bounded by feature-specific time windows. Do not send a full archive to an LLM by default. The model must be able to say “not enough data,” distinguish correlation from causation, and expose what it knows and where each fact came from.

## AI contract

One Personal AI has shared context with specialist reasoning for Fuel, Train, Sleep, Recover, Biology, Mind, Body and Goals. It is never the database and has no direct write tool. Every answer may use a structured format:

1. Summary
2. What the user's records show (verified evidence IDs and dates)
3. Why it may matter (clearly labeled explanation, uncertainty, correlation limits)
4. Actions / plan proposal
5. What to monitor
6. When to talk to a qualified professional
7. Sources, where external medical/scientific claims are made

Voice, typo correction, photos, documents and typed notes first become drafts. A user can edit, confirm or reject each event. Provider imports use the previously granted source consent and are marked as imported measurements, not AI-inferred. Lab values preserve the original report and reference range; the app does not invent ranges or diagnose. Hormone-related observations are informational and routed to clinician discussion, never a promise to regulate hormones.

## Goal and plan engine

An objective has a user-authored outcome, target date (optional), constraints, available time/equipment, preferences and relevant safety context. The plan engine:

1. asks only for missing information that materially changes the plan;
2. builds a phased draft across Fuel, Train, Sleep, Recover, Mind and monitoring;
3. attaches baseline values and evidence references without fabricating missing values;
4. shows assumptions, estimated quantities, schedule and safety boundaries;
5. saves as active only after user review and confirmation;
6. checks progress on a weekly review and proposes—not silently applies—adjustments.

Plan versions are retained so users can compare what changed and why. A professional-provided plan is separately attributed from an AI-proposed plan.

## Privacy, care and commercial layer

- One isolated user record; RLS on every user-owned table and private object.
- Consent is granular: health-source sync, AI processing, professional sharing and marketing are separate choices.
- A clinician handoff creates a user-selected, time-limited, revocable summary/share, never broad account access by default.
- Ads/affiliate listings are a separate marketplace module with explicit sponsored labels. Health data, mood, lab values and inferred conditions are not exported to ad partners or used for targeting.
- Health document and emotional journal access is sensitive; audit access, minimize logs, encrypt transport/storage and provide export/deletion paths.
- Any crisis language is handled with supportive, non-diagnostic language and appropriate local-resource guidance; the app does not represent itself as therapy or emergency response.

## User journeys

### Talk and log
Speak/type/photo/PDF → transcribe/extract → split into domain events → show corrected interpretation and provenance → edit/confirm/reject each → save to normalized records → refresh timeline/model.

### Ask about self
Authenticate → retrieve only the user's relevant, dated records → produce an evidence-linked structured answer → validate every cited record ID against retrieved rows → show summary/actions/caveats → copy, save, share or add to a plan (each as an explicit action).

### Create a life plan
State an objective → complete only needed onboarding → review baseline and missing data → receive phased plan draft → edit/confirm → schedule actions → weekly check-in → review evidence → approve changes.

### Connect a source
Choose provider and data categories → view why/permissions/retention → consent → provider OAuth or native OS grant → sync status and source attribution → duplicate review when uncertain → disconnect/export/delete at any time.

## Reference products and product distinction

Apple Health provides a central place for iPhone, Apple Watch and compatible-app data plus highlights/trends. Garmin Connect focuses on Garmin-derived activity and health history with training/coaching features. Wellness Project publicly presents a broad, modular tracker spanning workouts, nutrition, sleep, recovery, supplements, labs and wellbeing. These are useful references for breadth, longitudinal viewing and source-aware modules; 360° Health OS should differentiate through an evidence-linked cross-domain model, one conversational input layer, user-reviewed writes, user-controlled plans and transparent provenance—not by claiming the categories themselves are unique.

## Delivery sequence

1. Architecture, threat model, data dictionary, consent model and migration review.
2. Auth/RLS, profile context, normalized ingestion and local demo fixtures.
3. Personal Health Model + goal/plan engine, including confirmation and versioning.
4. One complete manual pillar at a time (Fuel, Train, Sleep/Recover, Body, Health, Mind, Lifestyle) with timeline projections.
5. AI retrieval and evidence-linked answers; no AI writes.
6. Source adapters, starting with native health aggregators, then provider OAuth after access approval; test duplicate scenarios.
7. Admin operations, professional sharing, privacy export/deletion and incident review.
8. PWA/native packaging, offline queue, encrypted backups, accessibility and production monitoring.

Do not market a connector, trend, recommendation, plan, or backup as live until it has been implemented and verified end-to-end.
