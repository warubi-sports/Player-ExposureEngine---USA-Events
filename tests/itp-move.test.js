import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolveItpTarget, itpProfileHeaders, referralPaused, TargetUnusableError } from '../lib/itp-target.js';

// Exercise the real TS handlers without installing Gemini or Sentry. Neither stub
// can send a request. The existing rate-limit cleanup timer is cleared on import.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@google/genai') return { url: 'itp-test:gemini', shortCircuit: true };
    if (specifier === '../lib/sentry') return { url: 'itp-test:sentry', shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'itp-test:sentry') return { format: 'module', source: '', shortCircuit: true };
    if (url === 'itp-test:gemini') return {
      format: 'module', shortCircuit: true,
      source: `export const Type = {};
        export class GoogleGenAI {
          constructor() { globalThis.__itpGemini.constructed++; }
          models = { generateContent: async () => {
            globalThis.__itpGemini.called++;
            return { text: JSON.stringify(globalThis.__itpGemini.result) };
          }};
        }`,
    };
    return nextLoad(url, context);
  },
});
const originalInterval = globalThis.setInterval;
const timers = [];
globalThis.setInterval = (...args) => { const timer = originalInterval(...args); timers.push(timer); return timer; };
let analyze;
try { ({ default: analyze } = await import('../api/analyze.ts')); }
finally { globalThis.setInterval = originalInterval; timers.forEach(clearInterval); }
const { createScoutProspect } = await import('../api/scout-referral.ts');
const { default: probe } = await import('../api/itp-move-probe.ts');

const ITP = 'https://umblyhwumtadlvgccdwg.supabase.co';
const CORE = 'https://wwomwawpxmkrykybpqok.supabase.co';
const KEY = 'test-service-key-never-return';
const TOKEN = 'test-probe-token-never-return';
const SCOUT = '11111111-2222-4333-8444-555555555555';
const envNames = ['SCOUT_SUPABASE_URL', 'SCOUT_SUPABASE_SERVICE_KEY', 'SCOUT_SUPABASE_DB_SCHEMA', 'ITP_REFERRAL_PAUSED', 'VERCEL_DEPLOYMENT_ID', 'GEMINI_API_KEY', 'ITP_MOVE_PROBE_TOKEN'];
let savedEnv, originalFetch, requests, requestId = 0;
beforeEach(() => {
  savedEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  envNames.forEach(name => delete process.env[name]);
  Object.assign(process.env, { SCOUT_SUPABASE_URL: ITP, SCOUT_SUPABASE_SERVICE_KEY: KEY, GEMINI_API_KEY: 'fake-gemini', ITP_MOVE_PROBE_TOKEN: TOKEN });
  globalThis.__itpGemini = { constructed: 0, called: 0, result: { plainLanguageSummary: 'test analysis' } };
  originalFetch = globalThis.fetch;
  requests = [];
  globalThis.fetch = async (...args) => { requests.push(args); return new Response(null, { status: 201 }); };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  envNames.forEach(name => savedEnv[name] === undefined ? delete process.env[name] : process.env[name] = savedEnv[name]);
  delete globalThis.__itpGemini;
});

function response() {
  return { headers: {}, statusCode: null, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}
function profile(referralScoutId = SCOUT) {
  return { firstName: 'Test', lastName: 'Player', gender: 'Male', position: 'CM', gradYear: 2028, referralScoutId };
}
async function analysis(body = profile()) {
  const res = response();
  await analyze({ method: 'POST', headers: { 'x-forwarded-for': `test-${++requestId}` }, body }, res);
  return res;
}
async function runProbe(authorization = `Bearer ${TOKEN}`) {
  const res = response();
  await probe({ method: 'GET', headers: authorization === null ? {} : { authorization } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(res.body).includes(KEY), false);
  assert.equal(JSON.stringify(res.body).includes(TOKEN), false);
  return res.body;
}
const writers = {
  inline: async () => { assert.equal((await analysis()).statusCode, 200); },
  standalone: async () => createScoutProspect(profile(), globalThis.__itpGemini.result),
};

test('resolver keeps legacy inputs untouched and supplies only the switched profile', () => {
  for (const url of [ITP, 'http://localhost:54321', `${ITP}/`]) {
    for (const schema of [undefined, '', '   ']) {
      const target = resolveItpTarget(url, KEY, schema);
      assert.equal(target.url, url);
      assert.equal(target.key, KEY);
      assert.equal(target.schema, 'public');
      for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE']) assert.deepEqual(itpProfileHeaders(target, method), {});
    }
  }
  const target = resolveItpTarget(CORE, KEY, ' itp ');
  assert.equal(target.schema, 'itp');
  for (const method of ['GET', 'HEAD']) assert.deepEqual(itpProfileHeaders(target, method), { 'Accept-Profile': 'itp' });
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) assert.deepEqual(itpProfileHeaders(target, method), { 'Content-Profile': 'itp' });
});

const unusable = [
  [ITP, 'public'], [ITP, 'ITP'], [ITP, 'itp'], ['http://localhost:54321', 'itp'],
  [CORE, undefined], [CORE, ' '], [CORE, 'other'], [CORE.replace('https:', 'http:'), 'itp'],
  [`${CORE}.evil.example`, 'itp'], ['not-a-url', 'itp'],
  ['https://wwomwawpxmkrykybpqok.supabase.co:444', 'itp'],
  ['https://user:pass@wwomwawpxmkrykybpqok.supabase.co', 'itp'],
];
test('every unusable target throws a named error before a request', () => {
  for (const [url, schema] of unusable) assert.throws(() => resolveItpTarget(url, KEY, schema), TargetUnusableError);
  assert.equal(requests.length, 0);
});

// This literal is the legacy request payload for the minimal valid profile, in
// property order, shared by both existing copies. No expected value uses resolver output.
const legacyBody = JSON.stringify({
  scout_id: SCOUT, name: 'Test Player', email: null, position: 'CM', status: 'lead',
  evaluation: { source: 'exposure_engine', score: 0, summary: 'test analysis', strengths: [], weaknesses: [], collegeLevel: null,
    recommendedPathways: [], coach_evaluation: '', readiness_score: {}, visibility_scores: {},
    caliberMin: null, caliberMax: null, caliberLabel: null, caliberConfidence: null },
  date_of_birth: null, age: null, height: null, dominant_foot: null, nationality: null, club: null, team_level: null,
  gpa: null, grad_year: 2028, sat_act: null, pace: null, physical: null, technical: null, tactical: null,
  activity_status: 'spark', notes: 'Via Exposure Engine. Best fit: null at 0%',
});
for (const [name, write] of Object.entries(writers)) {
  test(`${name}: unset/blank legacy raw requests stay byte for byte unchanged`, async () => {
    for (const [url, schema] of [[ITP, undefined], [ITP, ''], [ITP, '  '], [`${ITP}/`, undefined], ['http://localhost:54321', undefined]]) {
      process.env.SCOUT_SUPABASE_URL = url;
      if (schema !== undefined) process.env.SCOUT_SUPABASE_DB_SCHEMA = schema;
      else delete process.env.SCOUT_SUPABASE_DB_SCHEMA;
      await write();
      assert.deepEqual(requests.at(-1), [`${url}/rest/v1/scout_prospects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=minimal' },
        body: legacyBody,
      }]);
    }
    assert.equal(requests.length, 5);
  });
  test(`${name}: switched raw write uses Core and Content-Profile`, async () => {
    Object.assign(process.env, { SCOUT_SUPABASE_URL: CORE, SCOUT_SUPABASE_DB_SCHEMA: ' itp ' });
    await write();
    assert.deepEqual(requests, [[`${CORE}/rest/v1/scout_prospects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'return=minimal', 'Content-Profile': 'itp' },
      body: legacyBody,
    }]]);
  });
  test(`${name}: unusable and missing credentials refuse without fetch`, async () => {
    for (const [url, schema] of unusable) {
      process.env.SCOUT_SUPABASE_URL = url;
      if (schema === undefined) delete process.env.SCOUT_SUPABASE_DB_SCHEMA;
      else process.env.SCOUT_SUPABASE_DB_SCHEMA = schema;
      await write();
    }
    delete process.env.SCOUT_SUPABASE_SERVICE_KEY;
    await write();
    assert.equal(requests.length, 0);
  });
}

test('pause is trimmed and exact; valid referrals get 503 before Gemini or fetch', async () => {
  process.env.ITP_REFERRAL_PAUSED = ' true ';
  assert.equal(referralPaused(), true);
  const res = await analysis();
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'Scout referrals are paused for maintenance. Please try again in an hour.' });
  assert.equal(res.headers['Retry-After'], '3600');
  assert.equal(globalThis.__itpGemini.constructed, 0);
  assert.equal(globalThis.__itpGemini.called, 0);
  assert.equal(requests.length, 0);
});
test('pause leaves absent or invalid referral analysis unchanged', async () => {
  process.env.ITP_REFERRAL_PAUSED = 'true';
  for (const id of [undefined, '', 'invalid']) {
    const body = profile();
    if (id === undefined) delete body.referralScoutId;
    else body.referralScoutId = id;
    const res = await analysis(body);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, globalThis.__itpGemini.result);
  }
  assert.equal(globalThis.__itpGemini.called, 3);
  assert.equal(requests.length, 0);
});
test('unset and any non-true pause value preserve Gemini and referral writes', async () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1']) {
    if (value === undefined) delete process.env.ITP_REFERRAL_PAUSED;
    else process.env.ITP_REFERRAL_PAUSED = value;
    assert.equal(referralPaused(), false);
    const res = await analysis();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, globalThis.__itpGemini.result);
  }
  assert.equal(globalThis.__itpGemini.called, 5);
  assert.equal(requests.length, 5);
});

for (const [mode, url, schema] of [['TODAY', ITP, ''], ['SWITCHED', CORE, 'itp']]) {
  test(`${mode}: unauthorized probe returns metadata and pause without I/O`, async () => {
    Object.assign(process.env, { SCOUT_SUPABASE_URL: url, SCOUT_SUPABASE_DB_SCHEMA: schema, VERCEL_DEPLOYMENT_ID: 'dpl_test' });
    for (const paused of [false, true]) {
      process.env.ITP_REFERRAL_PAUSED = String(paused);
      for (const authorization of [null, '', `Bearer ${TOKEN.slice(0, -1)}x`, `Bearer ${TOKEN}extra`, 'Bearer short', 'Bearer ü', TOKEN]) {
        assert.deepEqual(await runProbe(authorization), {
          probe: 'itp-move', deployment: 'dpl_test', ref: mode === 'TODAY' ? 'umblyhwumtadlvgccdwg' : 'wwomwawpxmkrykybpqok',
          schema: schema || 'public', phase: null, error: 'token_required', paused: { referral: paused },
        });
        assert.equal(requests.length, 0);
      }
      for (const token of [undefined, '', '   ']) {
        if (token === undefined) delete process.env.ITP_MOVE_PROBE_TOKEN;
        else process.env.ITP_MOVE_PROBE_TOKEN = token;
        const body = await runProbe();
        assert.equal(body.error, 'token_required');
        assert.equal(body.phase, null);
        assert.deepEqual(body.paused, { referral: paused });
        assert.equal(requests.length, 0);
      }
      process.env.ITP_MOVE_PROBE_TOKEN = TOKEN;
    }
  });
}

test('legacy probe reads once with its own credentials, returns only the error code', async t => {
  const timeout = t.mock.method(AbortSignal, 'timeout', ms => {
    assert.equal(ms, 8000);
    return new AbortController().signal;
  });
  globalThis.fetch = async (...args) => {
    requests.push(args);
    return Response.json({ code: 'PGRST202', message: KEY, details: { email: 'private@example.test' } }, { status: 404 });
  };
  assert.deepEqual(await runProbe(), { probe: 'itp-move', deployment: null, ref: 'umblyhwumtadlvgccdwg', schema: 'public', phase: null, error: 'PGRST202', paused: { referral: false } });
  assert.equal(requests.length, 1);
  assert.equal(timeout.mock.callCount(), 1);
  assert.equal(requests[0][0], `${ITP}/rest/v1/rpc/move_phase`);
  const { signal, ...options } = requests[0][1];
  assert.ok(signal instanceof AbortSignal);
  assert.deepEqual(options, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: '{}' });
});
test('switched probe returns phase and deployment, never RPC rows or secrets', async () => {
  Object.assign(process.env, { SCOUT_SUPABASE_URL: CORE, SCOUT_SUPABASE_DB_SCHEMA: 'itp', ITP_REFERRAL_PAUSED: ' true ', VERCEL_DEPLOYMENT_ID: 'dpl_test' });
  globalThis.fetch = async (...args) => { requests.push(args); return Response.json({ phase: 'copying', key: KEY, token: TOKEN, rows: [{ email: 'private@example.test' }] }); };
  const body = await runProbe();
  assert.deepEqual(body, { probe: 'itp-move', deployment: 'dpl_test', ref: 'wwomwawpxmkrykybpqok', schema: 'itp', phase: 'copying', error: null, paused: { referral: true } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0], `${CORE}/rest/v1/rpc/move_phase`);
  assert.equal(requests[0][1].headers['Content-Profile'], 'itp');
  assert.equal(requests[0][1].redirect, 'error');
});
test('probe unusable targets and missing credentials return target_unusable without fetch', async () => {
  for (const [url, schema] of unusable) {
    process.env.SCOUT_SUPABASE_URL = url;
    if (schema === undefined) delete process.env.SCOUT_SUPABASE_DB_SCHEMA;
    else process.env.SCOUT_SUPABASE_DB_SCHEMA = schema;
    assert.equal((await runProbe()).error, 'target_unusable');
  }
  delete process.env.SCOUT_SUPABASE_URL;
  delete process.env.SCOUT_SUPABASE_SERVICE_KEY;
  assert.equal((await runProbe()).ref, null);
  assert.equal((await runProbe()).error, 'target_unusable');
  assert.equal(requests.length, 0);
});
test('probe timeout and network failures do not expose exception messages', async () => {
  globalThis.fetch = async () => { throw new DOMException(KEY, 'TimeoutError'); };
  assert.equal((await runProbe()).error, 'timeout');
  globalThis.fetch = async () => { throw new Error(KEY); };
  assert.equal((await runProbe()).error, null);
});
test('probe rejects non-GET without a request and has an explicit Vercel route', async () => {
  const res = response();
  await probe({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(requests.length, 0);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  const index = config.rewrites.findIndex(rule => rule.source === '/api/itp-move-probe' && rule.destination === '/api/itp-move-probe');
  assert.ok(index >= 0 && index < config.rewrites.findIndex(rule => rule.source === '/(.*)'));
});
