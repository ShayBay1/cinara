import { router } from 'expo-router';
import { View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button, T } from '@/components/ui';
import { useShows } from '@/hooks/queries';
import { useNow } from '@/hooks/useNow';
import { soonestPremiere } from '@/lib/premieres';
import { dayLabel, SLOT_LABEL } from '@/lib/schedule';
import { colors } from '@/theme/tokens';

/** Only seen if the Live tab can't jump straight into a premiere (no shows loaded yet, or a web link). */
export default function LiveTab() {
  const shows = useShows();
  const now = useNow(30_000);
  const next = soonestPremiere(shows.data ?? [], now);
  return (
    <Screen
      title="Tonight"
      subtitle={`Every premiere is live at ${SLOT_LABEL}, with the cast in the chat.`}
    >
      <View style={{ paddingTop: 24, gap: 14 }}>
        {next ? (
          <>
            <T
              variant="serif"
              style={{ fontSize: 28, lineHeight: 32 }}
            >{`${next.show.title}, Episodes ${next.drop.from}–${next.drop.to}, ${dayLabel(next.at, now)} at ${SLOT_LABEL}.`}</T>
            <Button
              label="Go to the lobby"
              onPress={() =>
                router.push({ pathname: '/live/[showId]', params: { showId: next.show.id } })
              }
            />
          </>
        ) : (
          <T style={{ color: colors.textSoft }}>No premieres scheduled right now.</T>
        )}
      </View>
    </Screen>
  );
}
