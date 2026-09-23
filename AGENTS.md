# Exposure Engine

## About
AI-powered visibility calculator for elite youth soccer players targeting US college recruitment. Players input their profile and get realistic visibility scores, readiness assessments, and a 90-day optimization plan.

## Supabase
- Project: Warubi Sports
- ID: jeniqwziqenuplvlnely
- Region: us-east-1

## Vercel
- App: exposureengine
- URL: https://exposure-engine.vercel.app
- Project ID: prj_FcZ0vQHYmOPcphy4knv8Peocq0nI

## Stack
- React 19 + Vite 6 + TypeScript
- Tailwind CSS 4 (dark/light theme)
- Google Gemini API (via Vercel serverless `/api/analyze.ts`)
- Recharts 3.5 (bar charts, benchmarks)
- jsPDF + html2canvas-pro (PDF export, dynamically imported)
- No auth — public-facing app, Supabase anon key only

## Key Files
- `App.tsx` — Main layout, theme state, analysis orchestration
- `components/PlayerInputForm.tsx` — Multi-section form (62KB), localStorage autosave, demo data
- `components/AnalysisResult.tsx` — Results dashboard (62KB), Player/Coach view toggle, PDF export
- `api/analyze.ts` — Vercel serverless function with Gemini system prompt (26KB)
- `services/geminiService.ts` — Client-side Gemini integration + deterministic readiness calc
- `services/supabase.ts` — Supabase client (fire-and-forget lead saves)
- `types.ts` — All TypeScript interfaces
- `constants.ts` — Leagues, positions, levels, athletic ratings

## Key Tables
- `website_leads` — Player submissions + analysis results (upsert by email)
- `profiles` — User profiles (legacy/future)

## Architecture Notes
- **Deterministic scoring**: Visibility score floors are hardcoded by league tier/gender in `api/analyze.ts` — prevents LLM underscoring
- **Verification Gap**: Dual readiness scores (Your Rating vs Verified Level) with gap callout
- **Self-assessment cap**: Athletic ratings capped by league tier to prevent inflation
- **Fire-and-forget**: Lead saves to Supabase don't block UI. Edge function `sync-lead-to-brevo` syncs to email CRM
- **System prompt in serverless only**: Lives in `api/analyze.ts`, not shared with client (Vercel bundler can't resolve cross-dir TS imports)
- **Dynamic imports**: Supabase, jsPDF, html2canvas loaded on demand to reduce bundle

## Gotchas
- Mobile GPU lag from `blur-[120px]` — hide decorative blurs on mobile (`hidden md:block`)
- Vercel serverless can't resolve cross-directory TypeScript imports from Vite — inline shared constants in `api/analyze.ts`
- GPA field uses `type="text"` + `inputMode="decimal"` (not `type="number"`) — see React controlled input rejection pattern
