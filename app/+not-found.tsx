import { router, Stack } from 'expo-router';
import { View } from 'react-native';

import { Button, T } from '@/components/ui';
import { colors } from '@/theme/tokens';

export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <Stack.Screen options={{ title: 'Not found' }} />
      <T variant="serif">This page doesn’t exist.</T>
      <Button label="Go home" onPress={() => router.replace('/')} />
    </View>
  );
}
