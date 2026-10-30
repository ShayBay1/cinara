import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { closeQuarter, downloadCsv, finalizePassMonth, markActorPaid, markUnlocksPaid, useMessageMonth, useUnlockMonth, markPaid, saveGift, useAdminAction, useAdminGifts, usePassMonth, useQuarter, type AdminGift } from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s, Tr } from '@/admin/ui';
import { count, money, previousQuarter, quarterOf, shortDate } from '@/lib/share';
import { colors } from '@/theme/tokens';

export default function AdminMoney() {
  const now = quarterOf(new Date());
  const choices = [now, previousQuarter(now), previousQuarter(previousQuarter(now)), previousQuarter(previousQuarter(previousQuarter(now)))];
  const [key, setKey] = useState(now.key);
  const q = choices.find((c) => c.key === key) ?? now;
  const report = useQuarter(key);
  const paid = useAdminAction(async (profile: string) => markPaid({ profile, quarter: key }));
  const close = useAdminAction(async () => closeQuarter(key));
  const [open, setOpen] = useState<string | null>(null);
  const ended = Date.now() > q.end.getTime();
  const r = report.data;

  const exportCsv = () => {
    if (!r) return;
    downloadCsv(`cinara-share-${key}.csv`, [
      ['Quarter', 'Handle', 'Email', 'Shows ($)', 'Gifts ($)', 'Total ($)', 'Status', 'Paid on'],
      ...r.statements.map((x) => [
        key, x.handle, x.email, (x.shows_cents / 100).toFixed(2), (x.gifts_cents / 100).toFixed(2),
        ((x.shows_cents + x.gifts_cents) / 100).toFixed(2), x.status, x.paid_on ? shortDate(x.paid_on) : '',
      ]),
    ]);
  };

  return (
    <Page
      title="Money"
      subtitle={`Talent pools and actor statements for ${q.label}. ${r?.closed ? 'Closed: these are final.' : 'Open: live numbers, final when the quarter closes.'}`}
      actions={
        <>
          {choices.map((c) => (
            <Pressable key={c.key} onPress={() => setKey(c.key)} style={[s.btn, key === c.key && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}>
              <Text style={[s.btnText, key === c.key && { color: colors.goldLight }]}>{c.label}</Text>
            </Pressable>
          ))}
        </>
      }
    >
      {report.isPending ? <Loading /> : null}
      <ErrorText error={report.error} />
      {r ? (
        <>
          <Card title="Talent pools by show">
            <Tr head flex={[3, 1.2, 1.4, 2, 1.2, 1.4, 1]} cells={['Show', 'Minutes', 'Revenue', 'Earned before / budget', 'Rate', 'Pool', 'Members']} />
            {r.pools.map((p) => {
              const past = p.budget_cents > 0 ? p.earned_before_cents + p.revenue_cents >= p.budget_cents : true;
              return (
                <Tr
                  key={p.show_id}
                  flex={[3, 1.2, 1.4, 2, 1.2, 1.4, 1]}
                  cells={[
                    p.title,
                    count(p.minutes),
                    money(p.revenue_cents),
                    p.budget_cents > 0 ? `${money(p.earned_before_cents, { whole: true })} / ${money(p.budget_cents, { whole: true })}` : 'No budget set',
                    <Pill key="r" text={past ? '60%' : '40%'} tone={past ? 'gold' : 'muted'} />,
                    money(p.pool_cents) + (p.carry_in_cents ? ` (+${money(p.carry_in_cents)} carried)` : ''),
                    count(p.members),
                  ]}
                />
              );
            })}
          </Card>

          <Card
            title="Actor statements"
            right={
              <View style={s.row}>
                <Btn label="Export CSV for payroll" onPress={exportCsv} disabled={!r.statements.length} />
                {!r.closed && ended ? (
                  <Btn kind="primary" label="Close this quarter" busy={close.isPending} onPress={() => close.mutate(undefined)} />
                ) : null}
              </View>
            }
          >
            {r.statements.length ? (
              <>
                <Tr head flex={[2.4, 2.6, 1.2, 1.2, 1.2, 1.4, 1.6]} cells={['Actor', 'Email', 'Shows', 'Gifts', 'Total', 'Status', '']} />
                {r.statements.map((x) => (
                  <View key={x.profile_id}>
                    <Tr
                      onPress={() => setOpen(open === x.profile_id ? null : x.profile_id)}
                      flex={[2.4, 2.6, 1.2, 1.2, 1.2, 1.4, 1.6]}
                      cells={[
                        `@${x.handle}`,
                        x.email,
                        money(x.shows_cents),
                        money(x.gifts_cents),
                        money(x.shows_cents + x.gifts_cents),
                        <Pill
                          key="st"
                          text={x.status === 'paid' && x.paid_on ? `Paid ${shortDate(x.paid_on)}` : x.status === 'due' ? `Due ${shortDate(q.payBy)}` : 'Open'}
                          tone={x.status === 'paid' ? 'good' : x.status === 'due' ? 'warn' : 'muted'}
                        />,
                        x.status === 'due' && r.closed ? (
                          <Btn key="p" kind="primary" label="Mark paid" busy={paid.isPending && paid.variables === x.profile_id} onPress={() => paid.mutate(x.profile_id)} />
                        ) : (
                          ''
                        ),
                      ]}
                    />
                    {open === x.profile_id
                      ? x.lines.map((l, i) => (
                          <Tr
                            key={i}
                            flex={[2.4, 2.6, 1.2, 1.2, 1.2, 1.4, 1.6]}
                            cells={['', `${l.show} · ${l.role}`, `${l.points}/${l.total_points} pts`, '', money(l.share_cents), '', '']}
                          />
                        ))
                      : null}
                  </View>
                ))}
              </>
            ) : (
              <Text style={s.small}>No actors with deals yet. Add them under Cast & people.</Text>
            )}
            <Text style={[s.small, { marginTop: 12 }]}>
              Quarters close on their own 7 days after they end. Pay each actor (through payroll, or their loan-out), then mark it paid:
              their app shows the date.
            </Text>
            <ErrorText error={paid.error ?? close.error} />
          </Card>
        </>
      ) : null}
      <View style={{ height: 20 }} />
      <BackstageCard />
      <View style={{ height: 20 }} />
      <GiftsCard />
    </Page>
  );
}

/** Live-premiere gifts: names and prices viewers see on the web. */
/** Backstage: one pass for every actor. Each fan's money is split by what they watched (or who replied). */
function BackstageCard() {
  const months = [0, 1, 2, 3].map((n) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7) + '-01';
  });
  const [month, setMonth] = useState(months[0]!);
  const data = usePassMonth(month);
  const msgs = useMessageMonth(month);
  const pay = useAdminAction(markActorPaid);
  const unlocks = useUnlockMonth(month);
  const payUnlocks = useAdminAction(markUnlocksPaid);
  const finalize = useAdminAction(async () => finalizePassMonth(month));
  const m = data.data;
  const current = month === months[0];
  return (
    <Card
      title="Backstage"
      right={
        <View style={[s.row, { gap: 6 }]}>
          {months.map((x) => (
            <Pressable key={x} onPress={() => setMonth(x)} style={[s.btn, month === x && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}>
              <Text style={[s.btnText, month === x && { color: colors.goldLight }]}>{x.slice(0, 7)}</Text>
            </Pressable>
          ))}
        </View>
      }
    >
      {data.isPending ? <Loading /> : null}
      {m ? (
        <>
          <Text style={s.small}>
            {`${count(m.passes)} active passes (${count(m.dm_passes)} with messages) · ${money(m.gross_cents)} paid in · ${money(m.net_cents)} after fees and tax · 80% to actors · `}
            {m.finalized ? 'Final.' : current ? 'Live estimate; final on the 3rd of next month.' : 'Not finalized yet.'}
          </Text>
          {!m.finalized && !current ? (
            <View style={{ marginTop: 8 }}>
              <Btn
                label="Finalize this month"
                kind="primary"
                busy={finalize.isPending}
                onPress={() => {
                  if (globalThis.confirm?.(`Lock the Backstage split for ${month.slice(0, 7)}?`)) finalize.mutate(undefined as never);
                }}
              />
            </View>
          ) : null}
          {m.rows.length ? (
            <>
              <Tr head flex={[1.4, 1, 1, 1, 1, 1.4]} cells={['Actor', 'Fans', 'Views', 'Their share', 'Unpaid', '']} />
              {m.rows.map((x) => (
                <Tr
                  key={x.actor_id}
                  flex={[1.4, 1, 1, 1, 1, 1.4]}
                  cells={[
                    x.handle ? `@${x.handle}` : '(deleted)',
                    count(x.fans),
                    count(x.views),
                    money(x.cents),
                    m.finalized ? (x.unpaid_cents ? money(x.unpaid_cents) : <Pill key="p" text="Paid" tone="muted" />) : '—',
                    m.finalized && x.unpaid_cents ? (
                      <Btn
                        key="b"
                        label="Mark paid"
                        kind="primary"
                        busy={pay.isPending && pay.variables?.actor === x.actor_id}
                        onPress={() => {
                          if (globalThis.confirm?.(`Mark ${money(x.unpaid_cents ?? 0)} paid to @${x.handle} for ${month.slice(0, 7)}?`))
                            pay.mutate({ actor: x.actor_id, month });
                        }}
                      />
                    ) : (
                      ''
                    ),
                  ]}
                />
              ))}
            </>
          ) : (
            <Text style={[s.small, { marginTop: 8 }]}>No Backstage earnings this month yet.</Text>
          )}
        </>
      ) : null}
      <Text style={[s.th, { marginTop: 18 }]}>Messages add-ons</Text>
      {(msgs.data ?? []).length ? (
        <>
          <Tr head flex={[1.4, 1, 1, 1, 1, 1.4]} cells={['Actor', 'Fans', 'Paid in', 'Their share', 'Unpaid', '']} />
          {(msgs.data ?? []).map((x) => (
            <Tr
              key={x.actor_id}
              flex={[1.4, 1, 1, 1, 1, 1.4]}
              cells={[
                x.handle ? `@${x.handle}` : '(deleted)',
                count(x.fans),
                money(x.gross_cents),
                money(x.cents),
                x.unpaid_cents ? money(x.unpaid_cents) : <Pill key="p" text="Paid" tone="muted" />,
                x.unpaid_cents ? (
                  <Btn
                    key="b"
                    label="Mark paid"
                    kind="primary"
                    onPress={() => {
                      if (globalThis.confirm?.(`Mark ${money(x.unpaid_cents ?? 0)} of messages paid to @${x.handle} for ${month.slice(0, 7)}?`))
                        pay.mutate({ actor: x.actor_id, month });
                    }}
                  />
                ) : (
                  ''
                ),
              ]}
            />
          ))}
        </>
      ) : (
        <Text style={[s.small, { marginTop: 6 }]}>No messages add-ons this month.</Text>
      )}
      <Text style={[s.th, { marginTop: 18 }]}>Paid messages and posts (unlocks)</Text>
      {(unlocks.data ?? []).length ? (
        <>
          <Tr head flex={[1.4, 1, 1, 1, 1.4]} cells={['Actor', 'Sales', 'Paid in', 'Their share (80%)', '']} />
          {(unlocks.data ?? []).map((x) => (
            <Tr
              key={x.actor_id}
              flex={[1.4, 1, 1, 1, 1.4]}
              cells={[
                x.handle ? `@${x.handle}` : '(deleted)',
                count(x.sales),
                money(x.gross_cents),
                money(x.actor_cents),
                x.paid ? (
                  <Pill key="p" text="Paid" tone="muted" />
                ) : (
                  <Btn
                    key="b"
                    label="Mark paid"
                    kind="primary"
                    busy={payUnlocks.isPending && payUnlocks.variables?.actor === x.actor_id}
                    onPress={() => {
                      if (globalThis.confirm?.(`Mark ${money(x.actor_cents)} of unlocks paid to @${x.handle} for ${month.slice(0, 7)}?`))
                        payUnlocks.mutate({ actor: x.actor_id, month });
                    }}
                  />
                ),
              ]}
            />
          ))}
        </>
      ) : (
        <Text style={[s.small, { marginTop: 6 }]}>No unlocks this month.</Text>
      )}
      <ErrorText error={data.error ?? msgs.error ?? pay.error ?? finalize.error ?? unlocks.error ?? payUnlocks.error} />
    </Card>
  );
}

function GiftsCard() {
  const gifts = useAdminGifts();
  return (
    <Card title="Gifts">
      <Text style={[s.small, { marginBottom: 10 }]}>Prices are in dollars. Changes apply to the next gift anyone sends.</Text>
      {gifts.isPending ? <Loading /> : null}
      {(gifts.data ?? []).map((g) => (
        <GiftRow key={g.id} gift={g} />
      ))}
      <ErrorText error={gifts.error} />
    </Card>
  );
}

function GiftRow({ gift }: { gift: AdminGift }) {
  const [name, setName] = useState(gift.name);
  const [price, setPrice] = useState((gift.price_cents / 100).toFixed(2));
  const save = useAdminAction(async () => saveGift({ id: gift.id, name, price_cents: Math.round(Number(price.replace(/[$,\s]/g, '')) * 100) }));
  const dirty = name !== gift.name || price !== (gift.price_cents / 100).toFixed(2);
  return (
    <View style={[s.row, { alignItems: 'flex-end', marginBottom: 8 }]}>
      <Field label={gift.id} value={name} onChange={setName} width={220} />
      <Field label="Price ($)" value={price} onChange={setPrice} width={110} />
      <Btn label={dirty ? 'Save' : 'Saved'} kind="primary" disabled={!dirty} busy={save.isPending} onPress={() => save.mutate(undefined)} />
      <ErrorText error={save.error} />
    </View>
  );
}
