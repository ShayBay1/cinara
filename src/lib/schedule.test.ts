import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dayLabel, dropLabel, dropOf, easternToInstant, formatCountdown, nextDrop, nextPremieres, releaseDaysLabel } from './schedule';

describe('easternToInstant', () => {
  it('converts 8 PM EDT (summer) to 00:00 UTC the next day', () => {
    assert.equal(easternToInstant(2026, 10, 2, 20).toISOString(), '2026-10-03T00:00:00.000Z');
  });
  it('converts 8 PM EST (winter) to 01:00 UTC the next day', () => {
    assert.equal(easternToInstant(2026, 11, 2, 20).toISOString(), '2026-11-03T01:00:00.000Z');
  });
});

describe('nextPremieres', () => {
  const monWedFri = [1, 3, 5];

  it('returns tonight when it is a release day before 8 PM ET', () => {
    const now = new Date('2026-10-02T23:51:00Z'); // Fri 7:51 PM ET
    const [next] = nextPremieres(monWedFri, now);
    assert.equal(next?.toISOString(), '2026-10-03T00:00:00.000Z');
    assert.equal(dayLabel(next!, now), 'tonight');
  });

  it('skips to the next release day after 8 PM ET', () => {
    const now = new Date('2026-10-03T00:30:00Z'); // Fri 8:30 PM ET
    const [next] = nextPremieres(monWedFri, now);
    assert.equal(next?.toISOString(), '2026-10-06T00:00:00.000Z'); // Mon 8 PM ET
    assert.equal(dayLabel(next!, now), 'Monday');
  });

  it('crosses the daylight-saving change correctly', () => {
    const now = new Date('2026-10-31T12:00:00Z'); // Sat, DST ends Sun Nov 1
    const dates = nextPremieres(monWedFri, now, 2);
    assert.deepEqual(
      dates.map((d) => d.toISOString()),
      ['2026-11-03T01:00:00.000Z', '2026-11-05T01:00:00.000Z'],
    );
  });

  it('works for a device in another time zone (instants are absolute)', () => {
    const now = new Date('2026-10-02T05:00:00Z'); // Fri 1 AM ET
    const [next] = nextPremieres([5], now);
    assert.equal(next?.toISOString(), '2026-10-03T00:00:00.000Z');
  });

  it('returns nothing without release days', () => {
    assert.deepEqual(nextPremieres([], new Date()), []);
  });
});

describe('formatting', () => {
  it('formats countdowns', () => {
    assert.equal(formatCountdown(0), '00:00:00');
    assert.equal(formatCountdown(4 * 3600_000 + 12 * 60_000 + 33_000), '04:12:33');
    assert.equal(formatCountdown(2 * 86_400_000 + 5_000), '2d 00:00:05');
    assert.equal(formatCountdown(-5), '00:00:00');
  });
  it('labels release days in order', () => {
    assert.equal(releaseDaysLabel([5, 1, 3]), 'Mon · Wed · Fri');
    assert.equal(releaseDaysLabel([1]), 'Every Monday');
  });
});

describe('drops', () => {
  it('groups episodes into drops of 10', () => {
    assert.deepEqual(dropOf(1), { number: 1, from: 1, to: 10 });
    assert.deepEqual(dropOf(10), { number: 1, from: 1, to: 10 });
    assert.deepEqual(dropOf(11), { number: 2, from: 11, to: 20 });
    assert.deepEqual(dropOf(58, 60), { number: 6, from: 51, to: 60 });
  });
  it('finds the next drop and stops at the end of the season', () => {
    assert.deepEqual(nextDrop(20, 60), { number: 3, from: 21, to: 30 });
    assert.equal(nextDrop(60, 60), null);
    assert.deepEqual(nextDrop(55, 58), { number: 6, from: 56, to: 58 });
  });
  it('labels drops', () => {
    assert.equal(dropLabel({ number: 3, from: 21, to: 30 }), 'Eps 21–30');
    assert.equal(dropLabel({ number: 6, from: 60, to: 60 }), 'Ep 60');
  });
});
