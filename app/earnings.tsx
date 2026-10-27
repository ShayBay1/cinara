import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { ErrorState, ProgressBar, T } from '@/components/ui';
import { api, type ShareStatement } from '@/data';
import { useEarnings } from '@/hooks/queries';
import { count, money, POOL_AFTER, POOL_START, type ShowLine, shortDate, statementTotals } from '@/lib/share';
import { colors, fonts, radius } from '@/theme/tokens';

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** The actor's Cinara Share: this quarter so far, each show's pool and points, gifts, and past statements. */
export default function EarningsScreen() {
  const insets = useSafeAreaInsets();
  const earnings = useEarnings();
  const data = earnings.data;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 48, gap: 22 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
          <Icon name="back" />
        </Pressable>
        <T variant="display" style={{ fontSize: 24, lineHeight: 32, textTransform: 'none', flex: 1 }}>
          Your Cinara Share
        </T>
      </View>

      {earnings.isError ? (
        <ErrorState message="We couldn’t load your statements." onRetry={() => void earnings.refetch()} />
      ) : !data ? (
        earnings.isPending ? null : (
          <T variant="caption" style={{ fontSize: 14 }}>
            Once you’re cast on a Cinara show, your share of every dollar it earns shows up here.
          </T>
        )
      ) : (
        <>
          <Hero statement={data.current} />
          <Section title="By show">
            {statementTotals(data.current).shows.map((l) => (
              <ShowCard key={l.share.showId} line={l} />
            ))}
          </Section>
          <Section title="Gifts">
            <GiftsCard statement={data.current} />
          </Section>
          {data.past.length ? (
            <Section title="Statements">
              <View style={styles.card}>
                {data.past.map((st, i) => (
                  <StatementRow key={st.quarter} statement={st} first={i === 0} />
                ))}
              </View>
            </Section>
          ) : null}
          <HowItWorks />
          {api.mode === 'sample' ? (
            <T variant="caption" style={{ textAlign: 'center' }}>
              Sample numbers. Your real statements appear here once shows are live.
            </T>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function Hero({ statement }: { statement: ShareStatement }) {
  const t = statementTotals(statement);
  return (
    <View style={styles.hero}>
      <T variant="eyebrow">{`${t.quarter.label} · so far`}</T>
      <T style={styles.heroAmount} accessibilityLabel={`${money(t.totalCents)} so far this quarter`}>
        {money(t.totalCents)}
      </T>
      <View style={styles.heroSplit}>
        <Split label="Shows" value={money(t.showsCents)} />
        <View style={styles.vRule} />
        <Split label="Gifts" value={money(t.giftsCents)} />
      </View>
      <T variant="caption" style={{ fontSize: 13, color: colors.textSoft }}>
        {`Paid by ${shortDate(t.quarter.payBy)}, with a statement. Your day rates are paid separately, on payday.`}
      </T>
    </View>
  );
}

function Split({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="caption">{label}</T>
      <T variant="label" style={{ fontSize: 17 }}>
        {value}
      </T>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <T style={styles.h2}>{title}</T>
      {children}
    </View>
  );
}

function ShowCard({ line }: { line: ShowLine }) {
  const s = line.share;
  const steppedUp = line.rate === POOL_AFTER;
  const progress = s.budgetCents > 0 ? line.earnedTotalCents / s.budgetCents : 1;
  return (
    <View style={styles.card}>
      <View style={{ padding: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T style={styles.showTitle} numberOfLines={2}>
              {s.showTitle}
            </T>
            <T variant="caption" style={{ fontSize: 13 }}>{`as ${s.role} · ${s.points} of ${s.totalPoints} points`}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T variant="caption">Your share</T>
            <T style={styles.lineAmount}>{money(line.yourCents)}</T>
          </View>
        </View>

        <View style={styles.grid}>
          <Stat label="Minutes watched" value={count(s.minutesWatched)} />
          <Stat label="Members watching" value={count(s.members)} />
          <Stat label="Show revenue" value={money(s.revenueCents, { whole: true })} />
          <Stat label="Talent pool" value={money(line.poolCents, { whole: true })} />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <T variant="label" style={{ fontSize: 13, color: steppedUp ? colors.gold : colors.text }}>
              {`Pool at ${pct(line.rate)}`}
            </T>
            <T variant="caption">{`Budget ${money(s.budgetCents, { whole: true })}`}</T>
          </View>
          <ProgressBar fraction={progress} color={colors.gold} height={6} />
          <T variant="caption" style={{ fontSize: 13, color: colors.textSoft }}>
            {line.steppedUpNow
              ? `Earned back its budget this quarter. Revenue past that line pooled at ${pct(POOL_AFTER)}, and it stays there for good.`
              : steppedUp
                ? `Earned back its budget. The pool is ${pct(POOL_AFTER)} for good.`
                : `${money(line.toStepUpCents, { whole: true })} more in revenue and the pool rises from ${pct(POOL_START)} to ${pct(POOL_AFTER)} for good.`}
          </T>
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <T variant="caption">{label}</T>
      <T variant="label" style={{ fontSize: 16 }}>
        {value}
      </T>
    </View>
  );
}

function GiftsCard({ statement }: { statement: ShareStatement }) {
  const g = statement.gifts;
  const yours = statementTotals(statement).giftsCents;
  return (
    <View style={[styles.card, { padding: 16, gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="gift" size={20} color={colors.gold} />
        <T variant="label" style={{ flex: 1, fontSize: 15 }}>
          {`${count(g.count)} ${g.count === 1 ? 'gift' : 'gifts'} from viewers`}
        </T>
      </View>
      <Row label="Sent to you" value={money(g.grossCents)} />
      <Row label="Card fees" value={money(-g.cardFeesCents)} />
      <View style={styles.rule} />
      <Row label="You keep 90%" value={money(yours)} strong />
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <T style={{ fontSize: 14, color: strong ? colors.text : colors.textSoft, fontFamily: strong ? fonts.bodyBold : fonts.body }}>
        {label}
      </T>
      <T style={{ fontSize: strong ? 17 : 14, color: strong ? colors.gold : colors.text, fontFamily: strong ? fonts.bodyHeavy : fonts.body }}>
        {value}
      </T>
    </View>
  );
}

function StatementRow({ statement, first }: { statement: ShareStatement; first: boolean }) {
  const [open, setOpen] = useState(false);
  const t = statementTotals(statement);
  const status =
    statement.status === 'paid' && statement.paidOn
      ? `Paid ${shortDate(statement.paidOn)}`
      : `Due by ${shortDate(t.quarter.payBy)}`;
  return (
    <View style={!first && styles.rowRule}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t.quarter.label}, ${money(t.totalCents)}, ${status}`}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="label" style={{ fontSize: 15 }}>
            {t.quarter.label}
          </T>
          <T variant="caption" style={{ color: statement.status === 'paid' ? colors.online : colors.goldLight }}>
            {status}
          </T>
        </View>
        <T variant="label" style={{ fontSize: 16 }}>
          {money(t.totalCents)}
        </T>
        <View style={{ transform: [{ rotate: open ? '90deg' : '-90deg' }] }}>
          <Icon name="back" size={16} color={colors.muted} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
          {t.shows.map((l) => (
            <Row
              key={l.share.showId}
              label={`${l.share.showTitle} · ${pct(l.rate)} pool`}
              value={money(l.yourCents)}
            />
          ))}
          <Row label={`Gifts · ${count(statement.gifts.count)}`} value={money(t.giftsCents)} />
        </View>
      ) : null}
    </View>
  );
}

const HOW = [
  ['From the first dollar', 'Your show’s pool is 40% of its revenue, rising to 60% for good once it earns back its budget. Nothing comes off first.'],
  ['Your viewers, your money', 'Each member’s fee is split across the shows they watched, by minutes.'],
  ['Set aside', 'Each month’s pool moves into its own bank account, so it’s never spent on running costs.'],
  ['Yours to check', 'A statement within 30 days of every quarter, and a right to audit once a year.'],
] as const;

function HowItWorks() {
  return (
    <Section title="How it works">
      <View style={[styles.card, { padding: 16, gap: 14 }]}>
        {HOW.map(([h, b]) => (
          <View key={h} style={{ gap: 3 }}>
            <T variant="label" style={{ fontSize: 14 }}>
              {h}
            </T>
            <T variant="caption" style={{ fontSize: 13, color: colors.textSoft }}>
              {b}
            </T>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  h2: {
    fontFamily: fonts.engraved,
    fontSize: 12,
    letterSpacing: 2.6,
    textTransform: 'uppercase',
    color: colors.text,
  },
  hero: {
    padding: 18,
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.gold,
    experimental_backgroundImage: 'linear-gradient(135deg, #3A2A0E 0%, #1E1710 65%)',
  },
  heroAmount: { fontFamily: fonts.serifItalic, fontSize: 54, lineHeight: 62, color: colors.gold },
  heroSplit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  vRule: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.line },
  card: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  showTitle: { fontFamily: fonts.engraved, fontSize: 15, lineHeight: 20, color: colors.goldLight, letterSpacing: 0.6 },
  lineAmount: { fontFamily: fonts.serifItalic, fontSize: 28, lineHeight: 32, color: colors.gold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  stat: { width: '50%', gap: 2 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
});
