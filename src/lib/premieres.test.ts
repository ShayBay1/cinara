import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Show } from '../data/types';

import { premiereFor, premiereStage } from './premieres';

const show = {
  id: 's',
  title: 'S',
  releaseDays: [5],
  latestEpisode: 10,
  episodeCount: 60,
} as unknown as Show;
// Friday 2 October 2026, 8 PM Eastern = 00:00 UTC Saturday.
const eight = new Date('2026-10-03T00:00:00Z');
const at = (min: number) => new Date(eight.getTime() + min * 60_000);

describe('premiereStage', () => {
  it('counts down until the doors open 15 minutes before', () => {
    assert.equal(premiereStage(eight, at(-16)), 'countdown');
    assert.equal(premiereStage(eight, at(-14)), 'doors');
  });
  it('is live for 45 minutes, then the after-chat', () => {
    assert.equal(premiereStage(eight, at(1)), 'live');
    assert.equal(premiereStage(eight, at(44)), 'live');
    assert.equal(premiereStage(eight, at(46)), 'after');
  });
});

describe('premiereFor', () => {
  it("keeps tonight's premiere current once it has started (live, not next week)", () => {
    assert.equal(premiereFor(show, at(5))?.at.toISOString(), eight.toISOString());
    assert.equal(premiereFor(show, at(55))?.at.toISOString(), eight.toISOString());
  });
  it('moves to next week once the after-chat is over', () => {
    assert.equal(premiereFor(show, at(61))?.at.toISOString(), '2026-10-10T00:00:00.000Z');
  });
  it('plays the next unreleased drop', () => {
    assert.deepEqual(premiereFor(show, at(-60))?.drop, { number: 2, from: 11, to: 20 });
  });
});
