import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadSchema } from '../lib/lead-target.js';

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

test('the form client and the health reader both pass the schema', () => {
  assert.match(read('services/supabase.ts'), /db: \{ schema: leadSchema\(import\.meta\.env\.VITE_SUPABASE_DB_SCHEMA\)/);
  assert.match(read('api/health.ts'), /db: \{ schema: leadSchema\(process\.env\.VITE_SUPABASE_DB_SCHEMA\)/);
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
