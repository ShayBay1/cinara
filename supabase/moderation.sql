-- Cinara moderation: bans, hidden chat, report status, blocked words, block/unblock,
-- friends-only live chat (plus your own and the cast's messages).
-- Run once in Supabase > SQL Editor. Safe to re-run.
alter table public.profiles add column if not exists banned_at timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.chat_messages add column if not exists hidden boolean not null default false;
alter table public.reports add column if not exists reported_user_id uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists status text not null default 'open' check (status in ('open','resolved','dismissed'));
alter table public.reports add column if not exists resolved_at timestamptz;

revoke update (banned_at, ban_reason) on public.profiles from authenticated, anon;

create table if not exists public.blocked_words (
  word text primary key check (word = lower(word) and length(word) between 2 and 40)
);
alter table public.blocked_words enable row level security;
drop policy if exists "admins manage blocked words" on public.blocked_words;
create policy "admins manage blocked words" on public.blocked_words for all using (public.is_admin()) with check (public.is_admin());
insert into public.blocked_words (word) values
  ('fuck'),('fucking'),('motherfucker'),('shit'),('bitch'),('cunt'),('whore'),('slut'),('dick'),('pussy'),('asshole'),('bastard'),('retard'),('kys')
on conflict do nothing;

create or replace function public.text_is_clean(p_text text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.blocked_words w
    where lower(coalesce(p_text,'')) ~ ('(^|[^a-z])' || w.word || '([^a-z]|$)')
  );
$$;
revoke execute on function public.text_is_clean(text) from anon;

create or replace function public.assert_can_post() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and banned_at is not null) then
    raise exception 'Your account can''t post right now. Contact support@cinaratv.com if you think this is a mistake.';
  end if;
end $$;

create or replace function public.send_chat(p_show_id text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me public.profiles; b text := left(trim(coalesce(p_body,'')), 200);
begin
  perform public.assert_can_post();
  select * into me from public.profiles where id = auth.uid();
  if b = '' then raise exception 'Type a message first.'; end if;
  if not public.text_is_clean(b) then raise exception 'That message breaks our chat rules. Keep it kind.'; end if;
  if exists (select 1 from public.chat_messages where author_id = me.id and created_at > now() - interval '3 seconds') then
    raise exception 'Slow mode is on. Try again in a few seconds.';
  end if;
  insert into public.chat_messages (show_id, author_id, author_handle, author_is_cast, kind, body)
  values (p_show_id, me.id, me.handle, me.is_cast, 'text', b);
end $$;

create or replace function public.check_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_can_post();
  new.body := left(trim(coalesce(new.body,'')), 500);
  if new.body = '' then raise exception 'Write something first.'; end if;
  if not public.text_is_clean(new.body) then raise exception 'That comment breaks our community rules. Keep it kind.'; end if;
  return new;
end $$;
drop trigger if exists check_comment on public.comments;
create trigger check_comment before insert on public.comments for each row execute function public.check_comment();

drop policy if exists "read chat" on public.chat_messages;
create policy "read chat" on public.chat_messages for select using (
  not hidden
  and not exists (select 1 from public.blocks b where b.blocker_id = (select auth.uid()) and b.blocked_id = chat_messages.author_id)
  and (
    author_id = (select auth.uid())
    or author_is_cast
    or public.are_friends((select auth.uid()), author_id)
  )
);

create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if p_user = auth.uid() then raise exception 'You can''t block yourself.'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_user) on conflict do nothing;
  delete from public.friendships where (user_a = auth.uid() and user_b = p_user) or (user_a = p_user and user_b = auth.uid());
  delete from public.friend_requests where (from_id = auth.uid() and to_id = p_user) or (from_id = p_user and to_id = auth.uid());
end $$;

create or replace function public.unblock_user(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = p_user;
$$;

create or replace function public.my_blocks() returns table(id uuid, handle text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.handle::text, p.avatar_url from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid() order by p.handle;
$$;

create or replace function public.admin_hide_chat(p_message uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin perform assert_admin(); update chat_messages set hidden = p_hidden where id = p_message; end $$;

create or replace function public.admin_ban(p_profile uuid, p_banned boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if p_profile = auth.uid() then raise exception 'You can''t ban yourself.'; end if;
  update profiles set banned_at = case when p_banned then now() else null end,
                      ban_reason = case when p_banned then p_reason else null end
  where id = p_profile;
  if p_banned then
    update comments set hidden = true where author_id = p_profile;
    update chat_messages set hidden = true where author_id = p_profile;
  end if;
end $$;

create or replace function public.admin_resolve_report(p_report bigint, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if p_status not in ('open','resolved','dismissed') then raise exception 'Bad status'; end if;
  update reports set status = p_status, resolved_at = case when p_status = 'open' then null else now() end where id = p_report;
end $$;

create or replace function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'created_at', r.created_at, 'status', r.status,
      'reporter', rp.handle,
      'kind', case when r.comment_id is not null then 'comment' when r.chat_message_id is not null then 'chat' else 'user' end,
      'comment_id', c.id, 'chat_message_id', cm.id,
      'body', coalesce(c.body, cm.body),
      'hidden', coalesce(c.hidden, cm.hidden),
      'author_id', coalesce(c.author_id, cm.author_id, r.reported_user_id),
      'author', coalesce(ca.handle::text, cm.author_handle, ru.handle::text),
      'author_banned', coalesce(ca.banned_at, cma.banned_at, ru.banned_at) is not null,
      'show_id', coalesce(c.show_id, cm.show_id)
    ) order by (r.status = 'open') desc, r.created_at desc)
    from (select * from reports order by created_at desc limit 300) r
    left join profiles rp on rp.id = r.reporter_id
    left join comments c on c.id = r.comment_id
    left join profiles ca on ca.id = c.author_id
    left join chat_messages cm on cm.id = r.chat_message_id
    left join profiles cma on cma.id = cm.author_id
    left join profiles ru on ru.id = r.reported_user_id), '[]'::jsonb);
end $$;

revoke execute on function public.admin_hide_chat(uuid, boolean), public.admin_ban(uuid, boolean, text), public.admin_resolve_report(bigint, text) from anon;
revoke execute on function public.block_user(uuid), public.unblock_user(uuid), public.my_blocks() from anon;
