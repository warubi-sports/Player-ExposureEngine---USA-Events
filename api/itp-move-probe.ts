import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolveItpTarget, itpProfileHeaders, referralPaused } from '../lib/itp-target.js';

function projectRef(url: string | undefined): string | null {
  try { return new URL(url || '').hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SCOUT_SUPABASE_URL;
  const key = process.env.SCOUT_SUPABASE_SERVICE_KEY;
  const schemaEnv = process.env.SCOUT_SUPABASE_DB_SCHEMA;
  const answer = {
    probe: 'itp-move',
    deployment: process.env.VERCEL_DEPLOYMENT_ID || null,
    ref: projectRef(url),
    schema: schemaEnv?.trim() === 'itp' ? 'itp' : 'public',
    phase: null as string | null,
    error: null as string | null,
    paused: { referral: referralPaused() },
  };

  const token = process.env.ITP_MOVE_PROBE_TOKEN;
  const authorization = req.headers?.authorization;
  // Fixed-size digests keep the secret comparison constant-time across token lengths.
  if (!token?.trim() || typeof authorization !== 'string' || !timingSafeEqual(
    createHash('sha256').update(authorization).digest(),
    createHash('sha256').update(`Bearer ${token}`).digest(),
  )) {
    answer.error = 'token_required';
    return res.status(200).json(answer);
  }

  let target;
  try {
    target = resolveItpTarget(url, key, schemaEnv);
    if (!url || !key) throw new Error('Missing target');
  } catch {
    answer.error = 'target_unusable';
    return res.status(200).json(answer);
  }

  try {
    // The same service target as the referral writers; move_phase is read-only.
    const response = await fetch(`${target.url}/rest/v1/rpc/move_phase`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        apikey: target.key,
        Authorization: `Bearer ${target.key}`,
        ...itpProfileHeaders(target, 'POST'),
      },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (response.ok) {
      answer.phase = typeof data?.phase === 'string' ? data.phase : null;
    } else {
      // Only PostgREST/SQLSTATE codes, never messages, details or returned rows.
      answer.error = typeof data?.code === 'string' && /^(?:PGRST\d{3}|[A-Z0-9]{5})$/.test(data.code)
        ? data.code : null;
    }
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) answer.error = 'timeout';
  }
  return res.status(200).json(answer);
}
