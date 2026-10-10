/** A glowing version of a (usually dark) poster colour: same hue, lifted and saturated. */
export function glowOf(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#FFB800';
  const n = parseInt(m[1]!, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + 360) % 360;
  const l0 = (max + min) / 2;
  const s0 = d === 0 ? 0 : d / (1 - Math.abs(2 * l0 - 1));
  const s = Math.max(0.6, s0);
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const xx = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r1, g1, b1] =
    h < 60
      ? [c, xx, 0]
      : h < 120
        ? [xx, c, 0]
        : h < 180
          ? [0, c, xx]
          : h < 240
            ? [0, xx, c]
            : h < 300
              ? [xx, 0, c]
              : [c, 0, xx];
  const to = (v: number) =>
    Math.round((v + l - c / 2) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(r1)}${to(g1)}${to(b1)}`;
}
