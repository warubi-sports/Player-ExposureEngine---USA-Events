import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSchoolStep, isSchoolSlug, showEstimatedCaliber, showcaseState } from '../lib/school-mode.js';

test('a school slug has a bounded lowercase public handle', () => {
  assert.equal(isSchoolSlug('hpu'), true);
  assert.equal(isSchoolSlug('usc-aiken2'), true);
  for (const slug of ['', 'HPU', 'hpu.school', 'hpu/next', 'a'.repeat(41), null]) {
    assert.equal(isSchoolSlug(slug), false, String(slug));
  }
});

test('each existing football-readiness band selects exactly one step', () => {
  const readiness = score => ({ athletic: score, technical: score, tactical: score });
  assert.equal(chooseSchoolStep(readiness(100)), 'warubi-verified');
  assert.equal(chooseSchoolStep(readiness(85)), 'warubi-verified');
  assert.equal(chooseSchoolStep(readiness(84)), 'fc-koln-itp');
  assert.equal(chooseSchoolStep(readiness(70)), 'fc-koln-itp');
  assert.equal(chooseSchoolStep(readiness(69)), 'european-club-pathway');
  assert.equal(chooseSchoolStep(readiness(0)), 'european-club-pathway');
  assert.equal(chooseSchoolStep(null), 'warubi-verified');
});

test('school mode removes estimated Caliber from screen and PDF source', () => {
  assert.equal(showEstimatedCaliber(null), true);
  assert.equal(showEstimatedCaliber({ name: 'Hawaii Pacific' }), false);
});

test('a public showcase is bookable only with remaining capacity', () => {
  assert.equal(showcaseState(null), 'not_open');
  assert.equal(showcaseState({ capacity: 20, registration_count: 20 }), 'full');
  assert.equal(showcaseState({ capacity: 20, registration_count: 19 }), 'open');
  assert.equal(showcaseState({ capacity: null, registration_count: 20 }), 'open');
});
