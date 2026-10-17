import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { leadSchema } from '../lib/lead-target.js';
import { checkLeadTarget } from '../lib/lead-target-config.js';

const CORE = 'https://wwomwawpxmkrykybpqok.supabase.co';
const WS = 'https://jeniqwziqenuplvlnely.supabase.co';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('env unset or blank = today: schema public', () => {
  for (const raw of [undefined, null, '', '   ']) assert.equal(leadSchema(raw), 'public');
  assert.equal(leadSchema('public'), 'public');
});

test('the WS hub switch value is accepted, anything else is refused rather than guessed', () => {
  assert.equal(leadSchema(' itp_hub '), 'itp_hub');
  for (const raw of ['gsa', 'ITP_HUB', 'public;drop', 'itp_hub2']) {
    assert.throws(() => leadSchema(raw), /VITE_SUPABASE_DB_SCHEMA/, raw);
  }
});

test('the form client and the health reader both pass the schema; the health reader checks it against its URL', () => {
  assert.match(read('services/supabase.ts'), /db: \{ schema: leadSchema\(import\.meta\.env\.VITE_SUPABASE_DB_SCHEMA\)/);
  assert.match(read('api/health.ts'), /db: \{ schema: checkLeadTarget\(SUPABASE_URL, process\.env\.VITE_SUPABASE_DB_SCHEMA\)/);
});

test('switch guard: Core + itp_hub together or neither (build and health)', () => {
  assert.equal(checkLeadTarget(WS, undefined), 'public');
  assert.equal(checkLeadTarget(WS, ''), 'public');
  assert.equal(checkLeadTarget('', undefined), 'public'); // missing URL: unchanged, createClient refuses as today
  assert.equal(checkLeadTarget(CORE, 'itp_hub'), 'itp_hub');
  assert.equal(checkLeadTarget(`${CORE}/`, ' itp_hub '), 'itp_hub');
  for (const [url, schema] of [[CORE, undefined], [CORE, 'public'], [WS, 'itp_hub'], ['', 'itp_hub'], ['not a url', 'itp_hub']]) {
    assert.throws(() => checkLeadTarget(url, schema), /half-set/, `${url} ${schema}`);
  }
  assert.throws(() => checkLeadTarget(CORE, 'gsa'), /VITE_SUPABASE_DB_SCHEMA must match/);
});

test('vite.config.ts runs the guard on every build; browser code never imports it (Core stays out of the assets)', () => {
  assert.match(read('vite.config.ts'), /\n\s+checkLeadTarget\(env\.VITE_SUPABASE_URL, env\.VITE_SUPABASE_DB_SCHEMA\);\n/);
  const root = new URL('../', import.meta.url).pathname;
  const allowed = new Set(['vite.config.ts', 'api/health.ts', 'lib/lead-target-config.js']);
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = dir ? `${dir}/${d.name}` : d.name;
    if (d.isDirectory()) return ['node_modules', 'dist', 'tests', '.git', '.vercel'].includes(d.name) || /^dist/.test(d.name) ? [] : walk(rel);
    return /\.(ts|tsx|js|mjs)$/.test(d.name) ? [rel] : [];
  });
  const importers = walk('').filter((p) => !allowed.has(p) && /lead-target-config/.test(read(p)));
  assert.deepEqual(importers, []);
});

test('visitor writes stay within the move grants: the RPC or a plain insert, never a table upsert (needs UPDATE)', () => {
  const modal = read('components/AnalysisResult.tsx');
  assert.match(modal, /supabase\.rpc\('upsert_website_lead', \{ lead_data: \{/);
  for (const path of ['App.tsx', 'components/AnalysisResult.tsx']) {
    assert.doesNotMatch(read(path), /\.upsert\(/, path);
  }
});

test('browser files keep the move build check meaningful: no quoted hub schema, no project address', () => {
  // ws-hub-move scripts/vercel.mjs reads the built assets: exactly one project ref, and a quoted itp_hub that only
  // the inlined VITE_SUPABASE_DB_SCHEMA may bring.
  for (const path of ['lib/lead-target.js', 'services/supabase.ts']) {
    const text = read(path);
    assert.doesNotMatch(text, /["'`]itp_hub["'`]/, path);
    assert.doesNotMatch(text, /wwomwawpxmkrykybpqok|jeniqwziqenuplvlnely|[a-z]{20}\.supabase\.co/, path);
  }
});
