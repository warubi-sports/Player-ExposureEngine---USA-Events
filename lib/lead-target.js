// The database schema of the form's website_leads target, for the browser client and the health reader.
//
// Unset = today: schema public in the project of VITE_SUPABASE_URL. At the WS hub switch (warubi-network
// frameworks/v1-foundation-ops/ops/ws-hub-move RUNBOOK P3d) the build env names Warubi Core and sets
// VITE_SUPABASE_DB_SCHEMA to the hub schema; the upsert_website_lead RPC (a resubmission fills only empty fields,
// never rewrites a saved value), the e-mail-less insert and the sync-lead-to-brevo call then all reach Core.
// Anything else is refused rather than guessed.
//
// This file ships to the browser and deliberately holds no quoted switch schema and no project address: the move's
// build check reads the bundle for exactly one project and for a quoted hub schema that only the inlined env brings.
export function leadSchema(raw) {
  const value = typeof raw === 'string' && raw.trim() ? raw.trim() : 'public';
  if (!/^(public|itp_hub)$/.test(value)) throw new Error('VITE_SUPABASE_DB_SCHEMA must match /^(public|itp_hub)$/');
  return value;
}
