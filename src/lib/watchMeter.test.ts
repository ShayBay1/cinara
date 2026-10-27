import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { newSessionId, WatchMeter } from './watchMeter';

describe('WatchMeter', () => {
  it('counts normal playback', () => {
    const m = new WatchMeter();
    for (let i = 0; i <= 60; i++) m.feed(i * 0.25, i * 250);
    assert.equal(m.take().seconds, 15);
  });
  it('ignores a seek forward', () => {
    const m = new WatchMeter();
    m.feed(10, 0);
    m.feed(10.25, 250);
    m.feed(80, 500); // scrubbed ahead
    m.feed(80.25, 750);
    assert.equal(m.take().seconds, 0.5);
  });
  it('ignores seeking back and paused time', () => {
    const m = new WatchMeter();
    m.feed(30, 0);
    m.feed(5, 250);
    m.pause();
    m.feed(5, 60_000);
    m.feed(5.25, 60_250);
    assert.equal(m.take().seconds, 0.25);
  });
  it('numbers ticks and resets after each take', () => {
    const m = new WatchMeter();
    m.feed(0, 0);
    m.feed(1, 1000);
    assert.deepEqual(m.take(), { seconds: 1, seq: 0 });
    assert.deepEqual(m.take(), { seconds: 0, seq: 1 });
  });
  it('makes v4 UUIDs', () => {
    assert.match(newSessionId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
