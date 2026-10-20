import type { VercelRequest, VercelResponse } from '@vercel/node';

function projectRef(url: string | undefined): string | null {
  try { return new URL(url || '').hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null; }
  catch { return null; }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.MYSEASON_SUPABASE_URL;
  const key = process.env.MYSEASON_SUPABASE_ANON_KEY;
  const schema = process.env.MYSEASON_DB_SCHEMA?.trim();
  const answer = {
    probe: 'my-season-move',
    deployment: process.env.VERCEL_DEPLOYMENT_ID || null,
    ref: projectRef(url),
    schema: schema || 'public',
    phase: null as string | null,
    error: null as string | null,
    paused: {},
  };
  if (!url || !key) {
    answer.error = 'target_unusable';
    return res.status(200).json(answer);
  }

  try {
    // Same anon target and POST profile as the public school lookup.
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/move_phase`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(schema ? { 'Content-Profile': schema } : {}),
      },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();
    if (response.ok) {
      answer.phase = typeof data?.phase === 'string' ? data.phase : null;
    } else {
      // Report codes only; never return messages, details or rows.
      answer.error = typeof data?.code === 'string' && /^(?:PGRST\d{3}|[A-Z0-9]{5})$/.test(data.code)
        ? data.code : null;
    }
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) answer.error = 'timeout';
  }
  return res.status(200).json(answer);
}
