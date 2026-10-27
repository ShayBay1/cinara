import * as WebBrowser from 'expo-web-browser';
import { type StyleProp, type TextStyle } from 'react-native';

import { PRIVACY_URL, TERMS_URL } from '@/brand';
import { T } from '@/components/ui';
import { colors } from '@/theme/tokens';

export const openTerms = () => void WebBrowser.openBrowserAsync(TERMS_URL);
export const openPrivacy = () => void WebBrowser.openBrowserAsync(PRIVACY_URL);

/** "By continuing you agree to the Terms and Privacy Policy", with both as links. */
export function LegalNote({ lead = 'By continuing you agree to the', style }: { lead?: string; style?: StyleProp<TextStyle> }) {
  return (
    <T variant="caption" style={[{ textAlign: 'center', color: colors.muted }, style]}>
      {lead}{' '}
      <T variant="caption" accessibilityRole="link" onPress={openTerms} style={{ color: colors.textSoft, textDecorationLine: 'underline' }}>
        Terms
      </T>{' '}
      and{' '}
      <T variant="caption" accessibilityRole="link" onPress={openPrivacy} style={{ color: colors.textSoft, textDecorationLine: 'underline' }}>
        Privacy Policy
      </T>
      .
    </T>
  );
}
