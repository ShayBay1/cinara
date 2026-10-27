import { useEffect, useState } from 'react';
import { Keyboard, LayoutAnimation, Platform } from 'react-native';

/**
 * How much of the screen the keyboard covers right now (0 when it's closed).
 * Used instead of KeyboardAvoidingView, which mis-measures inside iOS sheets (modals) and
 * does nothing on Android with edge-to-edge, so the typing bar ended up under the keyboard.
 */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e.duration || 250, 'keyboard', 'opacity'));
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e?.duration || 250, 'keyboard', 'opacity'));
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
