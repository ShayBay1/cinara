import { Link, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  type AdminShow,
  deleteEpisode,
  deleteShow,
  pickFile,
  pickFiles,
  saveEpisodeTitle,
  saveShow,
  uploadCover,
  uploadEpisode,
  useAdminAction,
  useAdminShows,
  useEpisodes,
} from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s, Toggle, Tr } from '@/admin/ui';
import { colors } from '@/theme/tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Upload = { progress: number; phase: 'uploading' | 'processing' | 'error'; error?: string };

export default function AdminShowEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shows = useAdminShows();
  const show = shows.data?.find((x) => x.id === id);
  if (shows.isPending) return <Loading />;
  if (!show) return <Page title="Show not found"><ErrorText error={shows.error ?? 'No show with that id.'} /></Page>;
  return <Editor key={show.id} show={show} />;
}

function Editor({ show }: { show: AdminShow }) {
  const [f, setF] = useState(show);
  const [budget, setBudget] = useState(String(Math.round(show.production_budget_cents / 100)));
  const [titles, setTitles] = useState(show.episode_titles.join('\n'));
  const set = <K extends keyof AdminShow>(k: K, v: AdminShow[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty =
    JSON.stringify(f) !== JSON.stringify(show) ||
    budget !== String(Math.round(show.production_budget_cents / 100)) ||
    titles !== show.episode_titles.join('\n');

  const save = useAdminAction(async () => {
    const dollars = Number(budget.replace(/[$,\s]/g, '') || 0);
    if (!Number.isFinite(dollars) || dollars < 0) throw new Error('The budget must be a dollar amount.');
    if (f.latest_episode > f.episode_count) throw new Error('Released episodes can’t be more than the episode count.');
    await saveShow({
      ...f,
      production_budget_cents: Math.round(dollars * 100),
      episode_titles: titles.split('\n').map((t) => t.trim()).filter((t, i, a) => t || i < a.length - 1),
      cast: f.cast.filter((c) => c.role.trim()),
    });
  });
  const remove = useAdminAction(async () => {
    const sure = globalThis.confirm?.(
      `Delete “${show.title}” for good? Its episodes, comments and premieres go too. To just hide it, turn off Published instead.`,
    );
    if (!sure) return;
    await deleteShow(show.id);
    router.replace('/admin/shows');
  });
  const cover = useAdminAction(async () => {
    const file = await pickFile('image/jpeg,image/png,image/webp');
    if (file) set('cover_url', await uploadCover(show.id, file));
  });

  return (
    <Page
      title={show.title}
      subtitle={`/${show.id}`}
      actions={
        <>
          <Link href="/admin/shows" style={[s.small, { color: colors.gold }]}>All shows</Link>
          <Btn kind="danger" label="Delete show" busy={remove.isPending} onPress={() => remove.mutate(undefined)} />
          <Btn kind="primary" label={dirty ? 'Save changes' : 'Saved'} disabled={!dirty} busy={save.isPending} onPress={() => save.mutate(undefined)} />
        </>
      }
    >
      <ErrorText error={save.error ?? remove.error} />
      <View style={{ flexDirection: 'row', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Card title="Cover" style={{ width: 280, gap: 12 }}>
          <View style={{ height: 380, borderRadius: 8, overflow: 'hidden', backgroundColor: f.color }}>
            {f.cover_url ? <Image source={{ uri: f.cover_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
          </View>
          <Btn label={f.cover_url ? 'Replace cover' : 'Upload cover'} busy={cover.isPending} onPress={() => cover.mutate(undefined)} />
          <Text style={s.small}>Portrait art, 2:3 or taller. It’s cropped to fit each spot.</Text>
          <ErrorText error={cover.error} />
        </Card>

        <Card title="Details" style={{ flex: 1, minWidth: 520, gap: 14 }}>
          <View style={s.row}>
            <Field label="Title" value={f.title} onChange={(v) => set('title', v)} />
            <Field label="No." value={f.number} onChange={(v) => set('number', v)} width={80} />
            <Field label="Genre" value={f.genre} onChange={(v) => set('genre', v)} />
          </View>
          <Field label="Tagline" value={f.tagline} onChange={(v) => set('tagline', v)} />
          <Field label="Synopsis" value={f.synopsis ?? ''} onChange={(v) => set('synopsis', v)} multiline />
          <View style={s.row}>
            <Field label="Episodes in the season" value={String(f.episode_count)} onChange={(v) => set('episode_count', Number(v.replace(/\D/g, '')) || 0)} width={180} />
            <Field label="Released so far" value={String(f.latest_episode)} onChange={(v) => set('latest_episode', Number(v.replace(/\D/g, '')) || 0)} width={160} />
            <Field label="Production budget ($)" value={budget} onChange={setBudget} width={200} hint="The talent pool rises from 40% to 60% once the show earns this back." />
            <Field label="Poster colour" value={f.color} onChange={(v) => set('color', v)} width={130} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Drop nights (8 PM Eastern, 10 episodes each)</Text>
            <View style={s.row}>
              {DAYS.map((d, i) => {
                const on = f.release_days.includes(i);
                return (
                  <Pressable
                    key={d}
                    onPress={() => set('release_days', on ? f.release_days.filter((x) => x !== i) : [...f.release_days, i].sort())}
                    style={[s.btn, on && { borderColor: colors.gold, backgroundColor: '#3A2A0E' }]}
                  >
                    <Text style={[s.btnText, on && { color: colors.goldLight }]}>{d}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={[s.row, { gap: 28 }]}>
            <Toggle label="Published (visible in the app)" value={f.published} onChange={(v) => set('published', v)} />
            <Toggle label="Featured on Home" value={f.featured} onChange={(v) => set('featured', v)} />
            <Toggle
              label="Release drops automatically at 8/7c (only when all 10 videos are uploaded)"
              value={f.auto_release ?? true}
              onChange={(v) => set('auto_release', v)}
            />
          </View>
        </Card>
      </View>

      <Card
        title="Cast (as shown in the app)"
        right={<Btn label="Add a role" onPress={() => set('cast', [...f.cast, { role: '', actorName: '' }])} />}
      >
        {f.cast.length ? (
          <View style={{ gap: 10 }}>
            {f.cast.map((c, i) => (
              <View key={i} style={[s.row, { alignItems: 'flex-end' }]}>
                <Field label="Role" value={c.role} onChange={(v) => set('cast', f.cast.map((x, j) => (j === i ? { ...x, role: v } : x)))} />
                <Field label="Actor" value={c.actorName} onChange={(v) => set('cast', f.cast.map((x, j) => (j === i ? { ...x, actorName: v } : x)))} />
                <Field label="Also credit" value={c.alsoCredit ?? ''} placeholder="Also directed" onChange={(v) => set('cast', f.cast.map((x, j) => (j === i ? { ...x, alsoCredit: v || undefined } : x)))} />
                <Btn label="Remove" kind="danger" onPress={() => set('cast', f.cast.filter((_, j) => j !== i))} />
              </View>
            ))}
            <Text style={s.small}>Pay (points) is set separately under Cast & people, from the signed agreements.</Text>
          </View>
        ) : (
          <Text style={s.small}>No cast listed yet.</Text>
        )}
      </Card>

      <Episodes show={{ ...show, episode_count: f.episode_count }} titles={titles} setTitles={setTitles} />
    </Page>
  );
}

function Episodes({ show, titles, setTitles }: { show: AdminShow; titles: string; setTitles: (t: string) => void }) {
  const [uploads, setUploads] = useState<Record<number, Upload>>({});
  const processing = Object.values(uploads).some((u) => u.phase === 'processing');
  const eps = useEpisodes(show.id, processing);
  const byNumber = new Map((eps.data ?? []).map((e) => [e.number, e]));
  const titleList = titles.split('\n');
  const [batchStart, setBatchStart] = useState('1');

  // An episode Mux has filed is done processing.
  useEffect(() => {
    setUploads((u) => {
      let changed = false;
      const next = { ...u };
      for (const [n, up] of Object.entries(u)) {
        if (up.phase === 'processing' && byNumber.has(Number(n))) {
          delete next[Number(n)];
          changed = true;
        }
      }
      return changed ? next : u;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eps.data]);

  const start = async (number: number, file: File) => {
    setUploads((u) => ({ ...u, [number]: { progress: 0, phase: 'uploading' } }));
    try {
      await uploadEpisode({ showId: show.id, number, title: titleList[number - 1]?.trim(), file }, (p) =>
        setUploads((u) => ({ ...u, [number]: { progress: p, phase: 'uploading' } })),
      );
      setUploads((u) => ({ ...u, [number]: { progress: 1, phase: 'processing' } }));
    } catch (e) {
      setUploads((u) => ({ ...u, [number]: { progress: 0, phase: 'error', error: e instanceof Error ? e.message : 'Failed' } }));
    }
  };
  const uploadOne = async (n: number) => {
    const file = await pickFile('video/*');
    if (file) void start(n, file);
  };
  const uploadBatch = async () => {
    const first = Math.max(1, Number(batchStart) || 1);
    const files = await pickFiles('video/*');
    // One at a time, in name order: keeps the upload fast and the order predictable.
    for (const [i, file] of files.entries()) await start(first + i, file);
  };
  const drop = useAdminAction(async (n: number) => {
    if (!globalThis.confirm?.(`Remove episode ${n}'s video? Viewers will see “not ready yet” until you upload it again.`)) return;
    await deleteEpisode(show.id, n);
  });
  const rename = useAdminAction(async (n: number) => {
    const t = titleList[n - 1]?.trim();
    if (t && byNumber.has(n)) await saveEpisodeTitle(show.id, n, t);
  });

  const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const rows = Array.from({ length: show.episode_count }, (_, i) => i + 1);

  return (
    <Card
      title={`Episodes · ${byNumber.size} of ${show.episode_count} uploaded`}
      right={
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <Field label="Batch starts at episode" value={batchStart} onChange={setBatchStart} width={170} />
          <Btn kind="primary" label="Upload a batch" onPress={() => void uploadBatch()} />
        </View>
      }
    >
      <Text style={[s.small, { marginBottom: 12 }]}>
        Upload the square master (2160 × 2160). Files go straight to Mux, then take a few minutes to process; each episode turns
        “Ready” on its own. A batch is numbered in file-name order from the starting episode.
      </Text>
      <Tr head flex={[0.6, 3, 1, 1.4, 1.6]} cells={['#', 'Title', 'Length', 'Status', '']} />
      {rows.map((n) => {
        const ep = byNumber.get(n);
        const up = uploads[n];
        const released = n <= show.latest_episode;
        return (
          <Tr
            key={n}
            flex={[0.6, 3, 1, 1.4, 1.6]}
            cells={[
              String(n),
              <View key="t" style={[s.row, { flexWrap: 'nowrap', alignSelf: 'stretch' }]}>
                <Field
                  label=""
                  value={titleList[n - 1] ?? ''}
                  placeholder={ep?.title ?? `Episode ${n}`}
                  onChange={(v) => {
                    const next = [...titleList];
                    while (next.length < n) next.push('');
                    next[n - 1] = v;
                    setTitles(next.join('\n'));
                  }}
                />
              </View>,
              ep ? mmss(ep.duration_sec) : '—',
              up?.phase === 'uploading' ? (
                <Pill key="p" text={`Uploading ${Math.round(up.progress * 100)}%`} tone="warn" />
              ) : up?.phase === 'processing' ? (
                <Pill key="p" text="Processing…" tone="warn" />
              ) : up?.phase === 'error' ? (
                <Text key="p" style={[s.small, { color: colors.liveSoft }]}>{up.error}</Text>
              ) : ep ? (
                <Pill key="p" text={released ? 'Ready · released' : 'Ready'} tone="good" />
              ) : (
                <Pill key="p" text={released ? 'Missing!' : 'Not uploaded'} tone={released ? 'live' : 'muted'} />
              ),
              <View key="a" style={s.row}>
                <Btn label={ep ? 'Replace' : 'Upload'} disabled={up?.phase === 'uploading'} onPress={() => void uploadOne(n)} />
                {ep ? <Btn label="Save title" onPress={() => rename.mutate(n)} /> : null}
                {ep ? <Btn label="Remove" kind="danger" onPress={() => drop.mutate(n)} /> : null}
              </View>,
            ]}
          />
        );
      })}
      <ErrorText error={eps.error ?? rename.error ?? drop.error} />
    </Card>
  );
}
