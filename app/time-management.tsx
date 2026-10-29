import { View } from 'react-native';

import { ChoiceRow, Group, Rule, SettingsPage } from '@/components/settings/Page';
import { T } from '@/components/ui';
import { minutesLabel, today, useWellbeing } from '@/store/wellbeing';
import { colors, fonts } from '@/theme/tokens';

const LIMITS = [0, 30, 60, 90, 120, 180];
const BREAKS = [0, 15, 30, 45, 60];
const SLEEP = ['', '22:00', '23:00', '00:00', '01:00'];
const sleepLabel = (t: string) => {
  if (!t) return 'Off';
  const [h] = t.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:00 ${h! >= 12 ? 'PM' : 'AM'}`;
};

/** Screen time on Cinara, and gentle reminders (TikTok-style). */
export default function TimeManagementScreen() {
  const w = useWellbeing();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), min: Math.round((w.usage[key] ?? 0) / 60) };
  });
  const max = Math.max(30, ...days.map((d) => d.min));
  const week = days.reduce((a, d) => a + d.min, 0);
  const todayMin = Math.round((w.usage[today()] ?? 0) / 60);

  return (
    <SettingsPage title="Time management">
      <View style={{ gap: 4 }}>
        <T variant="caption">Today</T>
        <T style={{ fontFamily: fonts.serif, fontSize: 40, lineHeight: 48, color: colors.text }}>{minutesLabel(todayMin)}</T>
        <T variant="caption">{`Daily average this week: ${minutesLabel(Math.round(week / 7))}`}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 120 }}>
        {days.map((d) => (
          <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ width: '100%', height: Math.max(3, (d.min / max) * 96), borderRadius: 6, backgroundColor: d.key === today() ? colors.gold : colors.line }} />
            <T variant="caption">{d.label}</T>
          </View>
        ))}
      </View>

      <Group title="Daily limit" note="We’ll remind you once you’ve had Cinara open this long in a day.">
        {LIMITS.map((m, i) => (
          <View key={m}>
            {i > 0 ? <Rule /> : null}
            <ChoiceRow label={m ? minutesLabel(m) : 'Off'} on={w.dailyLimit === m} onPress={() => w.setDailyLimit(m)} />
          </View>
        ))}
      </Group>
      <Group title="Break reminders" note="A nudge to step away after this long without a break.">
        {BREAKS.map((m, i) => (
          <View key={m}>
            {i > 0 ? <Rule /> : null}
            <ChoiceRow label={m ? `Every ${minutesLabel(m)}` : 'Off'} on={w.breakEvery === m} onPress={() => w.setBreakEvery(m)} />
          </View>
        ))}
      </Group>
      <Group title="Sleep reminder" note="A reminder if you’re still watching after this time.">
        {SLEEP.map((t, i) => (
          <View key={t || 'off'}>
            {i > 0 ? <Rule /> : null}
            <ChoiceRow label={sleepLabel(t)} on={w.sleepAt === t} onPress={() => w.setSleepAt(t)} />
          </View>
        ))}
      </Group>
    </SettingsPage>
  );
}
