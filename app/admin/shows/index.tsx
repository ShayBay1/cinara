import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import { saveShow, useAdminAction, useAdminShows } from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s } from '@/admin/ui';

const slug = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminShows() {
  const shows = useAdminShows();
  const [title, setTitle] = useState('');
  const create = useAdminAction(async () => {
    const id = slug(title);
    if (!id) throw new Error('Give the show a title.');
    if (shows.data?.some((x) => x.id === id)) throw new Error('A show with that name already exists.');
    const next = String((shows.data?.length ?? 0) + 1).padStart(2, '0');
    await saveShow({
      id, title: title.trim(), number: next, genre: '', tagline: '', episode_count: 60, latest_episode: 0,
      release_days: [5], cast: [], episode_titles: [], published: false, featured: false, color: '#3A1420',
    });
    setTitle('');
    router.push({ pathname: '/admin/shows/[id]', params: { id } });
  });

  if (shows.isPending) return <Loading />;
  return (
    <Page title="Shows & episodes" subtitle="Click a show to edit it, add cover art and upload episodes.">
      <Card title="New show">
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <Field label="Title" value={title} onChange={setTitle} placeholder="Married to the Don" />
          <Btn kind="primary" label="Create as draft" busy={create.isPending} onPress={() => create.mutate(undefined)} />
        </View>
        <ErrorText error={create.error} />
      </Card>
      <ErrorText error={shows.error} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {(shows.data ?? []).map((x) => (
          <Card key={x.id} style={{ width: 270, padding: 0, overflow: 'hidden' }}>
            <View style={{ height: 300, backgroundColor: x.color }}>
              {x.cover_url ? <Image source={{ uri: x.cover_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
            </View>
            <View style={{ padding: 16, gap: 8 }}>
              <Text style={[s.body, { fontFamily: s.cardTitle.fontFamily, color: '#FFD25A' }]}>{`${x.number} · ${x.title}`}</Text>
              <View style={s.row}>
                <Pill text={x.published ? 'Live' : 'Draft'} tone={x.published ? 'good' : 'muted'} />
                {x.featured ? <Pill text="Featured" tone="gold" /> : null}
                <Pill text={`${x.latest_episode}/${x.episode_count} released`} />
              </View>
              <Btn label="Edit" onPress={() => router.push({ pathname: '/admin/shows/[id]', params: { id: x.id } })} />
            </View>
          </Card>
        ))}
      </View>
    </Page>
  );
}
