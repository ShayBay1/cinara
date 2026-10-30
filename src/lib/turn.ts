/**
 * Turn math for the player: one square picture that stays level while the phone turns.
 *
 * The picture is a square master (2160 x 2160, streamed at 1920 x 1920). It is drawn as a square
 * exactly as wide as the screen's diagonal, so the screen stays filled at ANY angle without zooming.
 * That is the "turn circle": the circle inside the square holds everything both views need.
 *
 * Every function here is a worklet so it can run on the UI thread, and plain TypeScript so it can be
 * unit-tested in Node (see turn.test.ts).
 */

/** Resting orientations, in degrees the picture is rotated inside the phone. 0 = upright. */
export type Orientation = 0 | 90 | -90;

/** The slow camera move that reframes after a turn settles. Locked at 4 seconds. */
export const REFRAME_MS = 4000;
/** Title and progress bar show this long when an episode opens, or after a tap. */
export const CHROME_MS = 3000;
/** Fade for the title, bar and controls (tap in and tap out use the same fade). */
export const CHROME_FADE_MS = 260;
/** Below this share of gravity in the screen plane, the phone is lying flat and gliding pauses. */
export const FLAT_RATIO = 0.4;
/** How far the phone turns before the picture breaks into a glide (the test page used 20). */
export const BREAK_DEG = 12;
/** After the break, the picture catches up to level gradually over this much more turning (no jump). */
export const CATCH_DEG = 28;
/** Below this speed (degrees per second) the phone counts as truly still, not just turning slowly. */
export const STILL_VEL = 10;

/** Clamp to [lo, hi]. */
export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

/** Wrap an angle into (-180, 180]. */
export function wrapDeg(a: number): number {
  'worklet';
  let x = a % 360;
  if (x > 180) x -= 360;
  if (x <= -180) x += 360;
  return x;
}

/**
 * The phone's roll from gravity, in degrees. 0 = upright, +90 = turned counter-clockwise (top of the
 * phone pointing left), -90 = turned clockwise. Gravity uses the Android convention (upright: y = +g);
 * useTurn flips iPhone readings, which point the other way. Returns null when the phone is lying flat.
 */
export function rollFromGravity(x: number, y: number, z: number): number | null {
  'worklet';
  const inPlane = Math.sqrt(x * x + y * y);
  const total = Math.sqrt(x * x + y * y + z * z);
  if (total < 1e-3 || inPlane / total < FLAT_RATIO) return null;
  return (Math.atan2(x, y) * 180) / Math.PI;
}

// ---------- The glide turn (ported 1:1 from the locked Glide Turn test page) ----------
//
// Names follow the test page. phi is the phone's angle (clockwise, degrees). psi is the picture's angle
// in the room (0 = level with the floor). T is the orientation the phone is locked to (0, 90 or -90).
// The picture's rotation inside the phone is psi - phi.
//
// - locked: the picture sits square in the phone (psi = phi - T). Past BREAK_DEG from T it starts to glide.
// - glide:  the picture eases from its tilt at the break to level with the floor over the next CATCH_DEG
//           of turning (a spring, omega 26, follows that target), then holds level.
// - settle: once the phone is calm within 15 degrees of an orientation, or has been still for 0.35 s,
//           T becomes that orientation and a softer spring (omega 18) eases the picture square into it.
//           Moving more than BREAK_DEG away again goes back to gliding.
// - lock:   when the spring lands, the turn locks with one light haptic tap.
// - Smooth rotation off ("classic"): hold past 45 degrees for 250 ms, then flip instantly.
// - Reduce Motion: no springs; the picture jumps level, then square.

export type GlideMode = 'locked' | 'glide' | 'settle';

export interface GlideState {
  phi: number;
  prev: number;
  /** Smoothed angular speed of the phone, degrees per second. */
  vel: number;
  /** Seconds the phone has been calm. */
  still: number;
  /** Seconds held past 45 degrees (classic mode only). */
  holdT: number;
  T: Orientation;
  mode: GlideMode;
  psi: number;
  psiV: number;
  /** Seconds spent settling. */
  settleT: number;
  /** Set on the frame the turn locks (the caller plays the haptic tap). */
  locked: boolean;
}

export const INITIAL_GLIDE: GlideState = { phi: 0, prev: 0, vel: 0, still: 0, holdT: 0, T: 0, mode: 'locked', psi: 0, psiV: 0, settleT: 0, locked: false };

/** Nearest orientation, as in the test page. */
export function nearest(a: number): Orientation {
  'worklet';
  return Math.max(-90, Math.min(90, Math.round(a / 90) * 90)) as Orientation;
}

/** One frame of the glide turn. phi: the phone's angle (clockwise), or null when it is lying flat. */
export function stepGlide(prev: GlideState, phiIn: number | null, dt: number, smooth: boolean, reduce: boolean): GlideState {
  'worklet';
  const s = { ...prev, locked: false };
  if (phiIn === null) return s;
  // Keep phi continuous (no jump at +-180) and inside the test page's range.
  const phi = clamp(s.phi + wrapDeg(phiIn - s.phi), -110, 110);
  s.phi = phi;

  const spring = (target: number, omega: number) => {
    // critically damped spring on psi
    let x = s.psi - target;
    let v = s.psiV;
    const a = -omega * omega * x - 2 * omega * v;
    v += a * dt;
    x += v * dt;
    s.psi = target + x;
    s.psiV = v;
  };
  const lock = () => {
    s.mode = 'locked';
    s.psi = phi - s.T;
    s.psiV = 0;
    s.locked = true;
  };

  const d = phi - s.T;
  const N = nearest(phi);
  const v = (phi - s.prev) / Math.max(dt, 1e-3);
  s.prev = phi;
  s.vel += (v - s.vel) * Math.min(1, dt * 12);
  const calm = Math.abs(s.vel) < 40;
  // "Still" means really stopped. A slow, steady turn (say 20 degrees a second) is still a turn: if it
  // counted as still, the picture would settle back square mid-turn, then break again, over and over,
  // which made it wobble out of level and run ahead of the phone.
  s.still = Math.abs(s.vel) < STILL_VEL ? s.still + dt : 0;

  if (!smooth) {
    // classic: hold past 45 degrees for 250 ms, then flip instantly
    if (N !== s.T) {
      s.holdT += dt;
      if (s.holdT > 0.25) {
        s.T = N;
        s.locked = true;
      }
    } else s.holdT = 0;
    s.psi = phi - s.T;
    s.mode = 'locked';
    return s;
  }
  if (s.mode === 'locked') {
    s.psi = phi - s.T;
    if (Math.abs(d) > BREAK_DEG) s.mode = 'glide';
  } else if (s.mode === 'glide') {
    // Catch up to level smoothly: at the break the picture keeps its tilt, then eases level over the
    // next CATCH_DEG of turning, so it never jumps to catch up.
    // The tilt it eases out of is the tilt it had at the break, never more: the picture only ever moves
    // toward level, so it never swings past the phone's speed by tilting further first.
    const e = clamp((Math.abs(d) - BREAK_DEG) / CATCH_DEG, 0, 1);
    const level = Math.sign(d) * Math.min(Math.abs(d), BREAK_DEG) * (1 - e * e * (3 - 2 * e));
    if (reduce) {
      s.psi = level;
      s.psiV = 0;
    } else spring(level, 26);
    // On a phone there's no "let go" moment, so the test page's release rule is the still rule.
    // Settle into a new orientation once the phone is well inside its break angle (so settling can't
    // immediately break back into a glide), or back into the same one once it has clearly returned, or
    // wherever the phone has truly stopped near an orientation.
    const near = Math.abs(phi - N) < (N !== s.T ? BREAK_DEG * 0.75 : BREAK_DEG / 2);
    if ((near && calm) || (s.still > 0.35 && Math.abs(phi - N) < 30)) {
      s.T = N;
      s.mode = 'settle';
      s.settleT = 0;
    }
  } else if (s.mode === 'settle') {
    if (Math.abs(phi - s.T) > BREAK_DEG) {
      s.mode = 'glide';
      return s;
    }
    if (reduce) {
      s.psi = phi - s.T;
      s.psiV = 0;
      lock();
      return s;
    }
    // While the phone is still travelling into the orientation, keep the picture level: arriving squares
    // it by itself. Only once the phone stops short (a hand is never exactly square) does the picture
    // ease square into the phone. Tilting it with the phone during the last few degrees is what made it
    // look like it ran ahead of the turn.
    const approaching = Math.abs(s.vel) > STILL_VEL && Math.sign(s.vel) === -Math.sign(phi - s.T);
    spring(approaching ? 0 : phi - s.T, 18);
    s.settleT += dt;
    // A hand is never perfectly still, so the spring may never land exactly. Lock once it's close, or
    // after a little over a second at most, so the turn can't get stuck "settling" (which hides the controls).
    const gap = Math.abs(s.psi - (phi - s.T));
    if ((gap < 0.25 && Math.abs(s.psiV) < 2) || (gap < 0.6 && Math.abs(s.psiV) < 25) || (s.settleT > 0.5 && gap < 2) || s.settleT > 1.2) lock();
  }
  return s;
}

/** The picture's rotation inside the phone (clockwise degrees), for drawing. */
export function pictureAngle(s: GlideState): number {
  'worklet';
  return s.psi - s.phi;
}

/** The resting orientation in the app's terms: how far the picture is turned inside the phone. */
export function restOf(s: GlideState): Orientation {
  'worklet';
  return (s.T === 0 ? 0 : -s.T) as Orientation;
}

/** Side of the square picture, in points, for a screen of w x h: the screen's diagonal. */
export function stageSide(w: number, h: number): number {
  'worklet';
  return Math.sqrt(w * w + h * h);
}

/**
 * The screen's size as the viewer sees it: upright it's w x h, sideways the sides swap.
 */
export function viewerSize(w: number, h: number, orientation: Orientation): { width: number; height: number } {
  'worklet';
  return orientation === 0 ? { width: w, height: h } : { width: h, height: w };
}

function room(q: number, d: number, half: number): number {
  'worklet';
  if (d > 0) return (half - q) / d;
  if (d < 0) return (-half - q) / d;
  return 1;
}

/**
 * How far a reframe pan may go at this angle without uncovering the screen, as a factor 0..1 of the
 * requested pan. pan is in points, in the picture's own frame (x right, y down as the viewer sees it).
 * side is the picture's drawn side (stageSide x zoom). At rest there is room to pan; mid-turn the room
 * shrinks to nothing at the diagonal, so the pan eases toward center instead of the picture zooming.
 */
export function panRoom(w: number, h: number, angleDeg: number, side: number, panX: number, panY: number): number {
  'worklet';
  if (panX === 0 && panY === 0) return 1;
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const half = side / 2;
  let f = 1;
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  for (let i = 0; i < 4; i++) {
    const px = corners[i]![0]!;
    const py = corners[i]![1]!;
    // Screen corner in the picture's frame (undo the picture's rotation).
    const qx = px * c + py * s;
    const qy = -px * s + py * c;
    // Moving the picture by +pan moves the corner by -pan in the picture's frame.
    f = Math.min(f, room(qx, -panX, half), room(qy, -panY, half));
  }
  return clamp(f, 0, 1);
}

/** One shot's framing. x, y: crop center offset as a share of the picture's side (-0.5..0.5). z: push-in, 1 = none. */
export interface ReframeKey {
  /** Shot start, seconds into the episode. */
  t: number;
  x: number;
  y: number;
  z: number;
}

/** Per-episode reframe track, one list per view, sorted by time. Built from Resolve Smart Reframe / Premiere Auto Reframe. */
export interface ReframeTrack {
  upright: ReframeKey[];
  sideways: ReframeKey[];
}

const CENTER: ReframeKey = { t: 0, x: 0, y: 0, z: 1 };

/** The framing for the shot playing at time t. Cuts are cuts: framing changes at each shot start. */
export function reframeAt(track: ReframeTrack | null | undefined, sideways: boolean, t: number): ReframeKey {
  'worklet';
  const keys = track ? (sideways ? track.sideways : track.upright) : null;
  if (!keys || keys.length === 0) return CENTER;
  let lo = 0;
  let hi = keys.length - 1;
  if (t < keys[0]!.t) return keys[0]!;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid]!.t <= t) lo = mid;
    else hi = mid - 1;
  }
  return keys[lo]!;
}

/** Index of the shot playing at time t, so the player knows when a cut happened. */
export function shotIndex(track: ReframeTrack | null | undefined, sideways: boolean, t: number): number {
  const keys = track ? (sideways ? track.sideways : track.upright) : null;
  if (!keys || keys.length === 0) return 0;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1]!.t <= t) i++;
  return i;
}

/** Slow-in, slow-out curve for the 4-second camera move. */
export function easeInOut(t: number): number {
  'worklet';
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

// ---------- Border title and progress bar ----------

/** The screen's border as a rounded rectangle, walked clockwise from the top-left. */
export interface Perimeter {
  /** SVG path for one lap, in a viewBox centered on the screen. */
  d: string;
  /** Two laps, so the title can travel past the start point. */
  d2: string;
  /** Straight top/bottom length, straight side length, and one rounded corner's length. */
  lw: number;
  lh: number;
  q: number;
  total: number;
}

/** Distance of the border line from each screen edge (use the safe-area insets so it clears the notch). */
export interface Pads {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function perimeter(w: number, h: number, pad: number | Pads = 12, rad = 16): Perimeter {
  const p = typeof pad === 'number' ? { top: pad, right: pad, bottom: pad, left: pad } : pad;
  const L = -w / 2 + p.left;
  const R = w / 2 - p.right;
  const T = -h / 2 + p.top;
  const B = h / 2 - p.bottom;
  const lw = R - L - 2 * rad;
  const lh = B - T - 2 * rad;
  const q = (Math.PI * rad) / 2;
  const lap =
    `H${R - rad}A${rad} ${rad} 0 0 1 ${R} ${T + rad}` +
    `V${B - rad}A${rad} ${rad} 0 0 1 ${R - rad} ${B}` +
    `H${L + rad}A${rad} ${rad} 0 0 1 ${L} ${B - rad}` +
    `V${T + rad}A${rad} ${rad} 0 0 1 ${L + rad} ${T}`;
  return { d: `M${L + rad} ${T}${lap}Z`, d2: `M${L + rad} ${T}${lap}${lap}`, lw, lh, q, total: 2 * lw + 2 * lh + 4 * q };
}

/**
 * Where the title and bar sit along the border for a picture rotation. Each keeps the same spot for the
 * viewer (title along the top-left, after the back button, bar along the bottom) and slides around the corners as the phone
 * turns, upright the whole way. Distances are along the border from the top-left start point.
 */
export function borderLayout(g: Perimeter, angleDeg: number, titleInset = 14) {
  const u = clamp(-angleDeg / 90, -1, 1); // 0 upright, +1 turned clockwise, -1 counter-clockwise
  const e = u * u * (3 - 2 * Math.abs(u)) * (u < 0 ? -1 : 1);
  const ae = Math.abs(e);
  const titleStart = e >= 0 ? g.total + titleInset - (g.lh + g.q) * ae : g.total + titleInset + (g.lw + g.q) * ae;
  const aRest = g.lw + 2 * g.q + g.lh;
  const bRest = 2 * g.lw + 2 * g.q + g.lh;
  const barFrom = e >= 0 ? aRest - (g.lh + g.q) * ae : aRest + (g.lw + g.q) * ae;
  const barTo = e >= 0 ? bRest - (g.lw + g.q) * ae : bRest + (g.q + g.lh) * ae;
  return { titleStart, barFrom, barTo };
}
