import { useState } from 'react';
import { Image, Text, View } from 'react-native';

import {
  addBlockedWord,
  approvePhoto,
  banUser,
  hideChat,
  hideComment,
  hideSocial,
  rejectPhoto,
  removeBlockedWord,
  resolveReport,
  useAdminAction,
  useBlockedWords,
  usePhotoQueue,
  useReports,
  type PendingPhoto,
  type Report,
} from '@/admin/data';
import { Btn, Card, ErrorText, Field, Loading, Page, Pill, s, Tr } from '@/admin/ui';

const KIND_LABEL: Record<Report['kind'], string> = {
  comment: 'Comment',
  chat: 'Live chat',
  user: 'Person',
  post: 'Post',
  post_comment: 'Post comment',
  room: 'Fan room',
  dm: 'Message',
  channel_reply: 'Channel reply',
};

const confirmWeb = (q: string) => Boolean(globalThis.confirm?.(q));

export default function AdminCommunity() {
  const [showAll, setShowAll] = useState(false);
  const reports = useReports();
  const photos = usePhotoQueue();
  const words = useBlockedWords();
  const [word, setWord] = useState('');

  const hide = useAdminAction(async (r: Report) => {
    if (r.comment_id) await hideComment({ comment: r.comment_id, hidden: !r.hidden });
    else if (r.chat_message_id) await hideChat({ message: r.chat_message_id, hidden: !r.hidden });
    else if (r.target_id && (r.kind === 'post' || r.kind === 'post_comment' || r.kind === 'room' || r.kind === 'channel_reply'))
      await hideSocial({ kind: r.kind, id: r.target_id, hidden: !r.hidden });
  });
  const ban = useAdminAction(async (r: Report) => {
    if (!r.author_id) return;
    if (!r.author_banned && !confirmWeb(`Ban @${r.author}? They won't be able to comment or chat, and everything they've posted is hidden.`)) return;
    await banUser({ profile: r.author_id, banned: !r.author_banned, reason: r.reason });
  });
  const resolve = useAdminAction(resolveReport);
  const approve = useAdminAction(approvePhoto);
  const reject = useAdminAction(rejectPhoto);
  const addWord = useAdminAction(async (w: string) => {
    await addBlockedWord(w);
    setWord('');
  });
  const dropWord = useAdminAction(removeBlockedWord);

  const list = (reports.data ?? []).filter((r) => showAll || r.status === 'open');
  const open = (reports.data ?? []).filter((r) => r.status === 'open').length;

  return (
    <Page title="Community" subtitle="Reports, profile photos and the word filter. Open reports first.">
      <Card
        title={`Reports · ${open} open`}
        right={<Btn label={showAll ? 'Open only' : 'Show all'} onPress={() => setShowAll((v) => !v)} />}
      >
        {reports.isPending ? <Loading /> : null}
        {list.length ? (
          <>
            <Tr head flex={[1.1, 0.9, 3.2, 1.3, 1.2, 1, 3.2]} cells={['When', 'Type', 'What was said', 'By', 'Reason', 'Status', '']} />
            {list.map((r) => (
              <Tr
                key={r.id}
                flex={[1.1, 0.9, 3.2, 1.3, 1.2, 1, 3.2]}
                cells={[
                  new Date(r.created_at).toLocaleDateString(),
                  KIND_LABEL[r.kind],
                  r.kind === 'user' ? '(reported the person)' : r.body ?? '(deleted)',
                  <View key="by" style={{ gap: 4 }}>
                    <Text style={s.body}>{r.author ? `@${r.author}` : '—'}</Text>
                    {r.author_banned ? <Pill text="Banned" tone="live" /> : null}
                  </View>,
                  r.reason.replace(/_/g, ' '),
                  <Pill key="st" text={r.status} tone={r.status === 'open' ? 'warn' : 'muted'} />,
                  <View key="a" style={[s.row, { gap: 6 }]}>
                    {r.kind !== 'user' && r.kind !== 'dm' && r.body ? (
                      <Btn label={r.hidden ? 'Show again' : 'Hide'} kind={r.hidden ? 'plain' : 'danger'} onPress={() => hide.mutate(r)} />
                    ) : null}
                    {r.author_id ? <Btn label={r.author_banned ? 'Unban' : 'Ban'} kind={r.author_banned ? 'plain' : 'danger'} onPress={() => ban.mutate(r)} /> : null}
                    {r.status === 'open' ? (
                      <>
                        <Btn label="Resolved" kind="primary" onPress={() => resolve.mutate({ id: r.id, status: 'resolved' })} />
                        <Btn label="Dismiss" onPress={() => resolve.mutate({ id: r.id, status: 'dismissed' })} />
                      </>
                    ) : (
                      <Btn label="Reopen" onPress={() => resolve.mutate({ id: r.id, status: 'open' })} />
                    )}
                  </View>,
                ]}
              />
            ))}
          </>
        ) : !reports.isPending ? (
          <Text style={s.small}>{showAll ? 'No reports yet.' : 'No open reports. Nice.'}</Text>
        ) : null}
        <ErrorText error={reports.error ?? hide.error ?? ban.error ?? resolve.error} />
      </Card>

      <View style={{ height: 20 }} />
      <Card title={`Profile photos to review · ${photos.data?.length ?? 0}`}>
        <Text style={[s.small, { marginBottom: 12 }]}>
          New photos stay private until you approve them. Reject anything that isn't a face or avatar, or that shows nudity, violence, hate or someone else.
        </Text>
        {photos.isPending ? <Loading /> : null}
        <View style={[s.row, { gap: 16, alignItems: 'flex-start' }]}>
          {(photos.data ?? []).map((p: PendingPhoto & { preview: string | null }) => (
            <View key={p.id} style={{ width: 160, gap: 8 }}>
              {p.preview ? (
                <Image source={{ uri: p.preview }} style={{ width: 160, height: 160, borderRadius: 80 }} />
              ) : (
                <Text style={s.small}>Preview unavailable</Text>
              )}
              <Text style={s.body}>@{p.handle}</Text>
              <View style={[s.row, { gap: 6 }]}>
                <Btn label="Approve" kind="primary" busy={approve.isPending && approve.variables?.id === p.id} onPress={() => approve.mutate(p)} />
                <Btn label="Reject" kind="danger" busy={reject.isPending && reject.variables?.id === p.id} onPress={() => reject.mutate(p)} />
              </View>
            </View>
          ))}
        </View>
        {!photos.isPending && !(photos.data ?? []).length ? <Text style={s.small}>Nothing waiting.</Text> : null}
        <ErrorText error={photos.error ?? approve.error ?? reject.error} />
      </Card>

      <View style={{ height: 20 }} />
      <Card title="Word filter">
        <Text style={[s.small, { marginBottom: 12 }]}>
          Comments and chat messages containing any of these whole words are refused before they post.
        </Text>
        <View style={[s.row, { alignItems: 'flex-end' }]}>
          <Field label="Add a word" value={word} onChange={setWord} placeholder="word" width={240} />
          <Btn label="Add" kind="primary" disabled={word.trim().length < 2} busy={addWord.isPending} onPress={() => addWord.mutate(word)} />
        </View>
        <View style={[s.row, { gap: 8, marginTop: 14 }]}>
          {(words.data ?? []).map((w) => (
            <Btn key={w} label={`${w}  ✕`} onPress={() => dropWord.mutate(w)} />
          ))}
        </View>
        <ErrorText error={words.error ?? addWord.error ?? dropWord.error} />
      </Card>
    </Page>
  );
}
