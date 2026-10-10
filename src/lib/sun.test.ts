import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { guessLocation, homeSky, sunrise } from './sun';

// Every time below is local time in Los Angeles.
process.env.TZ = 'America/Los_Angeles';
const LA = { lat: 34.05, lon: -118.24 };

describe('sunrise', () => {
  it('lands within a few minutes of the published time', () => {
    // 9 October 2026, Los Angeles: sunrise about 6:54 AM PDT.
    const rise = sunrise(new Date(2026, 9, 9, 12), LA.lat, LA.lon)!;
    const minutes = rise.getHours() * 60 + rise.getMinutes();
    assert.ok(Math.abs(minutes - (6 * 60 + 54)) <= 4, rise.toString());
  });

  it('stays on the local calendar day', () => {
    const rise = sunrise(new Date(2026, 5, 21, 0, 5), LA.lat, LA.lon)!;
    assert.equal(rise.getDate(), 21);
  });

  it('returns null in polar night', () => {
    assert.equal(sunrise(new Date(2026, 11, 21, 12), 78.2, 15.6), null);
  });
});

describe('homeSky', () => {
  it('is dawn from 3am until sunrise, then day', () => {
    assert.equal(homeSky(new Date(2026, 9, 9, 2, 59), LA), 'day');
    assert.equal(homeSky(new Date(2026, 9, 9, 3, 0), LA), 'dawn');
    assert.equal(homeSky(new Date(2026, 9, 9, 6, 45), LA), 'dawn');
    assert.equal(homeSky(new Date(2026, 9, 9, 7, 10), LA), 'day');
    assert.equal(homeSky(new Date(2026, 9, 9, 22, 0), LA), 'day');
  });
});

describe('guessLocation', () => {
  it('knows common time zones and falls back to the offset', () => {
    assert.deepEqual(guessLocation(new Date(), 'America/Los_Angeles'), {
      lat: 34.05,
      lon: -118.24,
    });
    const g = guessLocation(new Date(), 'Nowhere/Unknown');
    assert.equal(g.lat, 35);
  });
});
