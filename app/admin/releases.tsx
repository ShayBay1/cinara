import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  addPremiere,
  pickFile,
  removePremiere,
  saveComingSoon,
  saveShow,
  setPremiereLive,
  uploadComingSoonCover,
  useAdminAction,
  useAdminShows,
  useComingSoon,
  usePremieres,
} from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s, Tr } from '@/admin/ui';
import { colors } from '@/theme/tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function AdminReleases() {
  const shows = useAdminShows();
  const premieres = usePremieres();
  const release = useAdminAction(async ({ id, latest }: { id: string; latest: number }) => saveShow({ id, latest_episode: latest }));

  // New premiere
  const [showId, setShowId] = useState('');
  const [episode, setEpisode] = useState('');
  const [when, setWhen] = useState('');
  const add = useAdminAction(async () => {
    const at = new Date(when);
    if (!showId) throw new Error('Pick a show.');
    if (!Number(episode)) throw new Error('Which episode does the premiere start with?');
    if (Number.isNaN(at.getTime())) throw new Error('Enter the start as 2026-10-23 20:00 (your local time).');
    await addPremiere({ show_id: showId, episode: Number(episode), starts_at: at.toISOString() });
    setEpisode('');
    setWhen('');
  });
  const live = useAdminAction(async ({ id, on }: { id: number; on: boolean }) => setPremiereLive(id, on));
  const remove = useAdminAction(async (id: number) => removePremiere(id));

  if (shows.isPending) return <Loading />;
  const titleOf = (id: string) => shows.data?.find((x) => x.id === id)?.title ?? id;

  return (
    <Page title="Releases" subtitle="What’s out, what drops next, and the live premieres.">
      <Card title="Episodes out">
        <Tr head flex={[3, 1.5, 2, 3]} cells={['Show', 'Released', 'Drop nights', '']} />
        {(shows.data ?? []).map((x) => {
          const next = Math.min(x.latest_episode + 10, x.episode_count);
          return (
            <Tr
              key={x.id}
              flex={[3, 1.5, 2, 3]}
              cells={[
                <View key="t" style={s.row}>
                  <Text style={s.body}>{x.title}</Text>
                  {!x.published ? <Pill text="Draft" /> : null}
                </View>,
                `${x.latest_episode} of ${x.episode_count}`,
                x.release_days.map((d) => DAYS[d]).join(', ') || '—',
                <View key="a" style={s.row}>
                  <Btn
                    kind="primary"
                    label={next > x.latest_episode ? `Release ${x.latest_episode + 1}–${next} now` : 'All released'}
                    disabled={next <= x.latest_episode}
                    onPress={() => release.mutate({ id: x.id, latest: next })}
                  />
                  {x.latest_episode > 0 ? (
                    <Btn label="Pull back 10" kind="danger" onPress={() => release.mutate({ id: x.id, latest: Math.max(0, x.latest_episode - 10) })} />
                  ) : null}
                </View>,
              ]}
            />
          );
        })}
        <Text style={[s.small, { marginTop: 10 }]}>
          Normally drops go out on their own at 8 PM Eastern on each drop night. Use these to release early or fix a mistake.
        </Text>
        <ErrorText error={release.error} />
      </Card>

      <Card title="Live premieres">
        <View style={{ gap: 12, marginBottom: 16 }}>
          <Text style={s.label}>Show</Text>
          <View style={s.row}>
            {(shows.data ?? []).map((x) => (
              <Pressable key={x.id} onPress={() => setShowId(x.id)} style={[s.btn, showId === x.id && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}>
                <Text style={[s.btnText, showId === x.id && { color: colors.goldLight }]}>{x.title}</Text>
              </Pressable>
            ))}
          </View>
          <View style={[s.row, { alignItems: 'flex-end' }]}>
            <Field label="First episode" value={episode} onChange={setEpisode} placeholder="21" width={140} />
            <Field label="Starts (your time)" value={when} onChange={setWhen} placeholder="2026-10-23 20:00" width={220} />
            <Btn kind="primary" label="Add premiere" busy={add.isPending} onPress={() => add.mutate(undefined)} />
          </View>
          <ErrorText error={add.error} />
        </View>
        {premieres.isPending ? (
          <Loading />
        ) : (
          <>
            <Tr head flex={[3, 1, 2.4, 1, 2.4]} cells={['Show', 'From ep.', 'Starts', 'Status', '']} />
            {(premieres.data ?? []).map((p) => (
              <Tr
                key={p.id}
                flex={[3, 1, 2.4, 1, 2.4]}
                cells={[
                  titleOf(p.show_id),
                  String(p.episode),
                  fmt(p.starts_at),
                  <Pill key="s" text={p.is_live ? 'LIVE' : new Date(p.starts_at) > new Date() ? 'Upcoming' : 'Done'} tone={p.is_live ? 'live' : 'muted'} />,
                  <View key="a" style={s.row}>
                    <Btn label={p.is_live ? 'End' : 'Go live'} onPress={() => live.mutate({ id: p.id, on: !p.is_live })} />
                    <Btn label="Remove" kind="danger" onPress={() => remove.mutate(p.id)} />
                  </View>,
                ]}
              />
            ))}
          </>
        )}
        <ErrorText error={premieres.error ?? live.error ?? remove.error} />
      </Card>

      <ComingSoonCard />
    </Page>
  );
}

function ComingSoonCard() {
  const cs = useComingSoon();
  const [f, setF] = useState({ title: '', teaser: '', starring: '', arrives: '' });
  useEffect(() => {
    if (cs.data) setF({ title: cs.data.title ?? '', teaser: cs.data.teaser, starring: cs.data.starring, arrives: cs.data.arrives });
  }, [cs.data]);
  const save = useAdminAction(async () => saveComingSoon({ ...f, title: f.title.trim() || null }));
  const cover = useAdminAction(async () => {
    const file = await pickFile('image/jpeg,image/png,image/webp');
    if (file) await uploadComingSoonCover(file);
  });
  const coverUrl = (cs.data as { cover_url?: string | null } | null | undefined)?.cover_url ?? null;
  return (
    <Card title="Coming soon (the card in the Feed)" right={<Btn kind="primary" label="Save" busy={save.isPending} onPress={() => save.mutate(undefined)} />}>
      <View style={{ gap: 12 }}>
        <View style={s.row}>
          <Field label="Title (blank hides the card)" value={f.title} onChange={(v) => setF({ ...f, title: v })} />
          <Field label="Arrives" value={f.arrives} onChange={(v) => setF({ ...f, arrives: v })} placeholder="This winter" />
        </View>
        <Field label="Teaser" value={f.teaser} onChange={(v) => setF({ ...f, teaser: v })} multiline />
        <Field label="Starring" value={f.starring} onChange={(v) => setF({ ...f, starring: v })} />
        <View style={[s.row, { alignItems: 'center' }]}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={{ width: 72, height: 108, borderRadius: 6 }} /> : null}
          <Btn label={coverUrl ? 'Replace cover' : 'Upload cover'} busy={cover.isPending} onPress={() => cover.mutate(undefined)} />
          <Text style={s.small}>Portrait key art. Until you upload one, the Feed uses the mock-up.</Text>
        </View>
        <ErrorText error={cs.error ?? save.error ?? cover.error} />
      </View>
    </Card>
  );
}
