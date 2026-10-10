import { useWindowDimensions } from 'react-native';

/**
 * The launch animation is a pre-rendered video of a 288 x 608 "mock" screen, played full screen
 * with contentFit="cover". Home's top section is laid out in the same mock units, mapped through
 * the same cover scaling, so the film's middle frame lands exactly on Home's premiere card on any
 * phone size.
 */
export const MOCK_W = 288;
export const MOCK_H = 608;

export function launchFrame(width: number, height: number) {
  const s = Math.max(width / MOCK_W, height / MOCK_H);
  const ox = (MOCK_W * s - width) / 2;
  const oy = (MOCK_H * s - height) / 2;
  return {
    /** Mock size -> points. */
    u: (v: number) => v * s,
    /** Mock x -> screen x. */
    x: (v: number) => v * s - ox,
    /** Mock y -> screen y. */
    y: (v: number) => v * s - oy,
  };
}

export function useLaunchFrame() {
  const { width, height } = useWindowDimensions();
  return launchFrame(width, height);
}

/** Home's logo: centred between the top of the screen and the premiere card, clear of the clock. */
export function homeLogo(f: ReturnType<typeof launchFrame>, safeTop: number) {
  const size = f.u(78.64);
  const top = Math.max((f.y(126) - size) / 2, safeTop * 0.72);
  const left = f.x(17.15);
  return { left, top, size, cx: left + size / 2, cy: top + size / 2 };
}
