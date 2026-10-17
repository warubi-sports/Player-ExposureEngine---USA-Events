import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import school from '../api/school.ts';
import probe from '../api/my-season-move-probe.ts';

const LEGACY = 'https://legacytest.supabase.co';
const CORE = 'https://coretest.supabase.co';
const KEY = 'fake-myseason-anon-key';
const CORE_KEY = 'fake-core-anon-key';
const envNames = ['MYSEASON_SUPABASE_URL', 'MYSEASON_SUPABASE_ANON_KEY', 'MYSEASON_DB_SCHEMA',
  'WARUBI_CORE_SUPABASE_URL', 'WARUBI_CORE_SUPABASE_ANON_KEY', 'VERCEL_DEPLOYMENT_ID'];
const schoolRow = { slug: 'campus', school_name: 'School', short_name: null,
  primary_color: null, secondary_color: null, crest_path: null };
let savedEnv, originalFetch, requests;
beforeEach(() => {
  savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  envNames.forEach(name => delete process.env[name]);
  Object.assign(process.env, {
    MYSEASON_SUPABASE_URL: LEGACY, MYSEASON_SUPABASE_ANON_KEY: KEY,
    WARUBI_CORE_SUPABASE_URL: CORE, WARUBI_CORE_SUPABASE_ANON_KEY: CORE_KEY,
  });
  originalFetch = globalThis.fetch;
  requests = [];
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return Response.json(args[0].endsWith('/get_myseason_public_school_v1') ? [schoolRow] : []);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  envNames.forEach(name => savedEnv[name] === undefined ? delete process.env[name] : process.env[name] = savedEnv[name]);
});

function response() {
  return { headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
async function runSchool() {
  const res = response();
  await school({ method: 'GET', query: { slug: 'campus' } }, res);
  assert.equal(res.statusCode, 200);
  return res.body;
}
async function runProbe() {
  const res = response();
  await probe({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(res.body).includes(KEY), false);
  return res.body;
}
const legacySchoolRequest = [`${LEGACY}/rest/v1/rpc/get_myseason_public_school_v1`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: '{"p_slug":"campus"}',
}];
const showcaseRequest = [`${CORE}/rest/v1/rpc/get_open_showcase_v1`, {
  method: 'POST',
  headers: { apikey: CORE_KEY, Authorization: `Bearer ${CORE_KEY}`, 'Content-Type': 'application/json' },
  body: '{"p_coach_slug":"campus"}',
}];

test('unset or blank schema preserves both legacy requests byte for byte', async () => {
  for (const schema of [undefined, '', '   ']) {
    if (schema === undefined) delete process.env.MYSEASON_DB_SCHEMA;
    else process.env.MYSEASON_DB_SCHEMA = schema;
    requests.length = 0;
    await runSchool();
    assert.deepEqual(requests, [legacySchoolRequest, showcaseRequest]);
  }
});
test('schema selects only the My Season RPC even when both clients use Core', async () => {
  Object.assign(process.env, { MYSEASON_SUPABASE_URL: `${CORE}/`, MYSEASON_DB_SCHEMA: ' myseason ' });
  await runSchool();
  assert.deepEqual(requests, [[`${CORE}/rest/v1/rpc/get_myseason_public_school_v1`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Content-Profile': 'myseason' },
    body: '{"p_slug":"campus"}',
  }], showcaseRequest]);
});
test('legacy probe reports the missing RPC code with no schema header', async t => {
  const timeout = t.mock.method(AbortSignal, 'timeout', ms => {
    assert.equal(ms, 8000);
    return new AbortController().signal;
  });
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return Response.json({ code: 'PGRST202', message: KEY, details: CORE_KEY }, { status: 404 });
  };
  assert.deepEqual(await runProbe(), { probe: 'my-season-move', deployment: null, ref: 'legacytest',
    schema: 'public', phase: null, error: 'PGRST202', paused: {} });
  assert.equal(timeout.mock.callCount(), 1);
  assert.equal(requests.length, 1);
  const [url, { signal, ...options }] = requests[0];
  assert.equal(url, `${LEGACY}/rest/v1/rpc/move_phase`);
  assert.ok(signal instanceof AbortSignal);
  assert.deepEqual(options, { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: '{}' });
});
test('switched probe reports deployment and phase from its own anon target only', async () => {
  Object.assign(process.env, { MYSEASON_SUPABASE_URL: `${CORE}/`, MYSEASON_DB_SCHEMA: ' myseason ', VERCEL_DEPLOYMENT_ID: 'dpl_test' });
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return Response.json({ phase: 'copying', details: KEY, rows: [CORE_KEY] });
  };
  assert.deepEqual(await runProbe(), { probe: 'my-season-move', deployment: 'dpl_test', ref: 'coretest',
    schema: 'myseason', phase: 'copying', error: null, paused: {} });
  assert.equal(requests.length, 1);
  const [url, { signal, ...options }] = requests[0];
  assert.equal(url, `${CORE}/rest/v1/rpc/move_phase`);
  assert.ok(signal instanceof AbortSignal);
  assert.deepEqual(options, { method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Profile': 'myseason' }, body: '{}' });
});
test('probe omits unexpected error text and unsuccessful response phases', async () => {
  for (const code of ['42501', 'PGRST106', KEY]) {
    globalThis.fetch = async () => Response.json({ code, phase: 'copying', message: KEY }, { status: 403 });
    const body = await runProbe();
    assert.equal(body.error, code === KEY ? null : code);
    assert.equal(body.phase, null);
  }
});
test('probe missing credentials, timeout and network failure expose no private detail', async () => {
  delete process.env.MYSEASON_SUPABASE_URL;
  assert.deepEqual(await runProbe(), { probe: 'my-season-move', deployment: null, ref: null,
    schema: 'public', phase: null, error: 'target_unusable', paused: {} });
  process.env.MYSEASON_SUPABASE_URL = LEGACY;
  delete process.env.MYSEASON_SUPABASE_ANON_KEY;
  assert.equal((await runProbe()).error, 'target_unusable');
  assert.equal(requests.length, 0);
  process.env.MYSEASON_SUPABASE_ANON_KEY = KEY;
  globalThis.fetch = async () => { throw new DOMException(KEY, 'TimeoutError'); };
  assert.equal((await runProbe()).error, 'timeout');
  globalThis.fetch = async () => { throw new Error(KEY); };
  assert.equal((await runProbe()).error, null);
});
test('probe is GET only and routed ahead of the SPA fallback', async () => {
  const res = response();
  await probe({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(requests.length, 0);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const index = config.rewrites.findIndex(rule => rule.source === '/api/my-season-move-probe' && rule.destination === '/api/my-season-move-probe');
  assert.ok(index >= 0 && index < config.rewrites.findIndex(rule => rule.source === '/(.*)'));
});
