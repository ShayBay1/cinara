import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { T } from '@/components/ui';
import { notify } from '@/lib/safety';
import { colors, fonts, radius } from '@/theme/tokens';

/** Voice notes in DMs: tap the mic to record, tap again to stop (up to 2 minutes). */

const MAX_MS = 120_000;
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function useVoiceRecorder(onDone: (note: { uri: string; durationMs: number }) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 200);
  const [recording, setRecording] = useState(false);

  const start = async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      notify('Allow the microphone in Settings to send voice messages.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  };
  const stop = async (send = true) => {
    const ms = state.durationMillis ?? 0;
    await recorder.stop();
    setRecording(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (send && recorder.uri && ms >= 800) onDone({ uri: recorder.uri, durationMs: ms });
    else if (send) notify('Hold on a little longer: voice messages need at least a second.');
  };
  // Stops by itself at the limit.
  useEffect(() => {
    if (recording && (state.durationMillis ?? 0) >= MAX_MS) void stop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, state.durationMillis]);

  return { recording, ms: state.durationMillis ?? 0, start, stop };
}

/** A voice message bubble: play/pause and a progress line. */
export function VoicePlayer({ url, durationMs, mine }: { url?: string; durationMs?: number; mine?: boolean }) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  const total = (status.duration || (durationMs ?? 0) / 1000) * 1000;
  const at = (status.currentTime ?? 0) * 1000;
  const ink = mine ? colors.goldInk : colors.text;
  const toggle = () => {
    if (!url) return;
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (total && at >= total - 100)) player.seekTo(0);
      player.play();
    }
  };
  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'} style={v.row}>
      <View style={[v.btn, { backgroundColor: mine ? 'rgba(26,19,8,0.15)' : colors.line }]}>
        <Icon name={status.playing ? 'pause' : 'play'} size={16} color={ink} filled />
      </View>
      <View style={[v.track, { backgroundColor: mine ? 'rgba(26,19,8,0.25)' : colors.line }]}>
        <View style={[v.fill, { width: `${total ? Math.min(100, (at / total) * 100) : 0}%`, backgroundColor: ink }]} />
      </View>
      <T style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: ink }}>{clock(status.playing ? at : total)}</T>
    </Pressable>
  );
}

const v = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190, paddingVertical: 2 },
  btn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 4 },
});
