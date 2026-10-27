-- ===========================================================================
-- Admin: the /admin pages on the Cinara website. Only profiles with is_admin can
-- use any of this; the checks live here in the database, not in the page.
-- is_admin can't be changed from the app (it's not in the profile update grant).
-- Applied to the Supabase project as migration "admin_access".
-- ===========================================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_admin from profiles p where p.id = auth.uid()), false);
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Catalog and releases: admins can read and change everything (including unpublished shows).
create policy "admins manage shows" on public.shows for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage episodes" on public.episodes for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage premieres" on public.premieres for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage coming soon" on public.coming_soon for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage gifts" on public.gifts for all to authenticated using (is_admin()) with check (is_admin());
create policy "admins manage deals" on public.talent_deals for all to authenticated using (is_admin()) with check (is_admin());

-- Money and community: admins can read.
create policy "admins read memberships" on public.memberships for select to authenticated using (is_admin());
create policy "admins read gift purchases" on public.gift_purchases for select to authenticated using (is_admin());
create policy "admins read revenue" on public.revenue_ledger for select to authenticated using (is_admin());
create policy "admins read reports" on public.reports for select to authenticated using (is_admin());

-- Cover art: admins upload to the public "covers" bucket.
create policy "admins manage covers" on storage.objects for all to authenticated
  using (bucket_id = 'covers' and public.is_admin()) with check (bucket_id = 'covers' and public.is_admin());

-- The one place a non-admin call stops.
create function public.assert_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
end $$;

-- Overview numbers for the dashboard.
create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_next date := (date_trunc('month', now() at time zone 'utc') + interval '1 month')::date;
  v_first date;
begin
  perform assert_admin();
  v_first := least(coalesce((select min(service_month) from revenue_ledger), v_month), v_month);
  return jsonb_build_object(
    'members_active', (select count(*) from memberships where status = 'active'),
    'accounts', (select count(*) from profiles),
    'revenue_month_gross_cents', coalesce((select sum(gross_cents) from revenue_ledger where service_month = v_month), 0),
    'revenue_month_net_cents', coalesce((select sum(net_cents) from revenue_ledger where service_month = v_month), 0),
    'gifts_month_cents', coalesce((select sum(amount_cents) from gift_purchases
                                    where created_at >= v_month and refunded_at is null), 0),
    'minutes_today', coalesce((select floor(sum(seconds) / 60) from watch_daily where day = v_today), 0),
    'minutes_7d', coalesce((select floor(sum(seconds) / 60) from watch_daily where day > v_today - 7), 0),
    'viewers_7d', (select count(distinct user_id) from watch_daily where day > v_today - 7),
    'reports_30d', (select count(*) from reports where created_at > now() - interval '30 days'),
    'daily_minutes', coalesce((
      select jsonb_agg(jsonb_build_object('day', d::date, 'minutes',
               coalesce((select floor(sum(w.seconds) / 60) from watch_daily w where w.day = d::date), 0)) order by d)
        from generate_series(v_today - 29, v_today, interval '1 day') d), '[]'::jsonb),
    'shows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'number', s.number, 'title', s.title, 'published', s.published, 'featured', s.featured,
               'latest_episode', s.latest_episode, 'episode_count', s.episode_count,
               'episodes_uploaded', (select count(*) from episodes e where e.show_id = s.id),
               'minutes_month', coalesce((select floor(sum(w.seconds) / 60) from watch_daily w
                                            where w.show_id = s.id and w.day >= v_month), 0),
               'viewers_month', (select count(distinct w.user_id) from watch_daily w where w.show_id = s.id and w.day >= v_month),
               'budget_cents', s.production_budget_cents,
               'earned_cents', coalesce((select sum(a.cents) from allocations(v_first, v_next) a where a.show_id = s.id), 0),
               'cast_deals', (select count(*) from talent_deals t where t.show_id = s.id)
             ) order by s.number)
        from shows s), '[]'::jsonb)
  );
end $$;

-- A quarter's money: each show's pool, every role's share, and each actor's statement (live until closed).
create function public.admin_quarter(p_quarter text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_closed boolean := exists (select 1 from quarter_closes where quarter = p_quarter);
begin
  perform assert_admin();
  return jsonb_build_object(
    'quarter', p_quarter,
    'closed', v_closed,
    'pools', coalesce((select jsonb_agg(jsonb_build_object(
        'show_id', p.show_id, 'title', s.title, 'revenue_cents', p.revenue_cents,
        'earned_before_cents', p.earned_before_cents, 'budget_cents', p.budget_cents,
        'carry_in_cents', p.carry_in_cents, 'pool_cents', p.pool_cents, 'members', p.members,
        'minutes', floor(p.seconds_watched / 60)) order by s.number)
      from compute_show_pools(p_quarter) p join shows s on s.id = p.show_id), '[]'::jsonb),
    'statements', coalesce((select jsonb_agg(x order by x->>'handle') from (
        select jsonb_build_object(
          'profile_id', pr.id, 'handle', pr.handle, 'email', u.email,
          'status', coalesce(st.status, case when v_closed then 'due' else 'open' end),
          'paid_on', st.paid_on,
          'shows_cents', coalesce(st.shows_cents, (select sum(l.share_cents) from compute_quarter(p_quarter) l where l.profile_id = pr.id), 0),
          'gifts_cents', coalesce(st.gift_share_cents, (select g.share_cents from compute_quarter_gifts(p_quarter) g where g.profile_id = pr.id), 0),
          'lines', coalesce((select jsonb_agg(jsonb_build_object('show', s.title, 'role', l.role, 'points', l.points,
                                                                 'total_points', l.total_points, 'share_cents', l.share_cents))
                               from compute_quarter(p_quarter) l join shows s on s.id = l.show_id
                              where l.profile_id = pr.id and not v_closed), '[]'::jsonb)
                   || coalesce((select jsonb_agg(jsonb_build_object('show', s.title, 'role', l.role, 'points', l.points,
                                                                    'total_points', l.total_points, 'share_cents', l.share_cents))
                                  from share_lines l join shows s on s.id = l.show_id
                                 where l.profile_id = pr.id and l.quarter = p_quarter and v_closed), '[]'::jsonb)
        ) as x
        from profiles pr
        join auth.users u on u.id = pr.id
        left join share_statements st on st.profile_id = pr.id and st.quarter = p_quarter
       where exists (select 1 from talent_deals t where t.profile_id = pr.id)
          or st.profile_id is not null
      ) q), '[]'::jsonb)
  );
end $$;

create function public.admin_mark_paid(p_profile uuid, p_quarter text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  if not exists (select 1 from share_statements where profile_id = p_profile and quarter = p_quarter) then
    raise exception 'That statement isn''t closed yet.';
  end if;
  perform mark_statement_paid(p_profile, p_quarter, now());
end $$;

create function public.admin_close_quarter(p_quarter text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  perform close_quarter(p_quarter);
end $$;

-- People: search accounts by handle or email; mark cast.
create function public.admin_people(p_query text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'handle', p.handle, 'email', u.email,
                                                       'is_cast', p.is_cast, 'is_admin', p.is_admin,
                                                       'member', exists (select 1 from memberships m where m.user_id = p.id and m.status = 'active'),
                                                       'created_at', p.created_at) order by p.created_at desc)
    from (select * from profiles p
           where coalesce(p_query, '') = ''
              or p.handle ilike '%' || p_query || '%'
              or exists (select 1 from auth.users u2 where u2.id = p.id and u2.email ilike '%' || p_query || '%')
           order by p.created_at desc limit 50) p
    join auth.users u on u.id = p.id), '[]'::jsonb);
end $$;

create function public.admin_set_cast(p_profile uuid, p_is_cast boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  update profiles set is_cast = p_is_cast where id = p_profile;
end $$;

-- Community: recent reports with what was reported.
create function public.admin_reports() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'created_at', r.created_at,
      'reporter', rp.handle,
      'comment_id', c.id, 'body', coalesce(c.body, cm.body), 'hidden', c.hidden,
      'author', coalesce(ca.handle, cm.author_handle), 'show_id', coalesce(c.show_id, cm.show_id)
    ) order by r.created_at desc)
    from (select * from reports order by created_at desc limit 200) r
    left join profiles rp on rp.id = r.reporter_id
    left join comments c on c.id = r.comment_id
    left join profiles ca on ca.id = c.author_id
    left join chat_messages cm on cm.id = r.chat_message_id), '[]'::jsonb);
end $$;

create function public.admin_hide_comment(p_comment uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  update comments set hidden = p_hidden where id = p_comment;
end $$;

revoke all on function public.assert_admin() from public, anon;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_quarter(text) from public, anon;
revoke all on function public.admin_mark_paid(uuid, text) from public, anon;
revoke all on function public.admin_close_quarter(text) from public, anon;
revoke all on function public.admin_people(text) from public, anon;
revoke all on function public.admin_set_cast(uuid, boolean) from public, anon;
revoke all on function public.admin_reports() from public, anon;
revoke all on function public.admin_hide_comment(uuid, boolean) from public, anon;
grant execute on function public.assert_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_quarter(text) to authenticated;
grant execute on function public.admin_mark_paid(uuid, text) to authenticated;
grant execute on function public.admin_close_quarter(text) to authenticated;
grant execute on function public.admin_people(text) to authenticated;
grant execute on function public.admin_set_cast(uuid, boolean) to authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_hide_comment(uuid, boolean) to authenticated;

-- The owner's account is the first admin. To add another: update profiles set is_admin = true where id = '<their id>';
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = 'pacificconnect310@gmail.com');
