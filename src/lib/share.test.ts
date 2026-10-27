import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { giftShare, money, pointsShare, poolFor, previousQuarter, quarterOf } from './share';

describe('poolFor', () => {
  it('pools 40% before the show earns back its budget', () => {
    const r = poolFor(10_000_00, 0, 60_000_00);
    assert.equal(r.poolCents, 4_000_00);
    assert.equal(r.rate, 0.4);
    assert.equal(r.toStepUpCents, 50_000_00);
    assert.equal(r.steppedUpNow, false);
  });
  it('splits a period that crosses the budget at the exact dollar', () => {
    // $8,000 left to the budget: $8,000 at 40% + $6,500 at 60%.
    const r = poolFor(14_500_00, 52_000_00, 60_000_00);
    assert.equal(r.poolCents, 3_200_00 + 3_900_00);
    assert.equal(r.rate, 0.6);
    assert.equal(r.steppedUpNow, true);
    assert.equal(r.toStepUpCents, 0);
  });
  it('stays at 60% for good once past the budget', () => {
    const r = poolFor(10_000_00, 90_000_00, 60_000_00);
    assert.equal(r.poolCents, 6_000_00);
    assert.equal(r.steppedUpNow, false);
  });
  it('lands exactly on the budget as the step-up', () => {
    const r = poolFor(8_000_00, 52_000_00, 60_000_00);
    assert.equal(r.poolCents, 3_200_00);
    assert.equal(r.rate, 0.6);
    assert.equal(r.steppedUpNow, true);
  });
});

describe('pointsShare', () => {
  it('divides the pool by points', () => {
    assert.equal(pointsShare(4_000_00, 6, 20), 1_200_00);
  });
  it('rounds down to the cent and never pays without points', () => {
    assert.equal(pointsShare(100, 1, 3), 33);
    assert.equal(pointsShare(100, 0, 3), 0);
    assert.equal(pointsShare(100, 1, 0), 0);
  });
});

describe('giftShare', () => {
  it('pays 90% after card fees', () => {
    assert.equal(giftShare(10_000, 300), 8_730);
  });
});

describe('quarterOf', () => {
  it('finds the quarter and its pay-by date 30 days after it ends', () => {
    const q = quarterOf(new Date('2026-10-14T12:00:00Z'));
    assert.equal(q.key, '2026-Q4');
    assert.equal(q.label, 'Oct–Dec 2026');
    assert.equal(q.payBy.toISOString().slice(0, 10), '2027-01-30');
    assert.equal(previousQuarter(q).key, '2026-Q3');
    assert.equal(previousQuarter(q).payBy.toISOString().slice(0, 10), '2026-10-30');
  });
});

describe('money', () => {
  it('formats with commas', () => {
    assert.equal(money(213_000), '$2,130.00');
    assert.equal(money(5), '$0.05');
    assert.equal(money(1_234_567_89, { whole: true }), '$1,234,567');
  });
});
