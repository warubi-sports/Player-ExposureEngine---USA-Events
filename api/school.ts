import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isSchoolSlug, showcaseState } from '../lib/school-mode.js';

type PublicSchool = {
  slug: string;
  school_name: string;
  short_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  crest_path: string | null;
};

type PublicShowcase = {
  event_date: string;
  capacity: number | null;
  registration_count: number | null;
};

async function publicRpc<T>(url: string, key: string, name: string, body: object, schema?: string): Promise<T | null> {
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      ...(schema ? { 'Content-Profile': schema } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} returned ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error(`${name} returned an unexpected shape`);
  return rows[0] ?? null;
}

function schoolColor(value: string | null, fallback: string): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function crestUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^\/crests\/[a-zA-Z0-9._-]+$/.test(path)) return `https://myseason.app${path}`;
  if (/^https:\/\/[a-z0-9.-]+\.myseason\.app\/crests\/[a-zA-Z0-9._-]+$/.test(path)) return path;
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const slug = req.query.slug;
  if (!isSchoolSlug(slug)) return res.status(400).json({ error: 'Invalid school slug' });

  const myseasonUrl = process.env.MYSEASON_SUPABASE_URL;
  const myseasonKey = process.env.MYSEASON_SUPABASE_ANON_KEY;
  const myseasonSchema = process.env.MYSEASON_DB_SCHEMA?.trim();
  const coreUrl = process.env.WARUBI_CORE_SUPABASE_URL;
  const coreKey = process.env.WARUBI_CORE_SUPABASE_ANON_KEY;
  if (!myseasonUrl || !myseasonKey || !coreUrl || !coreKey) {
    return res.status(503).json({ error: 'School lookup is unavailable' });
  }

  try {
    const school = await publicRpc<PublicSchool>(myseasonUrl, myseasonKey,
      'get_myseason_public_school_v1', { p_slug: slug }, myseasonSchema);
    if (!school || school.slug !== slug) return res.status(404).json({ error: 'School not found' });

    // This is the same public availability RPC used by My Season's register page.
    // A missing row can mean no date or a closed event; neither permits booking.
    const event = slug === 'demo' ? null : await publicRpc<PublicShowcase>(coreUrl, coreKey,
      'get_open_showcase_v1', { p_coach_slug: slug });
    const state = showcaseState(event);

    return res.status(200).json({
      name: school.school_name,
      shortName: school.short_name || school.school_name,
      primaryColor: schoolColor(school.primary_color, '#0f766e'),
      secondaryColor: schoolColor(school.secondary_color, '#0f172a'),
      crestUrl: crestUrl(school.crest_path),
      showcase: {
        state,
        date: event?.event_date || null,
        registerUrl: state === 'open' ? `https://${slug}.myseason.app/register` : null,
      },
    });
  } catch (error) {
    console.error('Public school lookup failed', error);
    return res.status(502).json({ error: 'School lookup is unavailable' });
  }
}
