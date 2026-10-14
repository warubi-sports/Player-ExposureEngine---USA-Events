export const isSchoolSlug = (value) => typeof value === 'string'
  && /^[a-z0-9-]{1,40}$/.test(value);

export function leadReferralSource(referralScoutId, confirmedSchoolSlug) {
  if (referralScoutId) return referralScoutId;
  return isSchoolSlug(confirmedSchoolSlug) ? `school:${confirmedSchoolSlug}` : null;
}

// The result already presents 85+ as Elite, 70-84 as Competitive, and below
// 70 as Developing. Use the three football pillars, not exposure or GPA, to
// choose one development step. This is orientation from self-reported inputs.
export function chooseSchoolStep(readiness) {
  const scores = [readiness?.athletic, readiness?.technical, readiness?.tactical];
  if (scores.some(score => typeof score !== 'number' || !Number.isFinite(score))) {
    return 'warubi-verified';
  }
  const footballReadiness = scores.reduce((total, score) => total + score, 0) / 3;
  if (footballReadiness >= 85) return 'warubi-verified';
  if (footballReadiness >= 70) return 'fc-koln-itp';
  return 'european-club-pathway';
}

export const showEstimatedCaliber = (school) => !school;

export function showcaseState(event) {
  if (!event) return 'not_open';
  if (typeof event.capacity === 'number'
    && event.registration_count >= event.capacity) return 'full';
  return 'open';
}
