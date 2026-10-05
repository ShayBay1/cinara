/** Design tokens from the Snippets mock-up. Every screen reads colors and fonts from here. */
export const colors = {
  ink: '#08080A',
  surface: '#131318',
  surfaceRaised: '#1B1B22',
  line: '#26262F',
  text: '#F4F1EA',
  textSoft: '#C9C5D2',
  muted: '#A9A5B5',
  dim: '#6F6B7B',
  gold: '#E8C27A',
  wine: '#3A1420',
  goldInk: '#14120E',
  accent: '#FF5A3C',
  live: '#E5484D',
  friend: '#8FE3CB',
  online: '#3CC9A5',
  seal: '#7A1F1F',
  sealEdge: '#9B3030',
} as const;

export const fonts = {
  display: 'Anton_400Regular',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 18, xl: 24, pill: 999 } as const;

/** Minimum touch target (Apple HIG / Material). */
export const HIT = 44;

/** Stable avatar tint for a handle, so a person keeps the same color everywhere. */
const TINTS = ['#5A2230', '#2E2A4E', '#1C4A40', '#4A3A1A', '#34304A', '#3A2430'];
export function tintFor(handle: string): string {
  let sum = 0;
  for (const ch of handle) sum += ch.charCodeAt(0);
  return TINTS[sum % TINTS.length] ?? TINTS[0]!;
}
