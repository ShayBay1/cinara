-- Snippets database schema for Supabase (Postgres).
-- Run in the Supabase SQL editor, or save as a migration with the Supabase CLI.
-- Every table has row-level security: the app's public key can only do what
-- these policies allow. Payments and moderation run in server functions that
-- use the service-role key, which never ships in the app.

create extension if not exists citext;

-- ---------- People ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle citext unique not null check (handle ~ '^[a-z0-9._]{3,24}$'),
  avatar_url text,                 -- approved photo (public URL)
  pending_avatar_path text,        -- uploaded, waiting for moderation
  is_cast boolean not null default false,
  share_activity boolean not null default true,
  birth_year int,                  -- used to confirm 18+ before gifting
  created_at timestamptz not null default now()
);

-- Create a profile automatically when someone signs up.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, handle)
  values (new.id, 'user' || substr(replace(new.id::text, '-', ''), 1, 8));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Catalog ----------

create table public.shows (
  id text primary key,
  number text not null,
  title text not null,
  genre text not null,
  tagline text not null,
  synopsis text,                         -- one or two sentences for the show page (falls back to tagline)
  color text not null default '#3A1420',
  cover_url text,                        -- cover art (public URL in the "covers" storage bucket)
  episode_count int not null,
  latest_episode int not null default 0,
  release_days int[] not null,           -- drop nights, 0 = Sunday; each releases the next 10 episodes at 8 PM Eastern
  "cast" jsonb not null default '[]',
  episode_titles text[] not null default '{}',
  published boolean not null default false
);

create table public.episodes (
  show_id text references public.shows (id) on delete cascade,
  number int not null,
  title text not null,
  mux_playback_id text not null,         -- signed playback of the square master (2160x2160, streamed 1920x1920)
  duration_sec int not null,
  reframe jsonb,                          -- per-shot framing: {"upright":[{t,x,y,z}],"sideways":[...]}; null = centered
  primary key (show_id, number)
);

create table public.coming_soon (
  id int primary key default 1 check (id = 1),
  title text,
  teaser text not null,
  starring text not null,
  arrives text not null
);

create table public.premieres (
  id bigint generated always as identity primary key,
  show_id text references public.shows (id) on delete cascade,
  episode int not null,
  starts_at timestamptz not null,
  is_live boolean not null default false
);

-- ---------- Money (written only by the Stripe webhook function) ----------

create table public.memberships (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'inactive',  -- active | past_due | canceled | inactive
  current_period_end timestamptz
);

create table public.gifts (
  id text primary key,
  name text not null,
  price_cents int not null check (price_cents > 0),
  color text not null,
  icon_path text not null
);

create table public.gift_purchases (
  id bigint generated always as identity primary key,
  stripe_payment_intent_id text unique not null,
  sender_id uuid references public.profiles (id),
  show_id text references public.shows (id),
  gift_id text references public.gifts (id),
  gift_to text not null,                  -- 'cast', or the cast member the viewer picked (their handle, else name)
  amount_cents int not null,
  created_at timestamptz not null default now()
);

-- ---------- Social ----------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  show_id text references public.shows (id) on delete cascade,
  episode int not null,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 400),
  at_sec int,
  hidden boolean not null default false,   -- set by moderators
  created_at timestamptz not null default now()
);
create index comments_episode_idx on public.comments (show_id, episode, created_at desc);

create table public.comment_likes (
  comment_id uuid references public.comments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  primary key (comment_id, user_id)
);

create table public.reports (
  id bigint generated always as identity primary key,
  comment_id uuid references public.comments (id) on delete cascade,
  chat_message_id uuid,
  reporter_id uuid not null references public.profiles (id),
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid references public.profiles (id) on delete cascade,
  blocked_id uuid references public.profiles (id) on delete cascade,
  primary key (blocker_id, blocked_id)
);

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles (id) on delete cascade,
  to_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  unique (from_id, to_id),
  check (from_id <> to_id)
);

-- One row per friendship, stored with the smaller id first.
create table public.friendships (
  user_a uuid references public.profiles (id) on delete cascade,
  user_b uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create table public.watch_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  show_id text references public.shows (id),
  episode int,
  watching_now boolean not null default false,
  caught_up boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  show_id text not null references public.shows (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  author_handle text not null,
  author_is_cast boolean not null default false,
  kind text not null default 'text' check (kind in ('text', 'gift')),
  body text check (char_length(body) <= 200),
  gift_id text references public.gifts (id),
  gift_to text,
  created_at timestamptz not null default now()
);
create index chat_show_idx on public.chat_messages (show_id, created_at desc);
alter publication supabase_realtime add table public.chat_messages;

-- ---------- Helpers ----------

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from public.friendships where user_a = least(a, b) and user_b = greatest(a, b));
$$;

-- ---------- Row-level security ----------

alter table public.profiles enable row level security;
alter table public.shows enable row level security;
alter table public.episodes enable row level security;
alter table public.coming_soon enable row level security;
alter table public.premieres enable row level security;
alter table public.memberships enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_purchases enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.watch_activity enable row level security;
alter table public.chat_messages enable row level security;

-- Public catalog (episodes stay private: playback URLs come from a server function).
create policy "catalog is public" on public.shows for select using (published);
create policy "coming soon is public" on public.coming_soon for select using (true);
create policy "premieres are public" on public.premieres for select using (true);
create policy "gifts are public" on public.gifts for select using (true);

-- Profiles: anyone signed in can see handles and approved photos; you edit only yours.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "edit own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- Column-level limits: others never see birth year or unreviewed photos, and
-- people can't make themselves "cast" or publish a photo that skipped moderation.
revoke select, update on public.profiles from anon, authenticated;
grant select (id, handle, avatar_url, is_cast, share_activity, created_at) on public.profiles to authenticated;
grant update (handle, pending_avatar_path, share_activity, birth_year) on public.profiles to authenticated;

-- Membership: you can read your own status; only the webhook (service role) writes it.
create policy "read own membership" on public.memberships for select to authenticated using (user_id = auth.uid());

-- Comments: visible unless hidden or from someone you blocked; you post and delete your own.
create policy "read comments" on public.comments for select to authenticated
  using (not hidden and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = author_id));
create policy "post comments" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "delete own comments" on public.comments for delete to authenticated using (author_id = auth.uid());

create policy "read likes" on public.comment_likes for select to authenticated using (true);
create policy "like as yourself" on public.comment_likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike as yourself" on public.comment_likes for delete to authenticated using (user_id = auth.uid());

create policy "file reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "manage own blocks" on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "see own requests" on public.friend_requests for select to authenticated using (auth.uid() in (from_id, to_id));
create policy "see own friendships" on public.friendships for select to authenticated using (auth.uid() in (user_a, user_b));

-- Watch activity: you write yours; friends can read it only if you share activity.
create policy "write own activity" on public.watch_activity for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "friends read activity" on public.watch_activity for select to authenticated
  using (user_id = auth.uid() or (public.are_friends(auth.uid(), user_id)
         and exists (select 1 from public.profiles p where p.id = user_id and p.share_activity)));

-- Chat: anyone signed in reads; sending goes through send_chat() so handles can't be faked.
create policy "read chat" on public.chat_messages for select to authenticated using (true);

-- ---------- Functions the app calls ----------

create function public.list_comments(p_show_id text, p_episode int, p_sort text)
returns table (id uuid, author jsonb, body text, at_sec int, likes bigint, liked_by_me boolean, is_friend boolean, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select c.id,
         jsonb_build_object('id', p.id, 'handle', p.handle, 'avatar_url', p.avatar_url, 'is_cast', p.is_cast),
         c.body, c.at_sec,
         (select count(*) from public.comment_likes l where l.comment_id = c.id),
         exists (select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = auth.uid()),
         public.are_friends(auth.uid(), c.author_id),
         c.created_at
  from public.comments c join public.profiles p on p.id = c.author_id
  where c.show_id = p_show_id and c.episode = p_episode
    and (p_sort <> 'friends' or public.are_friends(auth.uid(), c.author_id) or c.author_id = auth.uid())
  order by case when p_sort = 'top' then (select count(*) from public.comment_likes l where l.comment_id = c.id) end desc nulls last,
           c.created_at desc
  limit 200;
$$;

create function public.list_friends()
returns table (id uuid, handle citext, avatar_url text, watching_show_id text, watching_episode int, watching_now boolean, caught_up boolean)
language sql stable security invoker set search_path = public as $$
  select p.id, p.handle, p.avatar_url, w.show_id, w.episode, coalesce(w.watching_now, false), coalesce(w.caught_up, false)
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  left join public.watch_activity w on w.user_id = p.id
  where auth.uid() in (f.user_a, f.user_b)
  order by w.watching_now desc nulls last, p.handle;
$$;

create function public.list_friend_requests()
returns table (id uuid, "from" jsonb, note text)
language sql stable security invoker set search_path = public as $$
  select r.id, jsonb_build_object('id', p.id, 'handle', p.handle, 'avatar_url', p.avatar_url), ''
  from public.friend_requests r join public.profiles p on p.id = r.from_id
  where r.to_id = auth.uid() and r.status = 'pending'
  order by r.created_at desc;
$$;

create function public.send_friend_request(p_handle text) returns void
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  select id into target from public.profiles where handle = p_handle;
  if target is null then raise exception 'No one has the username %', p_handle; end if;
  if target = auth.uid() then raise exception 'That''s you.'; end if;
  if exists (select 1 from public.blocks where blocker_id = target and blocked_id = auth.uid()) then return; end if;
  insert into public.friend_requests (from_id, to_id) values (auth.uid(), target)
  on conflict (from_id, to_id) do update set status = 'pending', created_at = now() where public.friend_requests.status = 'declined';
end $$;

create function public.respond_friend_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r public.friend_requests;
begin
  select * into r from public.friend_requests where id = p_request_id and to_id = auth.uid() and status = 'pending';
  if r.id is null then raise exception 'Request not found'; end if;
  if p_accept then
    insert into public.friendships (user_a, user_b) values (least(r.from_id, r.to_id), greatest(r.from_id, r.to_id)) on conflict do nothing;
  end if;
  update public.friend_requests set status = case when p_accept then 'accepted' else 'declined' end where id = r.id;
end $$;

create function public.send_chat(p_show_id text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Sign in to chat'; end if;
  -- Slow mode: one message every 3 seconds per person.
  if exists (select 1 from public.chat_messages where author_id = me.id and created_at > now() - interval '3 seconds') then
    raise exception 'Slow mode is on. Try again in a few seconds.';
  end if;
  insert into public.chat_messages (show_id, author_id, author_handle, author_is_cast, kind, body)
  values (p_show_id, me.id, me.handle, me.is_cast, 'text', left(trim(p_body), 200));
end $$;

-- Only signed-in people can call the app's write functions; the sign-up trigger is internal.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.send_chat(text, text) from public, anon;
revoke execute on function public.send_friend_request(text) from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean) from public, anon;
grant execute on function public.send_chat(text, text) to authenticated;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

-- ---------- Storage: profile photos ----------

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
-- Show covers: public to read; uploaded from the Supabase dashboard (Storage > covers).
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict do nothing;

create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "read avatars" on storage.objects for select using (bucket_id = 'avatars');

-- ---------------------------------------------------------------------------
-- Upgrading a database created before the mobile/turn update? Run these once:
--   alter table public.shows add column if not exists synopsis text;
--   alter table public.episodes add column if not exists reframe jsonb;
--   alter table public.coming_soon add column if not exists title text;
--   alter table public.shows add column if not exists cover_url text;
--   alter table public.friend_requests add column if not exists status text not null default 'pending';
-- ---------------------------------------------------------------------------
