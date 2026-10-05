import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
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
import { scheduleOnRN } from 'react-native-worklets';

import { INITIAL_GLIDE, pictureAngle, restOf, rollFromGravity, stepGlide, type GlideState, type Orientation } from '@/lib/turn';

/**
 * The glide turn, exactly as designed and locked in the Glide Turn test page. The app stays locked
 * upright; this hook reads gravity on the UI thread every frame and runs the test page's rules
 * (stepGlide in src/lib/turn.ts): locked, glide past 20 degrees with the picture held level, settle into
 * the nearest orientation, lock with a light haptic tap. The phone's own rotation lock doesn't apply
 * here, so nobody needs a turn button.
 *
 * smooth: the "Smooth rotation" setting. Off = the classic flip (hold past 45 degrees for 250 ms).
 * paused: hold the turn where it is (live chat uses this while someone is typing).
 */
export interface Turn {
  /** Picture rotation inside the phone, in degrees (clockwise). */
  angle: SharedValue<number>;
  /** Resting orientation on the UI thread. */
  rest: SharedValue<Orientation>;
  /** 1 while locked, 0 while gliding or settling (chat and controls fade on this). */
  settled: SharedValue<number>;
  /** Picture opacity (always 1; kept for the stage). */
  fade: SharedValue<number>;
  /** Resting orientation for React (layout of controls). */
  orientation: Orientation;
  /** True while the phone is mid-turn. */
  turning: boolean;
  /** Raw phone roll and the system's own screen rotation, for the dev readout. */
  roll: SharedValue<number>;
  systemTurn: SharedValue<number>;
}

export function useTurn(smooth: boolean, paused = false): Turn {
  const reduceMotion = useReducedMotion();
  const sensorAvailable = Platform.OS !== 'web';
  const gravity = useAnimatedSensor(SensorType.GRAVITY, { interval: 'auto', adjustToInterfaceOrientation: false });
  // iPhones report gravity pointing down (upright: y = -g); Android reports the opposite (upright: y = +g).
  // rollFromGravity uses the Android convention, so flip iPhone readings.
  const flip = Platform.OS === 'ios' ? -1 : 1;

  const angle = useSharedValue(0);
  const rest = useSharedValue<Orientation>(0);
  const settled = useSharedValue(1);
  const fade = useSharedValue(1);
  const rollSV = useSharedValue(0);
  const systemTurn = useSharedValue(0);
  const [orientation, setOrientation] = useState<Orientation>(0);
  const [turning, setTurning] = useState(false);

  const tap = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const state = useSharedValue<GlideState>(INITIAL_GLIDE);

  // Memoized so the frame loop isn't re-registered every time the player re-renders.
  const onFrame = useCallback((frame: FrameInfo) => {
    'worklet';
    // Paused (e.g. while typing in live chat): hold the turn exactly where it is.
    if (paused) return;
    const dt = Math.min(0.05, (frame.timeSincePreviousFrame ?? 16) / 1000);
    const before = state.value.T;
    const g = gravity.sensor.value;
    const roll = sensorAvailable ? rollFromGravity(flip * g.x, flip * g.y, g.z) : 0;
    systemTurn.value = g.interfaceOrientation;
    if (roll !== null) rollSV.value = roll;
    // The test page's phi is the phone's clockwise angle; roll is counter-clockwise.
    const st = stepGlide(state.value, roll === null ? null : -roll, dt, smooth, reduceMotion);
    state.value = st;
    angle.value = pictureAngle(st);

    if (st.T !== before) {
      const o = restOf(st);
      rest.value = o;
      scheduleOnRN(setOrientation, o);
    }
    const nowSettled = st.mode === 'locked' ? 1 : 0;
    if (nowSettled !== settled.value) {
      settled.value = nowSettled;
      scheduleOnRN(setTurning, nowSettled === 0);
    }
    if (st.locked && smooth) scheduleOnRN(tap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smooth, reduceMotion, flip, sensorAvailable, paused]);
  useFrameCallback(onFrame);

  return { angle, rest, settled, fade, orientation, turning, roll: rollSV, systemTurn };
}
