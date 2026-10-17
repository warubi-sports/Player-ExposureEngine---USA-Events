const CORE_HOST = 'wwomwawpxmkrykybpqok.supabase.co';

export class TargetUnusableError extends Error {
  constructor() {
    super('ITP target is unusable');
    this.name = 'TargetUnusableError';
  }
}

// Keep legacy URL/key bytes intact. Schema selection is explicit and never
// supplies a fallback URL or key, including when Core was set prematurely.
export function resolveItpTarget(url, key, schemaEnv) {
  const schema = (schemaEnv ?? '').trim();
  let parsed;
  try { parsed = new URL(url); } catch { /* Legacy local targets stay unchanged. */ }
  const isCore = parsed?.hostname === CORE_HOST;
  if (schema && schema !== 'itp') throw new TargetUnusableError();
  if (schema === 'itp') {
    if (!isCore || parsed.protocol !== 'https:' || parsed.host !== CORE_HOST || parsed.username || parsed.password) {
      throw new TargetUnusableError();
    }
    return { url, key, schema: 'itp' };
  }
  if (isCore) throw new TargetUnusableError();
  return { url, key, schema: 'public' };
}

export function itpProfileHeaders(target, method) {
  if (target.schema !== 'itp') return {};
  return ['GET', 'HEAD'].includes(method.toUpperCase())
    ? { 'Accept-Profile': 'itp' }
    : { 'Content-Profile': 'itp' };
}

export function referralPaused() {
  return process.env.ITP_REFERRAL_PAUSED?.trim() === 'true';
}
