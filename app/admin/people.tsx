import { useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import {
  banUser,
  removeDeal,
  saveDeal,
  setAdmin,
  setCast,
  setVerified,
  useAdminAction,
  useAdminShows,
  useDeals,
  useMembers,
  usePeople,
} from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s, Tr } from '@/admin/ui';
import { colors } from '@/theme/tokens';

export default function AdminPeople() {
  const [query, setQuery] = useState('');
  const people = usePeople(query.trim());
  const shows = useAdminShows();
  const deals = useDeals();
  const cast = useAdminAction(async (a: { profile: string; isCast: boolean }) => setCast(a));
  const verify = useAdminAction(setVerified);
  const ban = useAdminAction(async (a: { profile: string; handle: string; banned: boolean }) => {
    if (a.banned && !globalThis.confirm?.(`Ban @${a.handle}? They can't comment or chat, and their posts are hidden.`)) return;
    await banUser({ profile: a.profile, banned: a.banned, reason: 'admin' });
  });
  const admin = useAdminAction(async (a: { profile: string; handle: string; isAdmin: boolean }) => {
    if (a.isAdmin && !globalThis.confirm?.(`Make @${a.handle} an admin? They'll be able to change everything here.`)) return;
    await setAdmin({ profile: a.profile, isAdmin: a.isAdmin });
  });
  const [memberFilter, setMemberFilter] = useState<string | null>('active');
  const members = useMembers(memberFilter);
  const stripeTest = (id: string | null) => Boolean(id && process.env.EXPO_PUBLIC_STRIPE_MODE !== 'live');

  // New deal
  const [showId, setShowId] = useState('');
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');
  const [points, setPoints] = useState('');
  const add = useAdminAction(async () => {
    if (!showId || !personId) throw new Error('Pick a show and a person.');
    if (!role.trim()) throw new Error('Name the role.');
    const p = Number(points);
    if (!Number.isInteger(p) || p <= 0) throw new Error('Points must be a whole number above 0.');
    await saveDeal({ show_id: showId, profile_id: personId, role: role.trim(), points: p });
    await setCast({ profile: personId, isCast: true });
    setRole('');
    setPoints('');
  });
  const remove = useAdminAction(async (d: { show_id: string; profile_id: string; role: string }) => removeDeal(d));

  const byShow = useMemo(() => {
    const m = new Map<string, NonNullable<typeof deals.data>>();
    for (const d of deals.data ?? []) m.set(d.show_id, [...(m.get(d.show_id) ?? []), d]);
    return m;
  }, [deals.data]);

  return (
    <Page title="Cast & people" subtitle="Accounts, who’s cast, and each role’s points from the signed talent agreements.">
      <Card title="Deals (points split each show’s talent pool)">
        <View style={{ gap: 12, marginBottom: 18 }}>
          <Text style={s.label}>Show</Text>
          <View style={s.row}>
            {(shows.data ?? []).map((x) => (
              <Pressable key={x.id} onPress={() => setShowId(x.id)} style={[s.btn, showId === x.id && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}>
                <Text style={[s.btnText, showId === x.id && { color: colors.goldLight }]}>{x.title}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[s.row, { alignItems: 'flex-end' }]}>
            <Field label="Role" value={role} onChange={setRole} placeholder="Marcus (lead)" width={220} />
            <Field label="Points" value={points} onChange={setPoints} placeholder="6" width={100} />
            <Text style={[s.small, { maxWidth: 260 }]}>
              {personId ? `Actor: @${people.data?.find((p) => p.id === personId)?.handle ?? '…'}` : 'Pick the actor in the list below (“Choose”).'}
            </Text>
            <Btn kind="primary" label="Add deal" busy={add.isPending} onPress={() => add.mutate(undefined)} />
          </View>
          <ErrorText error={add.error} />
        </View>

        {deals.isPending ? <Loading /> : null}
        {(shows.data ?? []).filter((x) => byShow.has(x.id)).map((x) => {
          const list = byShow.get(x.id) ?? [];
          const total = list.reduce((a, d) => a + d.points, 0);
          return (
            <View key={x.id} style={{ marginBottom: 16 }}>
              <Text style={[s.cardTitle, { marginBottom: 6 }]}>{`${x.title} · ${total} points`}</Text>
              {list.map((d) => (
                <Tr
                  key={d.profile_id + d.role}
                  flex={[2, 2, 1, 1.4, 1]}
                  cells={[
                    d.role,
                    `@${d.profiles?.handle ?? d.profile_id.slice(0, 8)}`,
                    `${d.points} pts`,
                    `${((d.points / total) * 100).toFixed(1)}% of the pool`,
                    <Btn key="r" label="Remove" kind="danger" onPress={() => remove.mutate(d)} />,
                  ]}
                />
              ))}
            </View>
          );
        })}
        {!deals.isPending && !deals.data?.length ? <Text style={s.small}>No deals yet.</Text> : null}
        <ErrorText error={deals.error ?? remove.error} />
      </Card>

      <Card title="Accounts" right={<Field label="" value={query} onChange={setQuery} placeholder="Search handle or email" width={280} />}>
        {people.isPending ? <Loading /> : null}
        <Tr head flex={[2, 3, 2.4, 3.4]} cells={['Handle', 'Email', 'Roles', '']} />
        {(people.data ?? []).map((p) => (
          <Tr
            key={p.id}
            flex={[2, 3, 2.4, 3.4]}
            cells={[
              `@${p.handle}`,
              p.email,
              <View key="r" style={s.row}>
                {p.is_admin ? <Pill text="Admin" tone="gold" /> : null}
                {p.verified ? <Pill text="Verified" tone="gold" /> : null}
                {p.is_cast ? <Pill text="Cast" tone="good" /> : null}
                {p.member ? <Pill text="Member" /> : null}
                {p.banned ? <Pill text="Banned" tone="live" /> : null}
              </View>,
              <View key="a" style={s.row}>
                <Btn label={personId === p.id ? 'Chosen' : 'Choose'} kind={personId === p.id ? 'primary' : 'plain'} onPress={() => setPersonId(p.id)} />
                <Btn
                  label={p.verified ? 'Unverify' : 'Verify'}
                  kind={p.verified ? 'plain' : 'primary'}
                  onPress={() => {
                    if (p.verified) {
                      if (globalThis.confirm?.(`Remove @${p.handle}'s verified seal? They'll drop out of Backstage until verified again.`))
                        verify.mutate({ profile: p.id, verified: false });
                      return;
                    }
                    const note = globalThis.prompt?.(
                      `Verify @${p.handle} as the real actor?\n\nHow did you confirm it? (e.g. "ID + video call", "signed talent deal", "posted from their verified Instagram")`,
                    );
                    if (note && note.trim()) verify.mutate({ profile: p.id, verified: true, note });
                  }}
                />
                <Btn label={p.is_cast ? 'Not cast' : 'Mark cast'} onPress={() => cast.mutate({ profile: p.id, isCast: !p.is_cast })} />
                <Btn label={p.is_admin ? 'Remove admin' : 'Make admin'} onPress={() => admin.mutate({ profile: p.id, handle: p.handle, isAdmin: !p.is_admin })} />
                <Btn label={p.banned ? 'Unban' : 'Ban'} kind={p.banned ? 'plain' : 'danger'} onPress={() => ban.mutate({ profile: p.id, handle: p.handle, banned: !p.banned })} />
              </View>,
            ]}
          />
        ))}
        <ErrorText error={people.error ?? cast.error ?? verify.error ?? ban.error ?? admin.error} />
      </Card>

      <View style={{ height: 20 }} />
      <Card
        title={`Memberships · ${members.data?.length ?? 0}`}
        right={
          <View style={s.row}>
            {(
              [
                ['active', 'Active'],
                ['past_due', 'Past due'],
                ['canceled', 'Canceled'],
                [null, 'All'],
              ] as [string | null, string][]
            ).map(([k, label]) => (
              <Btn key={label} label={label} kind={memberFilter === k ? 'primary' : 'plain'} onPress={() => setMemberFilter(k)} />
            ))}
          </View>
        }
      >
        <Text style={[s.small, { marginBottom: 10 }]}>
          Refunds and cancellations happen in Stripe. “Open in Stripe” takes you to that customer.
        </Text>
        {members.isPending ? <Loading /> : null}
        <Tr head flex={[2, 3, 1.4, 1.8, 1.6]} cells={['Handle', 'Email', 'Status', 'Renews / ends', '']} />
        {(members.data ?? []).map((m) => (
          <Tr
            key={m.user_id}
            flex={[2, 3, 1.4, 1.8, 1.6]}
            cells={[
              m.handle ? `@${m.handle}` : '(deleted)',
              m.email ?? '—',
              <Pill key="st" text={m.status} tone={m.status === 'active' ? 'good' : 'muted'} />,
              m.current_period_end ? new Date(m.current_period_end).toLocaleDateString() : '—',
              m.stripe_customer_id ? (
                <Btn
                  key="stripe"
                  label="Open in Stripe"
                  onPress={() =>
                    void Linking.openURL(
                      `https://dashboard.stripe.com/${stripeTest(m.stripe_customer_id) ? 'test/' : ''}customers/${m.stripe_customer_id}`,
                    )
                  }
                />
              ) : (
                ''
              ),
            ]}
          />
        ))}
        {!members.isPending && !members.data?.length ? <Text style={s.small}>No memberships here yet.</Text> : null}
        <ErrorText error={members.error} />
      </Card>
    </Page>
  );
}
