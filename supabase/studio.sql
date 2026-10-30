-- =====================================================================================
-- Cinara Studio: the creator side, borrowed from what works on subscription apps.
--   creator home + daily challenge, mass DMs, paid DMs and paid posts (unlocked on the web),
--   photo / voice / disappearing DMs, emoji reactions on posts, a content vault,
--   cover photos and free trials for the messages add-on, top spenders in the inbox.
-- Safe to run more than once.
-- =====================================================================================

-- ---------- Columns ----------
alter table public.profiles add column if not exists cover_path text;
alter table public.profiles add column if not exists trial_days int not null default 0;
alter table public.profiles drop constraint if exists profiles_trial_days_check;
alter table public.profiles add constraint profiles_trial_days_check check (trial_days in (0, 3, 7, 14, 30));
grant select (cover_path, trial_days) on public.profiles to authenticated;

alter table public.posts add column if not exists price_cents int;
alter table public.posts drop constraint if exists posts_price_check;
alter table public.posts add constraint posts_price_check check (price_cents is null or price_cents between 199 and 9999);

alter table public.dm_messages add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.dm_messages add column if not exists price_cents int;
alter table public.dm_messages add column if not exists ghost boolean not null default false;
alter table public.dm_messages add column if not exists opened_at timestamptz;
alter table public.dm_messages add column if not exists mass_id uuid;
alter table public.dm_messages drop constraint if exists dm_messages_price_check;
alter table public.dm_messages add constraint dm_messages_price_check check (price_cents is null or price_cents between 199 and 9999);
create index if not exists dm_messages_mass on public.dm_messages (sender_id, created_at) where mass_id is not null;

-- A DM can be just a photo or a voice note now.
create or replace function public.check_user_text() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_post();
  new.body := trim(coalesce(new.body, ''));
  if TG_TABLE_NAME in ('posts', 'dm_messages') then
    if new.body = '' and jsonb_array_length(coalesce(new.media, '[]'::jsonb)) = 0 then
      raise exception 'Add a photo, video or caption.';
    end if;
  elsif new.body = '' then
    raise exception 'Write something first.';
  end if;
  if not public.text_is_clean(new.body) then raise exception 'That breaks our community rules. Keep it kind.'; end if;
  return new;
end $$;

-- Paid posts are for verified actors.
create or replace function public.check_post_media() returns trigger
language plpgsql set search_path = public as $$
declare m jsonb;
begin
  if jsonb_typeof(new.media) <> 'array' or jsonb_array_length(new.media) > 10 then
    raise exception 'Up to 10 photos or videos per post.';
  end if;
  for m in select * from jsonb_array_elements(new.media) loop
    if coalesce(m->>'type','') not in ('image','video') or coalesce(m->>'path','') not like new.author_id::text || '/%' then
      raise exception 'That media can''t be attached.';
    end if;
  end loop;
  if coalesce(trim(new.body), '') = '' and jsonb_array_length(new.media) = 0 then
    raise exception 'Add a caption or a photo.';
  end if;
  if (new.visibility = 'subscribers' or new.price_cents is not null)
     and not exists (select 1 from profiles where id = new.author_id and verified_at is not null) then
    raise exception 'Backstage and paid posts are for verified actors. Ask Cinara to verify your account.';
  end if;
  if new.price_cents is not null and jsonb_array_length(new.media) = 0 then
    raise exception 'A paid post needs a photo or video to unlock.';
  end if;
  return new;
end $$;

-- ---------- Unlocks (paid DMs and paid posts, bought on cinaratv.com) ----------
create table if not exists public.unlock_purchases (
  id bigserial primary key,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('dm', 'post')),
  item_id uuid not null,
  gross_cents int not null,
  fee_cents int not null default 0,
  tax_cents int not null default 0,
  actor_share_cents int not null,
  month date not null,
  paid_out_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists unlock_buyer on public.unlock_purchases (buyer_id, kind, item_id);
create index if not exists unlock_actor on public.unlock_purchases (actor_id, created_at);
alter table public.unlock_purchases enable row level security;
drop policy if exists "buyers and actors read unlocks" on public.unlock_purchases;
create policy "buyers and actors read unlocks" on public.unlock_purchases for select to authenticated
  using ((select auth.uid()) in (buyer_id, actor_id) or public.is_admin());

create or replace function public.has_unlocked(p_user uuid, p_kind text, p_item uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user is not null and exists (select 1 from unlock_purchases u
    where u.buyer_id = p_user and u.kind = p_kind and u.item_id = p_item and u.refunded_at is null);
$$;

-- A paid post opens for its buyers (no pass needed); everything else works as before.
create or replace function public.can_view_post(p_post uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from posts p where p.id = p_post and not p.hidden and (
      p.author_id = auth.uid() or public.is_admin()
      or (p.price_cents is not null and public.has_unlocked(auth.uid(), 'post', p.id))
      or (p.price_cents is null and (p.visibility = 'public' or public.is_subscribed(auth.uid(), p.author_id)))));
$$;

-- ---------- Emoji reactions on posts (the heart stays the like) ----------
create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '🔥', '👀', '😍', '😮', '😢')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);
alter table public.post_reactions enable row level security;

create or replace function public.post_json(p posts) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'visibility', p.visibility, 'show_id', p.show_id, 'created_at', p.created_at,
    'price_cents', p.price_cents,
    'locked', not public.can_view_post(p.id),
    'body', case when public.can_view_post(p.id) or p.price_cents is not null then p.body else null end,
    'media', case when public.can_view_post(p.id) then p.media
                  else (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', m->>'type', 'preview', m->>'preview',
                          'width', m->'width', 'height', m->'height'))), '[]'::jsonb) from jsonb_array_elements(p.media) m) end,
    'likes', (select count(*) from post_likes l where l.post_id = p.id),
    'liked_by_me', exists (select 1 from post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    'reactions', (select coalesce(jsonb_object_agg(r.emoji, r.n), '{}'::jsonb)
                  from (select emoji, count(*) n from post_reactions where post_id = p.id group by emoji) r),
    'my_reactions', (select coalesce(jsonb_agg(emoji), '[]'::jsonb) from post_reactions where post_id = p.id and user_id = auth.uid()),
    'unlocks', case when p.author_id = auth.uid() then
                 (select count(*) from unlock_purchases u where u.kind = 'post' and u.item_id = p.id and u.refunded_at is null) end,
    'comments', (select count(*) from post_comments c where c.post_id = p.id and not c.hidden),
    'author', public.author_json(p.author_id));
$$;

create or replace function public.react_post(p_post uuid, p_emoji text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not public.can_view_post(p_post) then raise exception 'Post not found.'; end if;
  if p_on then
    insert into post_reactions (post_id, user_id, emoji) values (p_post, auth.uid(), p_emoji) on conflict do nothing;
  else
    delete from post_reactions where post_id = p_post and user_id = auth.uid() and emoji = p_emoji;
  end if;
  return (select coalesce(jsonb_object_agg(r.emoji, r.n), '{}'::jsonb)
          from (select emoji, count(*) n from post_reactions where post_id = p_post group by emoji) r);
end $$;

-- ---------- DM media: photos, videos, voice notes ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('dm-media', 'dm-media', false, 104857600) on conflict (id) do nothing;

-- What the viewer may see of one message: the sender always; the other side once it's paid for
-- (if it has a price) and while a disappearing message is still within its minute.
create or replace function public.dm_unlocked(p_msg uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_messages m join dm_threads t on t.id = m.thread_id
    where m.id = p_msg and auth.uid() in (t.fan_id, t.actor_id) and (
      m.sender_id = auth.uid() or (
        (m.price_cents is null or public.has_unlocked(auth.uid(), 'dm', m.id))
        and not (m.ghost and m.opened_at is not null and m.opened_at < now() - interval '60 seconds'))));
$$;

create or replace function public.can_view_dm_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_messages m
    where m.media @> jsonb_build_array(jsonb_build_object('path', p_name)) and public.dm_unlocked(m.id));
$$;

-- Vault photos an actor sends in DMs live in post-media; let the right fans open them there too.
create or replace function public.can_view_media(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from posts p where p.media @> jsonb_build_array(jsonb_build_object('path', p_name)) and public.can_view_post(p.id))
      or exists (select 1 from channel_messages m where m.media @> jsonb_build_array(jsonb_build_object('path', p_name))
                 and not m.hidden and public.can_view_channel(m.actor_id))
      or public.can_view_dm_media(p_name);
$$;

drop policy if exists "upload own dm media" on storage.objects;
create policy "upload own dm media" on storage.objects for insert to authenticated
  with check (bucket_id = 'dm-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "view dm media" on storage.objects;
create policy "view dm media" on storage.objects for select to authenticated
  using (bucket_id = 'dm-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_view_dm_media(name)));
drop policy if exists "delete own dm media" on storage.objects;
create policy "delete own dm media" on storage.objects for delete to authenticated
  using (bucket_id = 'dm-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Checks the photos, videos and voice notes on a message, and its price.
create or replace function public.check_dm_payload(p_sender uuid, p_media jsonb, p_price int, p_ghost boolean, p_as_actor boolean)
returns void language plpgsql stable security definer set search_path = public as $$
declare m jsonb;
begin
  if jsonb_typeof(coalesce(p_media, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_media, '[]'::jsonb)) > 6 then
    raise exception 'Up to 6 photos or videos per message.';
  end if;
  for m in select * from jsonb_array_elements(coalesce(p_media, '[]'::jsonb)) loop
    if coalesce(m->>'type', '') not in ('image', 'video', 'audio')
       or coalesce(m->>'bucket', 'dm-media') not in ('dm-media', 'post-media')
       or coalesce(m->>'path', '') not like p_sender::text || '/%' then
      raise exception 'That can''t be attached.';
    end if;
  end loop;
  if p_price is not null then
    if not p_as_actor or not exists (select 1 from profiles where id = p_sender and verified_at is not null) then
      raise exception 'Paid messages are for verified actors.';
    end if;
    if jsonb_array_length(coalesce(p_media, '[]'::jsonb)) = 0 then raise exception 'Add a photo or video to unlock.'; end if;
  end if;
  if p_ghost and not p_as_actor then raise exception 'Disappearing messages are for actors.'; end if;
end $$;

drop function if exists public.send_dm(uuid, text);
create or replace function public.send_dm(p_thread uuid, p_body text default '', p_media jsonb default '[]'::jsonb,
  p_price_cents int default null, p_ghost boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare t dm_threads; a profiles; new_id uuid;
begin
  select * into t from dm_threads where id = p_thread;
  if t.id is null or auth.uid() not in (t.fan_id, t.actor_id) then raise exception 'Conversation not found.'; end if;
  if exists (select 1 from blocks where (blocker_id = t.fan_id and blocked_id = t.actor_id) or (blocker_id = t.actor_id and blocked_id = t.fan_id)) then
    raise exception 'You can''t message this person.';
  end if;
  if auth.uid() = t.fan_id then
    select * into a from profiles where id = t.actor_id;
    if not a.dms_open then raise exception 'This actor isn''t taking messages right now.'; end if;
    if not public.can_message(t.fan_id, t.actor_id) then raise exception 'Your messages with this actor ended. Renew them on their Backstage to keep chatting.'; end if;
  end if;
  perform public.check_dm_payload(auth.uid(), p_media, p_price_cents, coalesce(p_ghost, false), auth.uid() = t.actor_id);
  insert into dm_messages (thread_id, sender_id, body, media, price_cents, ghost)
  values (p_thread, auth.uid(), left(coalesce(p_body, ''), 1000), coalesce(p_media, '[]'::jsonb), p_price_cents, coalesce(p_ghost, false))
  returning id into new_id;
  update dm_threads set last_message_at = now() where id = p_thread;
  return new_id;
end $$;

create or replace function public.dm_json(m dm_messages) returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (select
    m.sender_id <> auth.uid() and m.price_cents is not null and not public.has_unlocked(auth.uid(), 'dm', m.id) as locked,
    m.ghost and m.opened_at is not null and m.opened_at < now() - interval '60 seconds' as expired)
  select jsonb_build_object(
    'id', m.id, 'sender_id', m.sender_id, 'created_at', m.created_at, 'read_at', m.read_at,
    'body', case when v.expired then null else m.body end,
    'media', case when v.expired then '[]'::jsonb
                  when v.locked then (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('type', x->>'type', 'preview', x->>'preview',
                          'width', x->'width', 'height', x->'height', 'duration_ms', x->'duration_ms'))), '[]'::jsonb) from jsonb_array_elements(m.media) x)
                  else m.media end,
    'price_cents', m.price_cents, 'locked', v.locked, 'ghost', m.ghost, 'expired', v.expired, 'opened_at', m.opened_at,
    'mass', m.mass_id is not null,
    'sold', case when m.sender_id = auth.uid() and m.price_cents is not null then
              exists (select 1 from unlock_purchases u where u.kind = 'dm' and u.item_id = m.id and u.refunded_at is null) end)
  from v;
$$;

create or replace function public.list_dm_messages(p_thread uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from dm_threads where id = p_thread and auth.uid() in (fan_id, actor_id)) then raise exception 'Conversation not found.'; end if;
  update dm_messages set read_at = now() where thread_id = p_thread and sender_id <> auth.uid() and read_at is null;
  -- A disappearing message starts its minute the first time the other person can actually see it
  -- (for a paid one, once they've unlocked it).
  update dm_messages set opened_at = now() where thread_id = p_thread and ghost and sender_id <> auth.uid() and opened_at is null
    and (price_cents is null or public.has_unlocked(auth.uid(), 'dm', id));
  return coalesce((select jsonb_agg(public.dm_json(m) order by m.created_at)
    from (select * from dm_messages where thread_id = p_thread order by created_at desc limit 200) m), '[]'::jsonb);
end $$;

-- What a fan has spent on one actor: messages, unlocks, gifts and their Backstage share.
create or replace function public.fan_spend_cents(p_fan uuid, p_actor uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select (select coalesce(sum(gross_cents), 0) from actor_sub_payments where fan_id = p_fan and actor_id = p_actor)
       + (select coalesce(sum(gross_cents), 0) from unlock_purchases where buyer_id = p_fan and actor_id = p_actor and refunded_at is null)
       + (select coalesce(sum(amount_cents), 0) from gift_purchases where sender_id = p_fan and recipient_id = p_actor and refunded_at is null)
       + (select coalesce(sum(cents), 0) from pass_allocations where fan_id = p_fan and actor_id = p_actor);
$$;
revoke execute on function public.fan_spend_cents(uuid, uuid) from public, anon, authenticated;

create or replace function public.list_dm_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'last_message_at', t.last_message_at,
      'other', public.author_json(case when t.fan_id = auth.uid() then t.actor_id else t.fan_id end),
      'as_actor', t.actor_id = auth.uid(),
      'spent_cents', case when t.actor_id = auth.uid() then public.fan_spend_cents(t.fan_id, t.actor_id) end,
      'subscriber', case when t.actor_id = auth.uid() then public.has_messages_with(t.fan_id, t.actor_id) end,
      'last', (select case when m.ghost then 'Disappearing message'
                           when m.price_cents is not null and coalesce(m.body, '') = '' then 'Paid message'
                           when coalesce(m.body, '') <> '' then m.body
                           when m.media->0->>'type' = 'audio' then 'Voice message'
                           when m.media->0->>'type' = 'video' then 'Sent a video'
                           else 'Sent a photo' end
               from dm_messages m where m.thread_id = t.id order by m.created_at desc limit 1),
      'unread', (select count(*) from dm_messages m where m.thread_id = t.id and m.sender_id <> auth.uid() and m.read_at is null))
    order by t.last_message_at desc), '[]'::jsonb)
  from dm_threads t where auth.uid() in (t.fan_id, t.actor_id)
    and exists (select 1 from dm_messages m where m.thread_id = t.id);
$$;

-- Notifications never carry a disappearing message's words.
create or replace function public.trg_notify_dm() returns trigger
language plpgsql security definer set search_path = public as $$
declare t dm_threads;
begin
  select * into t from dm_threads where id = new.thread_id;
  perform public.notify(case when new.sender_id = t.fan_id then t.actor_id else t.fan_id end, new.sender_id, 'message',
    null, null, null, null, new.thread_id,
    case when new.ghost then 'Sent a disappearing message'
         when new.price_cents is not null then 'Sent you something to unlock'
         when new.body = '' then case when new.media->0->>'type' = 'audio' then 'Sent a voice message' else 'Sent a photo' end
         else new.body end);
  return new;
end $$;

-- Disappearing messages really disappear: a minute after they're opened, the words and media are wiped.
select cron.unschedule('cinara-ghost-dms') where exists (select 1 from cron.job where jobname = 'cinara-ghost-dms');
select cron.schedule('cinara-ghost-dms', '* * * * *',
  $$update public.dm_messages set body = '', media = '[]'::jsonb
    where ghost and opened_at < now() - interval '90 seconds' and (body <> '' or media <> '[]'::jsonb)$$);

-- ---------- Mass DMs ----------
create or replace function public.send_mass_dm(p_body text, p_media jsonb default '[]'::jsonb, p_price_cents int default null,
  p_ghost boolean default false, p_audience text default 'messages') returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); a profiles; mid uuid := gen_random_uuid(); n int := 0; f uuid; th uuid;
begin
  select * into a from profiles where id = me;
  if a.id is null or not a.is_cast or a.verified_at is null then raise exception 'Mass messages are for verified actors.'; end if;
  if p_audience not in ('messages', 'backstage', 'all') then raise exception 'Pick who gets it.'; end if;
  if (select count(distinct mass_id) from dm_messages where sender_id = me and mass_id is not null and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'You can send up to 3 mass messages a day.';
  end if;
  perform public.check_dm_payload(me, p_media, p_price_cents, coalesce(p_ghost, false), true);
  for f in
    select distinct fan from (
      select s.fan_id as fan from actor_subscriptions s
        where p_audience in ('messages', 'all') and s.actor_id = me and public.has_messages_with(s.fan_id, me)
      union
      select fo.follower_id from follows fo
        where p_audience in ('backstage', 'all') and fo.actor_id = me and public.has_pass(fo.follower_id)
    ) x
    where fan <> me
      and not exists (select 1 from blocks b where (b.blocker_id = me and b.blocked_id = fan) or (b.blocker_id = fan and b.blocked_id = me))
  loop
    insert into dm_threads (fan_id, actor_id, last_message_at) values (f, me, now())
      on conflict (fan_id, actor_id) do update set last_message_at = now() returning id into th;
    insert into dm_messages (thread_id, sender_id, body, media, price_cents, ghost, mass_id)
      values (th, me, left(coalesce(p_body, ''), 1000), coalesce(p_media, '[]'::jsonb), p_price_cents, coalesce(p_ghost, false), mid);
    n := n + 1;
  end loop;
  return n;
end $$;

-- How many fans a mass message would reach, for the composer.
create or replace function public.mass_dm_audience() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'messages', (select count(*) from actor_subscriptions s where s.actor_id = auth.uid() and s.fan_id <> auth.uid() and public.has_messages_with(s.fan_id, auth.uid())),
    'backstage', (select count(*) from follows fo where fo.actor_id = auth.uid() and fo.follower_id <> auth.uid() and public.has_pass(fo.follower_id)),
    'sent_today', (select count(distinct mass_id) from dm_messages where sender_id = auth.uid() and mass_id is not null and created_at > now() - interval '24 hours'));
$$;

-- ---------- Content vault ----------
create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  path text not null,
  type text not null check (type in ('image', 'video')),
  width int, height int, duration_ms int,
  preview text,
  folder text check (folder is null or length(folder) between 1 and 40),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (owner_id, path)
);
alter table public.vault_items enable row level security;
drop policy if exists "owners manage their vault" on public.vault_items;
create policy "owners manage their vault" on public.vault_items for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and path like (select auth.uid())::text || '/%');
grant select, insert, update, delete on public.vault_items to authenticated;

create or replace function public.vault_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', v.id, 'path', v.path, 'type', v.type, 'width', v.width, 'height', v.height, 'duration_ms', v.duration_ms,
      'preview', v.preview, 'folder', v.folder, 'tags', v.tags, 'created_at', v.created_at,
      'in_posts', (select count(*) from posts p where p.author_id = v.owner_id and p.media @> jsonb_build_array(jsonb_build_object('path', v.path))),
      'in_dms', (select count(*) from dm_messages m where m.sender_id = v.owner_id and m.media @> jsonb_build_array(jsonb_build_object('path', v.path))))
    order by v.created_at desc), '[]'::jsonb)
  from vault_items v where v.owner_id = auth.uid();
$$;

-- ---------- Cover photo and free trial ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-covers', 'profile-covers', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "upload own profile cover" on storage.objects;
create policy "upload own profile cover" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "replace own profile cover" on storage.objects;
create policy "replace own profile cover" on storage.objects for update to authenticated
  using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "delete own profile cover" on storage.objects;
create policy "delete own profile cover" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "read profile covers" on storage.objects;
create policy "read profile covers" on storage.objects for select to public using (bucket_id = 'profile-covers');

create or replace function public.set_profile_extras(p_cover_path text default null, p_clear_cover boolean default false, p_trial_days int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_cover_path is not null and p_cover_path not like auth.uid()::text || '/%' then raise exception 'That photo can''t be used.'; end if;
  if p_trial_days is not null and not exists (select 1 from profiles where id = auth.uid() and is_cast) then
    raise exception 'Free trials are for actors.';
  end if;
  update profiles set
    cover_path = case when p_clear_cover then null else coalesce(p_cover_path, cover_path) end,
    trial_days = coalesce(p_trial_days, trial_days)
  where id = auth.uid();
end $$;

create or replace function public.actor_profile(p_handle text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'handle', a.handle, 'display_name', a.display_name, 'bio', a.bio, 'avatar_url', a.avatar_url,
    'cover_path', a.cover_path,
    'is_cast', a.is_cast, 'verified', a.verified_at is not null,
    'subs_enabled', a.subs_enabled, 'sub_price_cents', a.sub_price_cents, 'dm_price_cents', a.sub_price_cents, 'dms_open', a.dms_open,
    'trial_days', case when a.trial_days > 0 and not exists (select 1 from actor_subscriptions s where s.fan_id = auth.uid() and s.actor_id = a.id)
                       then a.trial_days else 0 end,
    'followers', (select count(*) from follows f where f.actor_id = a.id),
    'posts', (select count(*) from posts p where p.author_id = a.id and not p.hidden),
    'premium_posts', (select count(*) from posts p where p.author_id = a.id and p.visibility = 'subscribers' and not p.hidden),
    'following', exists (select 1 from follows f where f.actor_id = a.id and f.follower_id = auth.uid()),
    'subscribed', public.is_subscribed(auth.uid(), a.id),
    'can_message', public.can_message(auth.uid(), a.id) and a.verified_at is not null,
    'relation', public.relation_to(a.id),
    'friends', (select count(*) from friendships f where a.id in (f.user_a, f.user_b)),
    'is_me', a.id = auth.uid(),
    'shows', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', s.id, 'title', s.title, 'role', d.role)), '[]'::jsonb)
              from talent_deals d join shows s on s.id = d.show_id where d.profile_id = a.id and s.published))
  from profiles a where a.handle = lower(p_handle) and a.banned_at is null
    and not exists (select 1 from blocks b where b.blocker_id = a.id and b.blocked_id = auth.uid());
$$;

-- ---------- Creator home: money, today's challenge ----------
create table if not exists public.creator_events (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('share')),
  created_at timestamptz not null default now()
);
create index if not exists creator_events_actor on public.creator_events (actor_id, created_at);
alter table public.creator_events enable row level security;

create or replace function public.log_creator_event(p_kind text) returns void
language sql security definer set search_path = public as $$
  insert into creator_events (actor_id, kind) select auth.uid(), p_kind where auth.uid() is not null;
$$;

create or replace function public.creator_home() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid(); a profiles;
  day0 timestamptz := (date_trunc('day', now() at time zone 'America/New_York')) at time zone 'America/New_York';
  unread int; posted boolean; massed boolean; paid boolean; shared boolean; dm_today bigint;
begin
  select * into a from profiles where id = me;
  if a.id is null or not a.is_cast then raise exception 'The studio is for actors.'; end if;
  unread := (select count(*) from dm_messages m join dm_threads t on t.id = m.thread_id
             where t.actor_id = me and m.sender_id <> me and m.read_at is null);
  posted := exists (select 1 from posts where author_id = me and created_at >= day0)
         or exists (select 1 from channel_messages where actor_id = me and created_at >= day0);
  massed := exists (select 1 from dm_messages where sender_id = me and mass_id is not null and created_at >= day0);
  paid := exists (select 1 from dm_messages where sender_id = me and price_cents is not null and created_at >= day0);
  shared := exists (select 1 from creator_events where actor_id = me and kind = 'share' and created_at >= day0);
  dm_today := (select coalesce(sum(actor_share_cents), 0) from unlock_purchases where actor_id = me and kind = 'dm' and refunded_at is null and created_at >= day0);
  return jsonb_build_object(
    'handle', a.handle, 'display_name', a.display_name, 'avatar_url', a.avatar_url, 'cover_path', a.cover_path,
    'verified', a.verified_at is not null, 'dms_open', a.dms_open, 'trial_days', a.trial_days,
    'lifetime_cents',
        (select coalesce(sum(cents), 0) from pass_allocations where actor_id = me)
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = me)
      + (select coalesce(sum(actor_share_cents), 0) from unlock_purchases where actor_id = me and refunded_at is null)
      + (select coalesce(sum(round((amount_cents - coalesce(card_fee_cents, 0)) * 0.9)), 0) from gift_purchases where recipient_id = me and refunded_at is null),
    'balance_cents',
        (select coalesce(sum(cents), 0) from pass_allocations where actor_id = me and paid_out_at is null)
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = me and paid_out_at is null)
      + (select coalesce(sum(actor_share_cents), 0) from unlock_purchases where actor_id = me and paid_out_at is null and refunded_at is null),
    'month_cents',
        (select coalesce(sum(s.cents), 0) from public.pass_shares(date_trunc('month', now())::date) s where s.actor_id = me)
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = me and month = date_trunc('month', now())::date)
      + (select coalesce(sum(actor_share_cents), 0) from unlock_purchases where actor_id = me and month = date_trunc('month', now())::date and refunded_at is null),
    'today_cents',
        (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = me and created_at >= day0)
      + (select coalesce(sum(actor_share_cents), 0) from unlock_purchases where actor_id = me and created_at >= day0 and refunded_at is null),
    'subscribers', (select count(*) from actor_subscriptions s where s.actor_id = me and public.has_messages_with(s.fan_id, me)),
    'followers', (select count(*) from follows where actor_id = me),
    'unread', unread,
    'tasks', jsonb_build_array(
      jsonb_build_object('key', 'post', 'done', posted, 'minutes', 1),
      jsonb_build_object('key', 'reply', 'done', unread = 0, 'count', unread, 'minutes', 5),
      jsonb_build_object('key', 'mass_dm', 'done', massed, 'minutes', 3),
      jsonb_build_object('key', 'paid_dm', 'done', paid, 'earned_cents', dm_today, 'minutes', 2),
      jsonb_build_object('key', 'promote', 'done', shared, 'minutes', 3)));
end $$;

-- ---------- Owner's money page: unlocks by month ----------
create or replace function public.admin_unlock_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.assert_admin();
  return coalesce((select jsonb_agg(x order by x->>'handle') from (
    select jsonb_build_object('actor_id', u.actor_id, 'handle', p.handle,
      'sales', count(*), 'gross_cents', sum(u.gross_cents), 'actor_cents', sum(u.actor_share_cents),
      'paid', bool_and(u.paid_out_at is not null)) x
    from unlock_purchases u join profiles p on p.id = u.actor_id
    where u.month = date_trunc('month', p_month)::date and u.refunded_at is null
    group by u.actor_id, p.handle) t), '[]'::jsonb);
end $$;

create or replace function public.admin_mark_unlock_payout(p_actor uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_admin();
  update unlock_purchases set paid_out_at = now()
  where actor_id = p_actor and month = date_trunc('month', p_month)::date and paid_out_at is null and refunded_at is null;
end $$;

-- ---------- Who can call what ----------
do $$
declare f text;
begin
  foreach f in array array[
    'has_unlocked(uuid,text,uuid)', 'react_post(uuid,text,boolean)', 'dm_unlocked(uuid)', 'can_view_dm_media(text)',
    'send_dm(uuid,text,jsonb,integer,boolean)', 'list_dm_messages(uuid)', 'list_dm_threads()', 'dm_json(dm_messages)',
    'send_mass_dm(text,jsonb,integer,boolean,text)', 'mass_dm_audience()', 'vault_list()',
    'set_profile_extras(text,boolean,integer)', 'log_creator_event(text)', 'creator_home()',
    'admin_unlock_month(date)', 'admin_mark_unlock_payout(uuid,date)', 'check_dm_payload(uuid,jsonb,integer,boolean,boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
