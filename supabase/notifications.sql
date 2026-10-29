-- Cinara notifications (Activity tab + push). Paste into Supabase > SQL Editor > New query > Run.
-- Safe to run more than once. Needs the tables made by the "notifications_core" migration (already applied).

-- ========== Triggers: one per kind of event ==========

create or replace function public.trg_notify_post_like() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify((select author_id from posts where id = new.post_id), new.user_id, 'post_like', new.post_id);
  return new;
end $$;
create or replace trigger notify_post_like after insert on public.post_likes for each row execute function public.trg_notify_post_like();

create or replace function public.trg_notify_post_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare post_author uuid; parent_author uuid;
begin
  select author_id into post_author from posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from post_comments where id = new.parent_id;
    perform public.notify(parent_author, new.author_id, 'comment_reply', new.post_id, new.id, null, null, null, new.body);
  end if;
  if post_author is distinct from parent_author then
    perform public.notify(post_author, new.author_id, 'post_comment', new.post_id, new.id, null, null, null, new.body);
  end if;
  perform public.notify_mentions(new.body, new.author_id, new.post_id, new.id, null, null);
  return new;
end $$;
create or replace trigger notify_post_comment after insert on public.post_comments for each row execute function public.trg_notify_post_comment();

create or replace function public.trg_notify_episode_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_id is not null then
    perform public.notify((select author_id from comments where id = new.parent_id), new.author_id, 'comment_reply',
      null, new.id, new.show_id, new.episode, null, new.body);
  end if;
  perform public.notify_mentions(new.body, new.author_id, null, new.id, new.show_id, new.episode);
  return new;
end $$;
create or replace trigger notify_episode_comment after insert on public.comments for each row execute function public.trg_notify_episode_comment();

create or replace function public.trg_notify_comment_like() returns trigger language plpgsql security definer set search_path = public as $$
declare c comments;
begin
  select * into c from comments where id = new.comment_id;
  perform public.notify(c.author_id, new.user_id, 'comment_like', null, c.id, c.show_id, c.episode, null, c.body);
  return new;
end $$;
create or replace trigger notify_comment_like after insert on public.comment_likes for each row execute function public.trg_notify_comment_like();

create or replace function public.trg_notify_follow() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify(new.actor_id, new.follower_id, 'follow');
  return new;
end $$;
create or replace trigger notify_follow after insert on public.follows for each row execute function public.trg_notify_follow();

create or replace function public.trg_notify_friend() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(new.to_id, new.from_id, 'friend_request');
  elsif tg_op = 'UPDATE' and new.status = 'pending' and old.status is distinct from 'pending' then
    perform public.notify(new.to_id, new.from_id, 'friend_request');
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform public.notify(new.from_id, new.to_id, 'friend_accept');
    update notifications set read_at = coalesce(read_at, now()), data = data || '{"handled": true}'
      where user_id = new.to_id and actor_id = new.from_id and kind = 'friend_request';
  end if;
  return new;
end $$;
create or replace trigger notify_friend after insert or update of status on public.friend_requests for each row execute function public.trg_notify_friend();

create or replace function public.trg_notify_actor_post() returns trigger language plpgsql security definer set search_path = public as $$
declare f record;
begin
  for f in select follower_id from follows where actor_id = new.author_id and notify_posts loop
    perform public.notify(f.follower_id, new.author_id, 'actor_post', new.id, null, new.show_id, null, null, new.body,
      jsonb_build_object('backstage', new.visibility = 'subscribers'));
  end loop;
  return new;
end $$;
create or replace trigger notify_actor_post after insert on public.posts for each row execute function public.trg_notify_actor_post();

create or replace function public.trg_notify_channel_post() returns trigger language plpgsql security definer set search_path = public as $$
declare f record;
begin
  for f in select follower_id from follows where actor_id = new.actor_id and public.has_pass(follower_id) loop
    perform public.notify(f.follower_id, new.actor_id, 'channel_post', null, null, null, null, null,
      case new.kind when 'poll' then 'New poll: ' || (new.poll->>'question') when 'photo' then coalesce(nullif(new.body, ''), 'Shared a photo') else new.body end);
  end loop;
  return new;
end $$;
create or replace trigger notify_channel_post after insert on public.channel_messages for each row execute function public.trg_notify_channel_post();

create or replace function public.trg_notify_dm() returns trigger language plpgsql security definer set search_path = public as $$
declare t dm_threads;
begin
  select * into t from dm_threads where id = new.thread_id;
  perform public.notify(case when new.sender_id = t.fan_id then t.actor_id else t.fan_id end, new.sender_id, 'message',
    null, null, null, null, new.thread_id, new.body);
  return new;
end $$;
create or replace trigger notify_dm after insert on public.dm_messages for each row execute function public.trg_notify_dm();

create or replace function public.notify_actor_live(p_actor uuid, p_show text, p_where text) returns void
language plpgsql security definer set search_path = public as $$
declare k text := 'live:' || p_actor || ':' || p_show || ':' || p_where || ':' || (extract(epoch from now())::bigint / 21600); f record;
begin
  if not exists (select 1 from profiles where id = p_actor and verified_at is not null) then return; end if;
  insert into notification_once (key) values (k) on conflict do nothing;
  if not found then return; end if;
  for f in select follower_id from follows where actor_id = p_actor loop
    perform public.notify(f.follower_id, p_actor, 'actor_live', null, null, p_show, null, null, null, jsonb_build_object('where', p_where));
  end loop;
end $$;
revoke execute on function public.notify_actor_live(uuid, text, text) from public, anon, authenticated;

create or replace function public.trg_notify_live_chat() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.author_is_cast then perform public.notify_actor_live(new.author_id, new.show_id, 'live'); end if;
  return new;
end $$;
create or replace trigger notify_live_chat after insert on public.chat_messages for each row execute function public.trg_notify_live_chat();

create or replace function public.trg_notify_room() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_actor_live(new.author_id, new.show_id, 'room');
  return new;
end $$;
create or replace trigger notify_room after insert on public.room_messages for each row execute function public.trg_notify_room();

create or replace function public.trg_notify_gift() returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct profile_id from talent_deals
           where show_id = new.show_id and (new.recipient_id is null or profile_id = new.recipient_id) loop
    perform public.notify(r.profile_id, new.sender_id, 'gift', null, null, new.show_id, null, null, null, jsonb_build_object('gift', new.gift_id));
  end loop;
  return new;
end $$;
create or replace trigger notify_gift after insert on public.gift_purchases for each row execute function public.trg_notify_gift();

-- ========== Premieres of shows with actors you follow ==========

-- Everyone who should hear about a show: its followers, plus followers of anyone in its cast.
create or replace function public.show_audience(p_show text) returns table (user_id uuid, actor_id uuid)
language sql stable security definer set search_path = public as $$
  select distinct on (u) u, a from (
    select f.user_id as u, null::uuid as a from show_follows f where f.show_id = p_show
    union all
    select fo.follower_id, d.profile_id from talent_deals d join follows fo on fo.actor_id = d.profile_id where d.show_id = p_show
  ) x order by u, a nulls last;
$$;
revoke execute on function public.show_audience(text) from public, anon, authenticated;

-- Runs every 5 minutes: "tonight at 8" (from noon ET), "starting in 15 minutes" (7:45 ET), and "live now".
create or replace function public.run_premiere_notifications() returns int
language plpgsql security definer set search_path = public as $$
declare
  now_et timestamp := now() at time zone 'America/New_York';
  today date := (now() at time zone 'America/New_York')::date;
  s record; a record; n int := 0; kind text; k text;
begin
  perform public.assert_server();
  for s in select * from shows sh
           where sh.published and sh.auto_release and sh.latest_episode < sh.episode_count
             and extract(dow from now_et)::int = any(sh.release_days)
             and (sh.last_drop_at is null or (sh.last_drop_at at time zone 'America/New_York')::date < today) loop
    kind := case when now_et::time >= time '19:45' and now_et::time < time '20:00' then 'show_soon'
                 when now_et::time >= time '12:00' and now_et::time < time '19:45' then 'show_upcoming' end;
    continue when kind is null;
    k := kind || ':' || s.id || ':' || today;
    insert into notification_once (key) values (k) on conflict do nothing;
    continue when not found;
    for a in select * from public.show_audience(s.id) loop
      perform public.notify(a.user_id, a.actor_id, kind, null, null, s.id, s.latest_episode + 1, null, null,
        jsonb_build_object('from', s.latest_episode + 1, 'to', least(s.latest_episode + 10, s.episode_count)));
      n := n + 1;
    end loop;
  end loop;
  for s in select p.show_id, p.episode, sh.episode_count from premieres p join shows sh on sh.id = p.show_id
           where p.is_live and p.starts_at > now() - interval '30 minutes' loop
    k := 'show_live:' || s.show_id || ':' || today;
    insert into notification_once (key) values (k) on conflict do nothing;
    continue when not found;
    for a in select * from public.show_audience(s.show_id) loop
      perform public.notify(a.user_id, a.actor_id, 'show_live', null, null, s.show_id, s.episode, null, null,
        jsonb_build_object('from', s.episode, 'to', least(s.episode + 9, s.episode_count)));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.run_premiere_notifications() from public, anon, authenticated;
select cron.schedule('cinara-premiere-notifications', '*/5 * * * *', 'select public.run_premiere_notifications()');

-- ========== What each notification says (in the app and on the lock screen) ==========

create or replace function public.notification_text(n notifications) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select coalesce(display_name, handle::text) as name, handle::text as handle from profiles where id = n.actor_id),
       sh as (select title from shows where id = n.show_id),
       p as (select '@' || coalesce((select handle::text from a), 'someone') as who)
  select case n.kind
    when 'post_like' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' liked your post.', 'url', '/post/' || n.post_id)
    when 'comment_like' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' liked your comment: ' || coalesce(n.snippet, ''), 'url', '/comments/' || n.show_id || '/' || n.episode)
    when 'post_comment' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' commented: ' || coalesce(n.snippet, ''), 'url', '/post/' || n.post_id)
    when 'comment_reply' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' replied: ' || coalesce(n.snippet, ''),
      'url', case when n.post_id is not null then '/post/' || n.post_id else '/comments/' || n.show_id || '/' || n.episode end)
    when 'mention' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' mentioned you: ' || coalesce(n.snippet, ''),
      'url', case when n.post_id is not null then '/post/' || n.post_id else '/comments/' || n.show_id || '/' || n.episode end)
    when 'follow' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' started following you.', 'url', '/actor/' || (select handle from a))
    when 'friend_request' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' wants to be friends.', 'url', '/friends')
    when 'friend_accept' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' accepted your friend request.', 'url', '/actor/' || (select handle from a))
    when 'actor_post' then jsonb_build_object('title', (select name from a),
      'body', case when (n.data->>'backstage')::boolean then 'New Backstage post' else coalesce(nullif(n.snippet, ''), 'Shared a new post') end, 'url', '/post/' || n.post_id)
    when 'channel_post' then jsonb_build_object('title', (select name from a) || ' · Backstage', 'body', coalesce(n.snippet, 'New message in their channel'), 'url', '/channel/' || (select handle from a))
    when 'actor_live' then jsonb_build_object('title', (select name from a),
      'body', case when n.data->>'where' = 'room' then 'is in the ' || coalesce((select title from sh), 'fan') || ' fan room right now.' else 'is in the live chat for ' || coalesce((select title from sh), 'the premiere') || '. Join them.' end,
      'url', case when n.data->>'where' = 'room' then '/room/' || n.show_id else '/live/' || n.show_id end)
    when 'show_upcoming' then jsonb_build_object('title', (select title from sh), 'body', 'Episodes ' || (n.data->>'from') || '–' || (n.data->>'to') || ' premiere tonight at 8/7c' ||
      coalesce(', starring @' || (select handle from a), '') || '.', 'url', '/show/' || n.show_id)
    when 'show_soon' then jsonb_build_object('title', (select title from sh), 'body', 'Starts in 15 minutes. The lobby is open.', 'url', '/live/' || n.show_id)
    when 'show_live' then jsonb_build_object('title', (select title from sh) || ' is live', 'body', 'Episodes ' || (n.data->>'from') || '–' || (n.data->>'to') || ' just dropped. Watch with the cast.', 'url', '/live/' || n.show_id)
    when 'message' then jsonb_build_object('title', coalesce((select name from a), 'New message'), 'body', coalesce(n.snippet, 'Sent you a message'), 'url', '/messages/' || n.thread_id)
    when 'gift' then jsonb_build_object('title', 'Cinara', 'body', (select who from p) || ' sent you a gift during ' || coalesce((select title from sh), 'the premiere') || '.', 'url', '/earnings')
    else jsonb_build_object('title', 'Cinara', 'body', coalesce(n.snippet, ''), 'url', '/social') end;
$$;
revoke execute on function public.notification_text(notifications) from public, anon, authenticated;

-- ========== Push to phones (Expo), in batches; likes on the same thing push at most once per 15 minutes ==========

create or replace function public.trg_push_notifications() returns trigger language plpgsql security definer set search_path = public as $$
declare batch jsonb;
begin
  for batch in
    select jsonb_agg(jsonb_build_object('to', x.token, 'title', x.t->>'title', 'body', x.t->>'body', 'sound', 'default',
                                        'data', jsonb_build_object('url', x.t->>'url')))
    from (
      select pt.token, public.notification_text(n) as t, row_number() over () as rn
      from fresh f join notifications n on n.id = f.id join push_tokens pt on pt.user_id = n.user_id
      where not (n.kind in ('post_like', 'comment_like') and exists (
        select 1 from notifications o where o.user_id = n.user_id and o.kind = n.kind and o.id <> n.id
          and o.post_id is not distinct from n.post_id and o.comment_id is not distinct from n.comment_id
          and o.created_at > now() - interval '15 minutes'))
    ) x
    group by (x.rn - 1) / 100
  loop
    perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := batch,
                          headers := '{"Content-Type":"application/json","Accept":"application/json"}'::jsonb);
  end loop;
  return null;
end $$;
create or replace trigger push_notifications after insert on public.notifications
  referencing new table as fresh for each statement execute function public.trg_push_notifications();

-- ========== For the app ==========

-- The Activity tab (messages live in the inbox instead). Newest first.
create or replace function public.list_notifications(p_before timestamptz default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id, 'kind', n.kind, 'created_at', n.created_at, 'read', n.read_at is not null,
      'actor', case when n.actor_id is null then null else public.author_json(n.actor_id) end,
      'post_id', n.post_id, 'comment_id', n.comment_id, 'show_id', n.show_id, 'episode', n.episode,
      'snippet', n.snippet, 'data', n.data, 'text', public.notification_text(n),
      'show_title', (select title from shows s where s.id = n.show_id),
      'show_cover', (select cover_url from shows s where s.id = n.show_id),
      'post_media', (select case when public.can_view_post(p.id) then p.media->0 else jsonb_build_object('preview', p.media->0->>'preview', 'locked', true) end
                     from posts p where p.id = n.post_id),
      'relation', case when n.kind = 'friend_request' then public.relation_to(n.actor_id) end,
      'following', case when n.kind = 'follow' then false end
    ) order by n.created_at desc), '[]'::jsonb)
  from notifications n
  join (select id from notifications where user_id = auth.uid() and kind <> 'message'
          and (p_before is null or created_at < p_before) order by created_at desc limit 80) pick on pick.id = n.id;
$$;

create or replace function public.unread_notification_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from notifications where user_id = auth.uid() and read_at is null and kind <> 'message';
$$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null and kind <> 'message';
$$;

create or replace function public.get_notification_prefs() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select prefs from notification_prefs where user_id = auth.uid()), '{}'::jsonb);
$$;

create or replace function public.set_notification_pref(p_key text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_key not in ('likes','comments','mentions','follows','friends','actor_posts','live','premieres','messages','gifts','pause_all') then
    raise exception 'Unknown setting';
  end if;
  insert into notification_prefs (user_id, prefs) values (auth.uid(), jsonb_build_object(p_key, p_on))
  on conflict (user_id) do update set prefs = notification_prefs.prefs || jsonb_build_object(p_key, p_on), updated_at = now();
end $$;

-- "Pause all" turns every kind off without forgetting each setting.
create or replace function public.notify_on(p_user uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select (prefs->>'pause_all')::boolean from notification_prefs where user_id = p_user), false)
     and coalesce((select (prefs->>p_key)::boolean from notification_prefs where user_id = p_user), true);
$$;

-- The bell on an actor's page: post notifications from them on or off.
create or replace function public.set_post_notifications(p_actor uuid, p_on boolean) returns void
language sql security definer set search_path = public as $$
  update follows set notify_posts = p_on where follower_id = auth.uid() and actor_id = p_actor;
$$;

-- Whether the bell on an actor's page is on (null when you don't follow them).
create or replace function public.get_post_notifications(p_actor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select notify_posts from follows where follower_id = auth.uid() and actor_id = p_actor;
$$;

do $$
declare f text;
begin
  foreach f in array array['list_notifications(timestamptz)','unread_notification_count()','mark_notifications_read()',
    'get_notification_prefs()','set_notification_pref(text,boolean)','set_post_notifications(uuid,boolean)','get_post_notifications(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ========================================================================
-- ANALYTICS: profile visits and post views, counted once per person per day.
-- ========================================================================

create table if not exists public.profile_visits (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  visitor_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  primary key (profile_id, visitor_id, day)
);
alter table public.profile_visits enable row level security;

create table if not exists public.post_impressions (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null,
  day date not null default (now() at time zone 'utc')::date,
  primary key (post_id, viewer_id, day)
);
create index if not exists post_impressions_author on public.post_impressions (author_id, day);
alter table public.post_impressions enable row level security;

create index if not exists follows_actor_created on public.follows (actor_id, created_at);

create or replace function public.record_profile_visit(p_profile uuid) returns void
language sql security definer set search_path = public as $$
  insert into profile_visits (profile_id, visitor_id) select p_profile, auth.uid()
  where auth.uid() is not null and auth.uid() <> p_profile on conflict do nothing;
$$;

create or replace function public.record_impressions(p_posts uuid[]) returns void
language sql security definer set search_path = public as $$
  insert into post_impressions (post_id, viewer_id, author_id)
  select p.id, auth.uid(), p.author_id from posts p
  where auth.uid() is not null and p.id = any(p_posts[1:50]) and p.author_id <> auth.uid()
  on conflict do nothing;
$$;

-- A creator's numbers for the last p_days days (and the same span before it, for the % change).
create or replace function public.creator_analytics(p_days int default 28) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); d int := least(greatest(p_days, 1), 90); since date := current_date - d; prev date := current_date - 2 * d;
begin
  if not exists (select 1 from profiles where id = me and is_cast) then raise exception 'Analytics are for creators.'; end if;
  return jsonb_build_object(
    'days', d,
    'followers', (select count(*) from follows where actor_id = me),
    'new_followers', (select count(*) from follows where actor_id = me and created_at >= since),
    'new_followers_prev', (select count(*) from follows where actor_id = me and created_at >= prev and created_at < since),
    'profile_visits', (select count(*) from profile_visits where profile_id = me and day >= since),
    'profile_visits_prev', (select count(*) from profile_visits where profile_id = me and day >= prev and day < since),
    'reached', (select count(distinct viewer_id) from post_impressions where author_id = me and day >= since),
    'reached_prev', (select count(distinct viewer_id) from post_impressions where author_id = me and day >= prev and day < since),
    'impressions', (select count(*) from post_impressions where author_id = me and day >= since),
    'likes', (select count(*) from post_likes l join posts p on p.id = l.post_id where p.author_id = me and l.created_at >= since),
    'likes_prev', (select count(*) from post_likes l join posts p on p.id = l.post_id where p.author_id = me and l.created_at >= prev and l.created_at < since),
    'comments', (select count(*) from post_comments c join posts p on p.id = c.post_id where p.author_id = me and c.created_at >= since and c.author_id <> me),
    'backstage_fans', (select count(distinct viewer_id) from post_views where actor_id = me and viewed_at >= since),
    'backstage_views', (select count(*) from post_views where actor_id = me and viewed_at >= since),
    'message_fans', (select count(*) from actor_subscriptions where actor_id = me and status = 'active'),
    'earned_cents', (select coalesce(sum(cents), 0) from pass_allocations where actor_id = me and month >= date_trunc('month', since)::date)
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = me and month >= date_trunc('month', since)::date),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day,
        'followers', (select count(*) from follows where actor_id = me and created_at::date = g.day),
        'reached', (select count(distinct viewer_id) from post_impressions where author_id = me and day = g.day),
        'visits', (select count(*) from profile_visits where profile_id = me and day = g.day)) order by g.day), '[]'::jsonb)
      from (select generate_series(since + 1, current_date, interval '1 day')::date as day) g),
    'top_posts', (select coalesce(jsonb_agg(x order by (x->>'reached')::int desc, (x->>'likes')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('id', p.id, 'body', p.body, 'media', p.media->0, 'visibility', p.visibility, 'created_at', p.created_at,
          'reached', (select count(distinct viewer_id) from post_impressions i where i.post_id = p.id),
          'likes', (select count(*) from post_likes l where l.post_id = p.id),
          'comments', (select count(*) from post_comments c where c.post_id = p.id and not c.hidden)) x
        from posts p where p.author_id = me and not p.hidden and p.created_at >= prev
        order by p.created_at desc limit 30) t)
  );
end $$;

-- Everyone's "Your activity": time watched and what you've done on Cinara.
create or replace function public.my_activity(p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'days', p_days,
    'watch_seconds', (select coalesce(sum(seconds), 0) from watch_daily where user_id = auth.uid() and day > current_date - p_days),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', g.day,
        'seconds', (select coalesce(sum(seconds), 0) from watch_daily w where w.user_id = auth.uid() and w.day = g.day)) order by g.day), '[]'::jsonb)
      from (select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as day) g),
    'top_shows', (select coalesce(jsonb_agg(x order by (x->>'seconds')::numeric desc), '[]'::jsonb) from (
        select jsonb_build_object('show_id', w.show_id, 'title', s.title, 'seconds', sum(w.seconds)) x
        from watch_daily w join shows s on s.id = w.show_id
        where w.user_id = auth.uid() and w.day > current_date - p_days group by w.show_id, s.title limit 5) t),
    'comments', (select count(*) from comments where author_id = auth.uid() and created_at > now() - make_interval(days => p_days))
      + (select count(*) from post_comments where author_id = auth.uid() and created_at > now() - make_interval(days => p_days)),
    'likes', (select count(*) from post_likes where user_id = auth.uid() and created_at > now() - make_interval(days => p_days)),
    'friends', (select count(*) from friendships where auth.uid() in (user_a, user_b)),
    'following', (select count(*) from follows where follower_id = auth.uid()));
$$;

do $$
declare f text;
begin
  foreach f in array array['record_profile_visit(uuid)','record_impressions(uuid[])','creator_analytics(integer)','my_activity(integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
