import { router } from 'expo-router';
import { View } from 'react-native';

import { useOverview } from '@/admin/data';
import { Bars, Card, ErrorText, Loading, Page, Pill, Stat, Tr } from '@/admin/ui';
import { count, money } from '@/lib/share';

export default function AdminOverview() {
  const o = useOverview();
  if (o.isPending) return <Loading />;
  if (!o.data) return <Page title="Overview"><ErrorText error={o.error} /></Page>;
  const d = o.data;
  return (
    <Page title="Overview" subtitle="Live numbers from the database. Revenue is this month, after card fees and tax.">
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <Stat label="Active members" value={count(d.members_active)} hint={`${count(d.accounts)} accounts`} />
        <Stat label="Revenue this month" value={money(d.revenue_month_net_cents, { whole: true })} hint={`${money(d.revenue_month_gross_cents, { whole: true })} before fees and tax`} />
        <Stat label="Gifts this month" value={money(d.gifts_month_cents, { whole: true })} />
        <Stat label="Minutes watched" value={count(d.minutes_today)} hint={`today · ${count(d.minutes_7d)} this week`} />
        <Stat label="Viewers this week" value={count(d.viewers_7d)} hint={`${d.reports_30d} reports in 30 days`} />
      </View>

      <Card title="Minutes watched, last 30 days">
        <Bars data={d.daily_minutes.map((x) => ({ label: x.day.slice(5), value: x.minutes }))} />
      </Card>

      <Card title="Shows">
        <Tr head flex={[3, 1.2, 1.4, 1.2, 1.2, 2.4, 1]} cells={['Show', 'Status', 'Released', 'Uploaded', 'Minutes (month)', 'Earned vs budget', 'Cast deals']} />
        {d.shows.map((x) => (
          <Tr
            key={x.id}
            onPress={() => router.push({ pathname: '/admin/shows/[id]', params: { id: x.id } })}
            flex={[3, 1.2, 1.4, 1.2, 1.2, 2.4, 1]}
            cells={[
              `${x.number} · ${x.title}`,
              <Pill key="s" text={x.published ? (x.featured ? 'Featured' : 'Live') : 'Draft'} tone={x.published ? 'good' : 'muted'} />,
              `${x.latest_episode} of ${x.episode_count}`,
              <Pill key="u" text={`${x.episodes_uploaded} files`} tone={x.episodes_uploaded >= x.latest_episode ? 'good' : 'warn'} />,
              count(x.minutes_month),
              x.budget_cents > 0
                ? `${money(x.earned_cents, { whole: true })} of ${money(x.budget_cents, { whole: true })} · pool ${x.earned_cents >= x.budget_cents ? '60%' : '40%'}`
                : `${money(x.earned_cents, { whole: true })} · no budget set`,
              <Pill key="c" text={String(x.cast_deals)} tone={x.cast_deals ? 'good' : 'warn'} />,
            ]}
          />
        ))}
      </Card>
    </Page>
  );
}
