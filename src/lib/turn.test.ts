import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  borderLayout,
  INITIAL_GLIDE,
  nearest,
  pictureAngle,
  stepGlide,
  type GlideState,
  panRoom,
  perimeter,
  reframeAt,
  rollFromGravity,
  shotIndex,
  stageSide,
  type ReframeTrack,
} from './turn';

const G = 9.81;
const deg = (d: number) => (d * Math.PI) / 180;
const gravityAt = (rollDeg: number) => [G * Math.sin(deg(rollDeg)), G * Math.cos(deg(rollDeg)), 0] as const;

test('roll from gravity: upright 0, turned counter-clockwise +90, clockwise -90', () => {
  assert.equal(Math.round(rollFromGravity(...gravityAt(0))!), 0);
  assert.equal(Math.round(rollFromGravity(...gravityAt(90))!), 90);
  assert.equal(Math.round(rollFromGravity(...gravityAt(-90))!), -90);
});

test('lying flat pauses the glide', () => {
  assert.equal(rollFromGravity(0.5, 0.5, G), null);
});

test('the square covers the screen at every angle with no zoom', () => {
  const w = 390;
  const h = 844;
  const side = stageSide(w, h);
  for (let a = 0; a <= 90; a += 1) {
    const c = Math.abs(Math.cos(deg(a)));
    const s = Math.abs(Math.sin(deg(a)));
    const needed = Math.max(w * c + h * s, w * s + h * c);
    assert.ok(needed <= side + 1e-6, `angle ${a}: needs ${needed}, has ${side}`);
  }
});

test('reframe pans freely at rest but shrinks toward center mid-turn', () => {
  const w = 390;
  const h = 844;
  const side = stageSide(w, h);
  const roomX = (side - w) / 2;
  assert.equal(panRoom(w, h, 0, side, roomX * 0.9, 0), 1);
  assert.ok(panRoom(w, h, 0, side, roomX * 2, 0) < 0.51);
  // At the diagonal there's no room at all without zooming.
  const diag = (Math.atan2(w, h) * 180) / Math.PI;
  assert.ok(panRoom(w, h, 90 - diag, side, 40, 0) < 0.02);
  // A push-in (zoom) buys room back.
  assert.equal(panRoom(w, h, 30, side * 1.3, 40, 0), 1);
});

test('reframe track: framing changes at each shot start', () => {
  const track: ReframeTrack = {
    upright: [
      { t: 0, x: 0, y: 0, z: 1 },
      { t: 10, x: 0.1, y: 0, z: 1.05 },
      { t: 20, x: -0.1, y: 0, z: 1 },
    ],
    sideways: [],
  };
  assert.equal(reframeAt(track, false, 5).x, 0);
  assert.equal(reframeAt(track, false, 10).x, 0.1);
  assert.equal(reframeAt(track, false, 99).x, -0.1);
  assert.equal(reframeAt(track, true, 15).x, 0);
  assert.equal(reframeAt(null, false, 15).z, 1);
  assert.equal(shotIndex(track, false, 15), 1);
});

test('border: title and bar keep their spot for the viewer as the phone turns', () => {
  const g = perimeter(390, 844);
  const up = borderLayout(g, 0);
  // Upright, the bar covers the bottom edge (one straight run between two corners).
  assert.ok(Math.abs(up.barTo - up.barFrom - g.lw) < 1e-6);
  // Turned, the bar covers a long edge (the new bottom), and the title moved around a corner.
  const cw = borderLayout(g, -90);
  const ccw = borderLayout(g, 90);
  assert.ok(Math.abs(cw.barTo - cw.barFrom - g.lh) < 1e-6);
  assert.ok(Math.abs(ccw.barTo - ccw.barFrom - g.lh) < 1e-6);
  assert.ok(cw.titleStart < up.titleStart && ccw.titleStart > up.titleStart);
});

// The glide turn, checked against the behaviour of the locked Glide Turn test page.
// phi is the phone's clockwise angle, as in the test page.
function run(st: GlideState, phis: number[], smooth = true) {
  const seen: GlideState[] = [];
  for (const p of phis) {
    st = stepGlide(st, p, 1 / 60, smooth, false);
    seen.push(st);
  }
  return seen;
}
const ramp = (a: number, b: number, frames: number) => Array.from({ length: frames + 1 }, (_, i) => a + ((b - a) * i) / frames);
const hold = (a: number, frames: number) => Array.from({ length: frames }, () => a);
/** Picture tilt relative to the floor. */
const tilt = (st: GlideState) => st.psi;

test('nearest orientation', () => {
  assert.equal(nearest(44), 0);
  assert.equal(nearest(46), 90);
  assert.equal(nearest(-100), -90);
});

test('wobbles under the break angle stay locked', () => {
  const seen = run(INITIAL_GLIDE, [...ramp(0, 12, 12), ...ramp(12, -11, 12), ...ramp(-11, 0, 12)]);
  assert.ok(seen.every((st) => st.mode === 'locked' && pictureAngle(st) === 0));
});

test('glide: past the break angle the picture levels with the floor, then settles and locks', () => {
  const seen = run(INITIAL_GLIDE, [...ramp(0, 90, 40), ...hold(90, 60)]);
  const mid = seen.findIndex((st) => st.phi >= 60);
  assert.equal(seen[mid]!.mode, 'glide');
  assert.ok(Math.abs(tilt(seen[mid]!)) < 6, `level mid-turn, tilt ${tilt(seen[mid]!).toFixed(1)}`);
  const end = seen.at(-1)!;
  assert.equal(end.mode, 'locked');
  assert.equal(end.T, 90);
  assert.ok(Math.abs(pictureAngle(end) + 90) < 0.5);
  assert.equal(seen.filter((st) => st.locked).length, 1, 'one haptic tap');
});

test('and back to upright', () => {
  const there = run(INITIAL_GLIDE, [...ramp(0, 90, 40), ...hold(90, 60)]).at(-1)!;
  const back = run(there, [...ramp(90, 0, 40), ...hold(0, 60)]).at(-1)!;
  assert.equal(back.T, 0);
  assert.equal(back.mode, 'locked');
  assert.ok(Math.abs(pictureAngle(back)) < 0.5);
});

test('change of mind: turn to 40 degrees and back settles upright', () => {
  const end = run(INITIAL_GLIDE, [...ramp(0, 40, 27), ...ramp(40, 3, 27), ...ramp(3, 0, 15), ...hold(0, 60)]).at(-1)!;
  assert.equal(end.T, 0);
  assert.equal(end.mode, 'locked');
});

test('Smooth rotation off: classic flip after holding past 45 degrees for 250 ms', () => {
  const seen = run(INITIAL_GLIDE, [...ramp(0, 70, 10), ...hold(70, 20)], false);
  assert.ok(seen.every((st) => st.mode === 'locked'));
  assert.equal(seen.at(-1)!.T, 90);
  assert.equal(seen[12]!.T, 0);
});

test('the break never jumps: the picture eases level as the phone keeps turning', () => {
  const seen = run(INITIAL_GLIDE, [...ramp(0, 90, 90), ...hold(90, 60)]);
  let worst = 0;
  for (let i = 1; i < seen.length; i++) {
    const a = seen[i - 1]!;
    const b = seen[i]!;
    if (a.mode === 'glide' || b.mode === 'glide') worst = Math.max(worst, Math.abs(tilt(b) - tilt(a)));
  }
  // The phone turns 1 degree per frame here; the picture's tilt never changes much faster than that.
  assert.ok(worst < 1.6, `largest tilt change in one frame: ${worst.toFixed(2)} degrees`);
});

test('a shaky hand still locks, so the controls come back', () => {
  const shaky = Array.from({ length: 120 }, (_, i) => 90 + 3 * Math.sin(i * 0.9) + 2 * Math.sin(i * 2.3));
  const seen = run(INITIAL_GLIDE, [...ramp(0, 90, 40), ...shaky]);
  assert.equal(seen.at(-1)!.mode, 'locked');
  assert.ok(seen.slice(-60).every((st) => st.mode === 'locked'), 'stays locked while held');
});
