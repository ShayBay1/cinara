/** Design tokens from the Snippets mock-up. Every screen reads colors and fonts from here. */
/**
 * "Darkroom": one palette for every screen. Things that aren't yours yet sit in sepia; gold leaf is
 * the one main action on a screen; parchment is for reading; one red, only for live.
 */
export const colors = {
  ink: '#15100B',
  surface: '#1E1710',
  surfaceRaised: '#261D14',
  line: '#3A2E20',
  text: '#F3EAD8',
  textSoft: '#D8CCB5',
  muted: '#A8977A',
  dim: '#7A6B55',
  gold: '#FFB800',
  goldLight: '#FFD25A',
  wine: '#3A1420',
  goldInk: '#1A1308',
  accent: '#FFD25A',
  live: '#E5484D',
  liveSoft: '#FF8A8E',
  friend: '#8FE3CB',
  online: '#3CC9A5',
  sepia: 'rgba(112,66,20,0.55)',
  seal: '#7A1F1F',
  sealEdge: '#9B3030',
} as const;

export const fonts = {
  display: 'Cinzel_700Bold',
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  body: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
  bodyHeavy: 'Manrope_800ExtraBold',
  /** Engraved capitals (Cinzel Bold): titles, eyebrows and section labels. */
  engraved: 'Cinzel_700Bold',
} as const;

/** Home's warm darkroom palette (matches the last frame of the launch animation). */
export const home = {
  bg: '#15100B',
  /** Where both Home skies settle at the bottom: near-black with a little teal. */
  deep: '#0D1213',
  field: '#1E1710',
  fieldLine: '#3A2E20',
  fieldIcon: '#A8977A',
  placeholder: '#8C8172',
  gold: '#FFB800',
  goldLight: '#FFD25A',
  parchment: '#F3EAD8',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 18, xl: 24, pill: 999 } as const;

/** Minimum touch target (Apple HIG / Material). */
export const HIT = 44;

/** Stable avatar tint for a handle, so a person keeps the same color everywhere. */
const TINTS = ['#5A2230', '#2E2A4E', '#1C4A40', '#4A3A1A', '#4A2E1A', '#3A2430'];
export function tintFor(handle: string): string {
  let sum = 0;
  for (const ch of handle) sum += ch.charCodeAt(0);
  return TINTS[sum % TINTS.length] ?? TINTS[0]!;
}
