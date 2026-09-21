# Exposure Engine fresh-eyes audit and regression slice - 2026-08-12

## Goal and completion contract

The goal was to inspect the live Exposure Engine with fresh eyes, exercise the algorithm and product boundaries without paid AI calls or production writes, add durable regression coverage for proven defects, and identify the shortest evidence-backed route to an A+ product.

Done meant: current repo and live surface mapped; scoring, privacy, lead, referral, analytics, accessibility, and dependency boundaries checked; high-confidence low-risk defects fixed with executable tests; build and type-check clean; residual product and architecture risks separated from proven fixes.

## Repository state

- Repo: `/Users/ramon/code/exposure-engine`
- Starting HEAD: `eb7f516` on `fix/ee-phase2-qa-fixes`
- Work branch: `codex/exposure-engine-fresh-eyes`
- Pre-existing untracked files were not edited: `AGENTS.md`, `docs/plans/2026-03-24-pdf-credibility-fix.md`
- Protected `.claude/CLAUDE.md` was not read, edited, or staged.

## Implemented findings

- `services/geminiService.ts`: Professional now has its documented tier and visibility floors; MLS NEXT no longer falls through to the 0.5 readiness multiplier; market readiness is clamped to 0-100; the complete D1 <= D2 <= D3 <= NAIA <= JUCO cascade is enforced; model scores are deduplicated, ordered, and clamped; legitimate zero readiness values remain zero.
- `api/analyze.ts`: raw scoring tokens remain available to Gemini with separate display labels; validation now checks enums, email, real calendar dates, GPA, seasons, stats, minutes, and recruiting-funnel consistency; legacy league profiles remain accepted and receive a D1 ceiling; the timer no longer holds test processes open.
- Referral field mapping now recognizes the form's underscore rating tokens and current `competitiveLevel` field in both referral implementations.
- `index.tsx`: PostHog session replay masks every athlete input value.
- `components/PlayerInputForm.tsx`: recruiting-funnel number inputs carry browser bounds.
- `services/supabase.ts` and `tsconfig.json`: obsolete client option and missing Vite environment typing were corrected.
- `tests/analysis.test.ts` and `tests/privacy.test.ts`: 14 no-network regressions added.
- Lockfile refresh removed the previously observed critical/high production dependency advisories. The remaining `npm audit --omit=dev` item is one low-severity esbuild advisory under the test-only `tsx` dependency.

## Verification evidence

- `npm ci` - exit 0, 403 packages installed.
- `npm test` - exit 0, 14 tests passed, 0 failed.
- `./node_modules/.bin/tsc --noEmit` - exit 0.
- `npm run build` - exit 0, Vite production build completed with 3,941 modules transformed.
- `npm audit --omit=dev --json` - one low advisory, zero moderate/high/critical in the omit-dev report.
- `git diff --check` - exit 0.
- No Gemini request, email, deployment, or production database write was performed.

## Live and read-only evidence

- `GET https://app.warubi-sports.com/api/health` and the preview health endpoint both returned healthy with database connectivity and 107 cumulative website leads.
- Safe method/validation probes returned JSON 405/400 responses without invoking Gemini.
- Live mobile viewport 390x844 had no horizontal overflow and no console errors.
- Live axe-core 4.10.2 audit found 4 serious/critical rule classes affecting 50 nodes: 2 unnamed buttons, 23 color-contrast failures, 14 unlabeled inputs, and 11 unnamed selects.
- Live response headers did not include repository-enforced CSP, frame protection, MIME-sniffing protection, Referrer-Policy, or Permissions-Policy.
- Read-only lead corpus: 107 total; 17 in the last 30 days; 4 missing email; 10 missing analysis; 10 missing visibility scores; 11 score arrays not containing five results; 21 full-cascade violations; no out-of-range scores or impossible stored funnel counts.
- Read-only scout schema: `scout_prospects` has only its primary key as a uniqueness constraint. Referral retries therefore have no database idempotency guarantee.
- GA4 last 30 days: canonical `app.warubi-sports.com` had 9 pageviews and no recent analysis completions; the Vercel preview host had 106 pageviews, 17 `generate_lead` events, and 17 `analysis_complete` events. The preview host is functioning as the de facto acquisition surface.

## Residual high-risk findings

1. The API still returns and persists Gemini output before the browser-owned deterministic normalization. A referred scout, website lead, and athlete can therefore receive different scores, readiness, and caliber for one submission.
2. Gemini still owns division scores. The server only applies a D1 ceiling; deterministic floors, full cascade, readiness, and caliber remain client-only. Same-input reproducibility and byte-for-byte output identity are not established.
3. `generate_lead` fires before success. Lead writes and Brevo sync are fire-and-forget, Supabase result errors are ignored, and the result-page save path can show success after failed persistence.
4. Referral attribution accepts a caller-controlled scout UUID with no signed token or idempotency key. A foreign key proves existence, not authorization; referral insert failure is hidden behind analysis success.
5. Athlete contact data and arbitrary extra fields still cross the Gemini boundary. The public minor-facing flow has no explicit marketing consent or guardian rail, while the full profile persists in local storage and can sync to Brevo.
6. The five-per-hour AI limit is a process-local serverless map, not a durable quota or spend circuit breaker.
7. The result language still calls a model-discounted self-assessment `Verified Level` and exposes `Coach View` / `Internal Scouting Note` without calibration or human evidence review.
8. The product headline promises one answer but the result fragments into five percentages, readiness pillars, funnel analysis, benchmarks, a low-confidence Caliber range, and a separate coach view.
9. The eligibility prompt is stale against the NCAA Division I age-based eligibility model adopted in June 2026. The form does not collect initial full-time collegiate enrollment, which is now a key clock trigger.

## A+ product evidence model

- Athlete outcome: one best realistic recruiting lane today, an explicit confidence level, three supporting facts, disqualifying constraints, and the single next action most likely to change the verdict.
- Operator outcome: a consented, contactable, attributable prospect with fit, urgency, evidence quality, next-best human action, and measurable handoff/conversion state.
- Architectural boundary: one canonical server-side deterministic scorer; Gemini restricted to narrative; one normalized response used by the athlete, website lead, and scout prospect; atomic/idempotent persistence with lifecycle events.
