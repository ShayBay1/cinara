import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/tokens';

/**
 * The verified mark: a gold seal with a check, next to the name of every actor Cinara has
 * confirmed is the real person. Only admins can grant it (Admin > People > Verify).
 */
export function Verified({ size = 14 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Verified actor" accessibilityRole="image">
      <Path
        d="M12 1.5l2.4 1.8 3-.2 1 2.8 2.6 1.6-.6 2.9 1.4 2.6-2 2.2-.1 3-2.9.8-1.7 2.5-2.8-1-2.8 1-1.7-2.5-2.9-.8-.1-3-2-2.2 1.4-2.6-.6-2.9 2.6-1.6 1-2.8 3 .2z"
        fill={colors.gold}
      />
      <Path d="M7.5 12.3l3 3 6-6.2" stroke={colors.goldInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
