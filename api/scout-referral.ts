import '../lib/sentry';
import { resolveItpTarget, itpProfileHeaders } from '../lib/itp-target.js';
/**
 * Scout Referral - Creates a prospect in the scout's pipeline
 * when a player completes an Exposure Engine analysis via ?ref=<scoutId>
 *
 * Best-effort: never blocks or fails the analysis response.
 * Uses service_role key to bypass RLS (server-side only).
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map self-assessment labels to 1-99 scale
const RATING_MAP: Record<string, number> = {
  Elite: 95,
  'Top 10%': 85,
  'Above Average': 70,
  Average: 50,
  'Below Average': 30,
};

function ratingToInt(val: string | undefined): number | null {
  if (!val) return null;
  return RATING_MAP[val] ?? null;
}

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob + 'T12:00:00');
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export async function createScoutProspect(profile: any, result: any): Promise<void> {
  const scoutId = profile.referralScoutId;
  if (!scoutId || !UUID_REGEX.test(scoutId)) return;

  const url = process.env.SCOUT_SUPABASE_URL;
  const serviceKey = process.env.SCOUT_SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    console.warn('Scout referral: missing SCOUT_SUPABASE_URL or SCOUT_SUPABASE_SERVICE_KEY');
    return;
  }

  let target;
  try {
    target = resolveItpTarget(url, serviceKey, process.env.SCOUT_SUPABASE_DB_SCHEMA);
  } catch {
    console.warn('Scout referral: target_unusable');
    return;
  }

  // Visibility scores and best fit
  const visScores = Array.isArray(result.visibilityScores) ? result.visibilityScores : [];
  const sorted = [...visScores].sort((a: any, b: any) => b.visibilityPercent - a.visibilityPercent);
  const bestLevel = sorted[0]?.level || null;
  const bestScore = sorted[0]?.visibilityPercent || 0;

  // Latest season for club/team info
  const latestSeason = Array.isArray(profile.seasons) && profile.seasons.length > 0
    ? profile.seasons.reduce((a: any, b: any) => (b.year >= a.year ? b : a))
    : null;

  // Athletic profile ratings (self-assessed labels -> 1-99 integers)
  const ap = profile.athleticProfile || {};

  const prospect = {
    // Required fields
    scout_id: scoutId,
    name: `${profile.firstName} ${profile.lastName}`.trim(),
    email: profile.email || null,
    position: profile.position || null,
    status: 'lead',
    evaluation: {
      source: 'exposure_engine',
      score: bestScore,
      summary: result.plainLanguageSummary || '',
      strengths: result.keyStrengths || [],
      weaknesses: (result.keyRisks || []).map((r: any) => `${r.category}: ${r.message}`),
      collegeLevel: bestLevel,
      recommendedPathways: sorted.slice(0, 3).map((v: any) => `${v.level}: ${v.visibilityPercent}%`),
      coach_evaluation: result.coachShortEvaluation || '',
      readiness_score: result.readinessScore || {},
      visibility_scores: Object.fromEntries(
        visScores.map((v: any) => [v.level, v.visibilityPercent])
      ),
      caliberMin: result.estimatedCaliber?.rangeLow ?? null,
      caliberMax: result.estimatedCaliber?.rangeHigh ?? null,
      caliberLabel: result.estimatedCaliber?.label ?? null,
      caliberConfidence: result.estimatedCaliber?.confidence ?? null,
    },

    // Optional fields - fill what we have
    date_of_birth: profile.dateOfBirth || null,
    age: calculateAge(profile.dateOfBirth),
    height: profile.height || null,
    dominant_foot: profile.dominantFoot || null,
    nationality: Array.isArray(profile.citizenship)
      ? profile.citizenship.join(', ')
      : profile.citizenship || null,
    club: latestSeason?.teamName || null,
    team_level: latestSeason?.competitiveLevel || latestSeason?.league?.[0] || null,
    gpa: profile.academics?.gpa ?? null,
    grad_year: profile.gradYear ?? null,
    sat_act: profile.academics?.testScore || null,

    // Athletic ratings as 1-99
    pace: ratingToInt(ap.speed),
    physical: ratingToInt(ap.strength),
    technical: ratingToInt(ap.technical),
    tactical: ratingToInt(ap.tactical),

    activity_status: 'spark',
    notes: `Via Exposure Engine. Best fit: ${bestLevel} at ${bestScore}%`,
  };

  const response = await fetch(`${target.url}/rest/v1/scout_prospects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: target.key,
      Authorization: `Bearer ${target.key}`,
      Prefer: 'return=minimal',
      ...itpProfileHeaders(target, 'POST'),
    },
    body: JSON.stringify(prospect),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.warn(`Scout referral: POST failed (${response.status}): ${body}`);
  }
}
