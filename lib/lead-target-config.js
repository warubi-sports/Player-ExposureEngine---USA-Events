// Build + server guard for the WS hub switch (warubi-network ops/ws-hub-move RUNBOOK P3d): vite.config.ts runs it on
// every build, api/health.ts on every health read. Browser code never imports it, so Core's address below stays out
// of the assets the move's build check (scripts/vercel.mjs) reads for exactly one project.
//
// All or none: the Supabase URL is Core <=> the schema is itp_hub. Neither = today, unchanged. Core with schema public
// would reach Core's own public.website_leads; itp_hub on another project has no such schema. Both refuse.
import { leadSchema } from './lead-target.js';

const CORE_HOST = 'wwomwawpxmkrykybpqok.supabase.co';

export function checkLeadTarget(url, rawSchema) {
  const schema = leadSchema(rawSchema);
  let host = '';
  try { host = new URL(String(url ?? '').trim()).host; } catch { host = ''; }
  const onCore = host === CORE_HOST;
  if (onCore !== (schema === 'itp_hub')) {
    throw new Error(`WS hub switch env is half-set: the Supabase URL ${onCore ? 'is' : 'is not'} Core and `
      + `VITE_SUPABASE_DB_SCHEMA is ${schema}; set both or neither`);
  }
  return schema;
}
