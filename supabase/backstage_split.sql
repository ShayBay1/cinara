-- Backstage payout split. Paste into Supabase > SQL Editor and Run (safe to run more than once).

-- How a month of Backstage money splits between actors. Each fan's money follows that fan:
--  * 80% of what's left after card fees and tax goes to actors (Cinara keeps 20%).
--  * The $4.99 part is split by the premium posts that fan opened that month (unique views).
--  * On Backstage + Messages, the extra $15 is split by how many messages each actor sent that fan.
--    No replies: it follows their views instead.
--  * A fan who opened nothing that month is split like everyone else's views combined.
create or replace function public.pass_shares(p_month date)
returns table (actor_id uuid, fan_id uuid, cents int, basis text)
language sql stable security definer set search_path = public as $$
  with pay as (
    select user_id as fan,
      sum(case when tier = 'creators' then gross_cents - fee_cents - tax_cents
               else round((gross_cents - fee_cents - tax_cents) * 499.0 / 1999) end) as base,
      sum(case when tier = 'creators_dm' then (gross_cents - fee_cents - tax_cents) - round((gross_cents - fee_cents - tax_cents) * 499.0 / 1999)
               else 0 end) as dm
    from pass_payments where month = p_month and user_id is not null group by 1
  ),
  views as (select viewer_id as fan, v.actor_id, count(*)::numeric as n from post_views v where month = p_month group by 1, 2),
  vt as (select fan, sum(n) as t from views group by 1),
  global as (select g.actor_id, sum(g.n) / nullif(sum(sum(g.n)) over (), 0) as w from views g group by 1),
  replies as (
    select t.fan_id as fan, t.actor_id, count(*)::numeric as n
    from dm_messages m join dm_threads t on t.id = m.thread_id
    where m.sender_id = t.actor_id and m.created_at >= p_month and m.created_at < (p_month + interval '1 month')
    group by 1, 2
  ),
  rt as (select fan, sum(n) as t from replies group by 1),
  parts as (
    select v.actor_id, p.fan, p.base * 0.8 * v.n / vt.t as amt, 'views' as basis
      from pay p join views v on v.fan = p.fan join vt on vt.fan = p.fan
    union all
    select g.actor_id, p.fan, p.base * 0.8 * g.w, 'pooled'
      from pay p cross join global g where not exists (select 1 from vt where vt.fan = p.fan)
    union all
    select r.actor_id, p.fan, p.dm * 0.8 * r.n / rt.t, 'messages'
      from pay p join replies r on r.fan = p.fan join rt on rt.fan = p.fan where p.dm <> 0
    union all
    select v.actor_id, p.fan, p.dm * 0.8 * v.n / vt.t, 'views'
      from pay p join views v on v.fan = p.fan join vt on vt.fan = p.fan
      where p.dm <> 0 and not exists (select 1 from rt where rt.fan = p.fan)
    union all
    select g.actor_id, p.fan, p.dm * 0.8 * g.w, 'pooled'
      from pay p cross join global g
      where p.dm <> 0 and not exists (select 1 from rt where rt.fan = p.fan) and not exists (select 1 from vt where vt.fan = p.fan)
  )
  select x.actor_id, x.fan, floor(sum(x.amt))::int, x.basis from parts x where x.amt is not null group by 1, 2, 4;
$$;
revoke execute on function public.pass_shares(date) from public, anon, authenticated;

-- Locks a finished month's split so it can be paid. Re-running is safe until something is paid.
create or replace function public.finalize_pass_month(p_month date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_month >= date_trunc('month', now())::date then raise exception 'That month isn''t over yet.'; end if;
  if exists (select 1 from pass_allocations where month = p_month and paid_out_at is not null) then
    raise exception 'Part of that month is already paid out.';
  end if;
  delete from pass_allocations where month = p_month;
  insert into pass_allocations (month, actor_id, fan_id, cents, basis)
  select p_month, s.actor_id, s.fan_id, s.cents, s.basis from public.pass_shares(p_month) s where s.cents <> 0;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.finalize_pass_month(date) from public, anon, authenticated;

create or replace function public.admin_finalize_pass_month(p_month date) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  return public.finalize_pass_month(p_month);
end $$;

-- Runs on the 3rd (refunds and late fees settle first).
create or replace function public.finalize_pass_month_job() returns int
language plpgsql security definer set search_path = public as $$
declare m date := (date_trunc('month', now()) - interval '1 month')::date;
begin
  perform public.assert_server();
  if exists (select 1 from pass_allocations where month = m) then return 0; end if;
  return public.finalize_pass_month(m);
end $$;

-- Admin: one month at a glance (live estimate for the current month).
create or replace function public.admin_pass_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare fin boolean;
begin
  perform assert_admin();
  fin := exists (select 1 from pass_allocations where month = p_month);
  return jsonb_build_object(
    'month', p_month, 'finalized', fin,
    'passes', (select count(*) from creator_passes where status = 'active'),
    'dm_passes', (select count(*) from creator_passes where status = 'active' and tier = 'creators_dm'),
    'gross_cents', (select coalesce(sum(gross_cents), 0) from pass_payments where month = p_month),
    'net_cents', (select coalesce(sum(gross_cents - fee_cents - tax_cents), 0) from pass_payments where month = p_month),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('actor_id', r.actor_id, 'handle', a.handle, 'cents', r.cents, 'fans', r.fans,
        'views', (select count(*) from post_views v where v.actor_id = r.actor_id and v.month = p_month),
        'unpaid_cents', r.unpaid) order by r.cents desc)
      from (
        select actor_id, sum(cents)::int as cents, count(distinct fan_id) as fans,
          sum(cents) filter (where not paid)::int as unpaid
        from (
          select actor_id, fan_id, cents, paid_out_at is not null as paid from pass_allocations where fin and month = p_month
          union all
          select actor_id, fan_id, cents, false from public.pass_shares(p_month) where not fin
        ) z group by actor_id
      ) r left join profiles a on a.id = r.actor_id), '[]'::jsonb));
end $$;

create or replace function public.admin_mark_sub_payout(p_actor uuid, p_month date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_admin();
  update actor_sub_payments set paid_out_at = now() where actor_id = p_actor and month = p_month and paid_out_at is null;
  update pass_allocations set paid_out_at = now() where actor_id = p_actor and month = p_month and paid_out_at is null;
end $$;

create or replace function public.my_creator_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'followers', (select count(*) from follows where actor_id = auth.uid()),
    'subscribers', (select count(distinct viewer_id) from post_views where actor_id = auth.uid() and month = date_trunc('month', now())::date),
    'views', (select count(*) from post_views where actor_id = auth.uid() and month = date_trunc('month', now())::date),
    'this_month_cents', (select coalesce(sum(s.cents), 0) from public.pass_shares(date_trunc('month', now())::date) s where s.actor_id = auth.uid())
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = auth.uid() and month = date_trunc('month', now())::date),
    'unpaid_cents', (select coalesce(sum(cents), 0) from pass_allocations where actor_id = auth.uid() and paid_out_at is null)
      + (select coalesce(sum(actor_share_cents), 0) from actor_sub_payments where actor_id = auth.uid() and paid_out_at is null));
$$;

do $$
declare f text;
begin
  foreach f in array array['record_post_views(uuid[])','my_pass()','admin_finalize_pass_month(date)','admin_pass_month(date)','my_creator_stats()','admin_mark_sub_payout(uuid,date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  execute 'revoke execute on function public.finalize_pass_month_job() from public, anon, authenticated';
end $$;

select cron.schedule('cinara-backstage-split', '23 9 3 * *', 'select public.finalize_pass_month_job()');
