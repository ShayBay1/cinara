import { useCallback } from 'react';
import { Platform } from 'react-native';
import {
  SensorType,
  useAnimatedSensor,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type FrameInfo,
  type SharedValue,
} from 'react-native-reanimated';

export interface Tilt {
  /** Left/right tilt away from how the phone is being held, about -1..1. */
  x: SharedValue<number>;
  /** Forward/back tilt away from how the phone is being held, about -1..1. */
  y: SharedValue<number>;
}

/**
 * How the phone is moving, relative to how it's being held. Like the iPhone's parallax wallpaper:
 * hold still and it drifts back to 0 within a couple of seconds, so things only move while you
 * move. Runs on the UI thread. Off with Reduce Motion and on the web.
 */
export function useTilt(): Tilt {
  const reduce = useReducedMotion();
  const live = Platform.OS !== 'web' && !reduce;
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto' });
  // iPhones report gravity pointing down; Android the other way round.
  const flip = Platform.OS === 'ios' ? -1 : 1;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const fast = useSharedValue({ x: 0, y: 0, ready: false });
  const base = useSharedValue({ x: 0, y: 0 });

  const onFrame = useCallback(
    (frame: FrameInfo) => {
      'worklet';
      if (!live) return;
      const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
      const g = gravity.sensor.value;
      const gx = (flip * g.x) / 9.81;
      const gy = (flip * g.y) / 9.81;
      const f = fast.value;
      if (!f.ready) {
        fast.value = { x: gx, y: gy, ready: true };
        base.value = { x: gx, y: gy };
        return;
      }
      // Smooth out sensor jitter (~0.12 s), and let the resting pose catch up slowly (~1.6 s).
      const a = 1 - Math.exp(-dt / 0.12);
      const b = 1 - Math.exp(-dt / 1.6);
      const fx = f.x + (gx - f.x) * a;
      const fy = f.y + (gy - f.y) * a;
      fast.value = { x: fx, y: fy, ready: true };
      const bx = base.value.x + (fx - base.value.x) * b;
      const by = base.value.y + (fy - base.value.y) * b;
      base.value = { x: bx, y: by };
      x.value = Math.max(-1, Math.min(1, (fx - bx) * 4));
      y.value = Math.max(-1, Math.min(1, (fy - by) * 4));
    },
    [live, gravity, flip, fast, base, x, y],
  );
  useFrameCallback(onFrame, live);

  return { x, y };
}
