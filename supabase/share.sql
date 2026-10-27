-- ===========================================================================
-- The Cinara Share: viewership tracking, the revenue ledger, and actor pay.
--
-- How money moves (the same rules as src/lib/share.ts):
--   1. The player sends a heartbeat every ~15 s of real playback (record_watch).
--      The server credits seconds against a per-viewer wall clock, so two
--      devices, replays or a hacked client can't inflate minutes.
--   2. The Stripe webhook writes every membership payment and refund to
--      revenue_ledger (net = gross - card fee - tax), once per Stripe id.
--   3. allocate_month_live splits each member's net for the month across the shows
--      they watched, by seconds (user-centric). Cents are exact: largest
--      remainder, so every member's money adds up to the cent. close_month freezes
--      a month once; nothing is ever rewritten.
--   4. compute_quarter turns a show's revenue into its talent pool: 40% until
--      the show's revenue reaches its production budget, 60% after, for good.
--      Points split the pool (rounded down; leftover cents carry to the next
--      quarter's pool). Gifts: 90% after card fees to the actor picked, or
--      split by points when a viewer gifts "the cast".
--   5. close_quarter freezes the months and writes statements. Statements are
--      paid within 30 days; mark_statement_paid records it.
-- Only record_watch and my_share_statements can be called from the app.
-- ===========================================================================

create extension if not exists pg_cron;

-- ---------- Deals ----------

alter table public.shows add column if not exists production_budget_cents bigint not null default 0
  check (production_budget_cents >= 0);

-- One row per role, from the signed talent agreement.
create table public.talent_deals (
  show_id text not null references public.shows (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  role text not null,
  points int not null check (points > 0),
  signed_at timestamptz not null default now(),
  primary key (show_id, profile_id, role)
);
create index talent_deals_profile_idx on public.talent_deals (profile_id);

-- ---------- Viewership ----------

create table public.watch_sessions (
  id uuid primary key,                       -- made by the app, one per play of an episode
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_id text not null references public.shows (id) on delete cascade,
  episode int not null,
  started_at timestamptz not null,
  last_tick_at timestamptz not null,
  last_seq int not null default -1,
  last_position_sec numeric(10, 2) not null default 0,
  counted_sec numeric(12, 2) not null default 0
);
create index watch_sessions_user_idx on public.watch_sessions (user_id, started_at desc);

-- The viewer's wall clock: credited time can never run faster than real time.
create table public.watch_clocks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_at timestamptz not null
);

-- Seconds watched, per viewer, show and UTC day. This is what pays.
create table public.watch_daily (
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_id text not null references public.shows (id) on delete cascade,
  day date not null,
  seconds numeric(12, 2) not null default 0 check (seconds >= 0),
  primary key (user_id, show_id, day)
);
create index watch_daily_day_idx on public.watch_daily (day, show_id);

-- ---------- Money in ----------

create table public.revenue_ledger (
  id bigint generated always as identity primary key,
  source_id text not null unique,            -- Stripe invoice / refund id: each is recorded once
  kind text not null check (kind in ('membership', 'membership_refund', 'adjustment')),
  user_id uuid references public.profiles (id) on delete set null,
  gross_cents bigint not null,
  fee_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  net_cents bigint generated always as (gross_cents - fee_cents - tax_cents) stored,
  service_month date not null check (extract(day from service_month) = 1),
  occurred_at timestamptz not null default now(),
  note text
);
create index revenue_ledger_month_idx on public.revenue_ledger (service_month, user_id);

alter table public.gift_purchases
  add column if not exists recipient_id uuid references public.profiles (id) on delete set null,
  add column if not exists card_fee_cents int not null default 0 check (card_fee_cents >= 0),
  add column if not exists refunded_at timestamptz;

-- ---------- Allocation and statements ----------

create table public.month_totals (
  month date primary key check (extract(day from month) = 1),
  member_net_cents bigint not null default 0,
  allocated_cents bigint not null default 0,
  unwatched_cents bigint not null default 0,   -- members who watched nothing that month: stays with Cinara
  computed_at timestamptz not null default now(),
  closed boolean not null default false
);

create table public.member_allocations (
  month date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_id text not null references public.shows (id) on delete cascade,
  seconds numeric(12, 2) not null,
  cents bigint not null,
  primary key (month, user_id, show_id)
);
create index member_allocations_show_idx on public.member_allocations (show_id, month);

create table public.quarter_closes (
  quarter text primary key check (quarter ~ '^\d{4}-Q[1-4]$'),
  closed_at timestamptz not null default now()
);

-- Each show's pool for a closed quarter, and the cents left over for the next one.
create table public.show_quarter_pools (
  show_id text not null references public.shows (id) on delete cascade,
  quarter text not null references public.quarter_closes (quarter),
  revenue_cents bigint not null,
  earned_before_cents bigint not null,
  budget_cents bigint not null,
  carry_in_cents bigint not null,
  pool_cents bigint not null,
  paid_cents bigint not null,
  remainder_cents bigint not null,
  primary key (show_id, quarter)
);

create table public.share_statements (
  profile_id uuid not null references public.profiles (id) on delete restrict,
  quarter text not null references public.quarter_closes (quarter),
  status text not null default 'due' check (status in ('due', 'paid')),
  paid_on timestamptz,
  gift_count int not null default 0,
  gift_gross_cents bigint not null default 0,
  gift_card_fees_cents bigint not null default 0,
  gift_share_cents bigint not null default 0,
  shows_cents bigint not null default 0,
  total_cents bigint generated always as (shows_cents + gift_share_cents) stored,
  primary key (profile_id, quarter)
);

create table public.share_lines (
  profile_id uuid not null references public.profiles (id) on delete restrict,
  quarter text not null references public.quarter_closes (quarter),
  show_id text not null references public.shows (id),
  role text not null,
  points int not null,
  total_points int not null,
  seconds_watched numeric(14, 2) not null,
  members int not null,
  revenue_cents bigint not null,
  earned_before_cents bigint not null,
  budget_cents bigint not null,
  pool_cents bigint not null,
  share_cents bigint not null,
  primary key (profile_id, quarter, show_id, role)
);

alter table public.talent_deals enable row level security;
alter table public.watch_sessions enable row level security;
alter table public.watch_clocks enable row level security;
alter table public.watch_daily enable row level security;
alter table public.revenue_ledger enable row level security;
alter table public.month_totals enable row level security;
alter table public.member_allocations enable row level security;
alter table public.quarter_closes enable row level security;
alter table public.show_quarter_pools enable row level security;
alter table public.share_statements enable row level security;
alter table public.share_lines enable row level security;
-- No policies: nothing here is readable or writable from the app except through the functions below.

-- ---------- Helpers ----------

create function public.quarter_start(p_quarter text) returns date
language sql immutable set search_path = public as $$
  select make_date(split_part(p_quarter, '-Q', 1)::int, (split_part(p_quarter, '-Q', 2)::int - 1) * 3 + 1, 1);
$$;

create function public.quarter_of(p_at timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(p_at at time zone 'utc', 'YYYY') || '-Q' || to_char(p_at at time zone 'utc', 'Q');
$$;

-- ---------- 1. Viewership ----------

create function public._record_watch(
  p_user uuid, p_session uuid, p_show text, p_episode int, p_seq int,
  p_position numeric, p_playing numeric, p_at timestamptz
) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_show record;
  v_dur int;
  v_sess public.watch_sessions;
  v_clock timestamptz;
  v_day date := (p_at at time zone 'utc')::date;
  v_today numeric;
  v_credit numeric;
begin
  if p_user is null then raise exception 'Please sign in first.' using errcode = '28000'; end if;
  if p_session is null or p_seq is null or p_seq < 0 or p_playing is null or p_playing < 0
     or p_position is null or p_position < 0 then
    raise exception 'Bad watch tick.' using errcode = '22023';
  end if;

  select published, latest_episode into v_show from shows where id = p_show;
  if not found or not v_show.published or p_episode < 1 or p_episode > v_show.latest_episode then
    raise exception 'This episode isn''t out yet.' using errcode = '22023';
  end if;
  select duration_sec into v_dur from episodes where show_id = p_show and number = p_episode;
  v_dur := coalesce(v_dur, 600);

  select * into v_sess from watch_sessions where id = p_session for update;
  if found then
    if v_sess.user_id <> p_user or v_sess.show_id <> p_show or v_sess.episode <> p_episode then
      raise exception 'Session mismatch.' using errcode = '22023';
    end if;
    if p_seq <= v_sess.last_seq then return 0; end if;   -- a repeat or replayed tick
  else
    insert into watch_sessions (id, user_id, show_id, episode, started_at, last_tick_at)
    values (p_session, p_user, p_show, p_episode, p_at, p_at)
    returning * into v_sess;
  end if;

  -- Credit no more than: the playback reported, 30 s per tick, real time since this viewer's
  -- last tick on any device (+2 s slack), twice the episode per session, 16 hours a day.
  insert into watch_clocks (user_id, last_at) values (p_user, p_at - interval '1 hour')
  on conflict (user_id) do nothing;
  select last_at into v_clock from watch_clocks where user_id = p_user for update;
  v_credit := least(p_playing, 30, greatest(0, extract(epoch from (p_at - v_clock)) + 2));
  if p_position > v_dur + 5 then v_credit := 0; end if;
  v_credit := least(v_credit, greatest(0, v_dur * 2 - v_sess.counted_sec));
  select coalesce(sum(seconds), 0) into v_today from watch_daily where user_id = p_user and day = v_day;
  v_credit := round(least(v_credit, greatest(0, 57600 - v_today)), 2);

  update watch_sessions
     set last_seq = p_seq, last_tick_at = p_at, last_position_sec = p_position,
         counted_sec = counted_sec + v_credit
   where id = p_session;
  update watch_clocks set last_at = greatest(last_at, p_at) where user_id = p_user;
  if v_credit > 0 then
    insert into watch_daily (user_id, show_id, day, seconds) values (p_user, p_show, v_day, v_credit)
    on conflict (user_id, show_id, day) do update set seconds = watch_daily.seconds + excluded.seconds;
  end if;
  return v_credit;
end $$;

-- What the app calls. Returns the seconds credited.
create function public.record_watch(
  p_session uuid, p_show text, p_episode int, p_seq int, p_position numeric, p_playing numeric
) returns numeric
language sql security definer set search_path = public as $$
  select public._record_watch(auth.uid(), p_session, p_show, p_episode, p_seq, p_position, p_playing, now());
$$;

-- ---------- 2. Money in ----------

-- Called by the Stripe webhook (service role). Idempotent on p_source.
-- Revenue for a month that's already closed lands in the current month instead.
create function public.record_revenue(
  p_source text, p_kind text, p_user uuid, p_gross bigint, p_fee bigint, p_tax bigint,
  p_month date, p_at timestamptz default now(), p_note text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_id bigint;
begin
  if exists (select 1 from month_totals where month = v_month and closed) then
    v_month := date_trunc('month', p_at at time zone 'utc')::date;
  end if;
  if exists (select 1 from month_totals where month = v_month and closed) then
    raise exception 'Month % is closed.', v_month;
  end if;
  insert into revenue_ledger (source_id, kind, user_id, gross_cents, fee_cents, tax_cents, service_month, occurred_at, note)
  values (p_source, p_kind, p_user, p_gross, coalesce(p_fee, 0), coalesce(p_tax, 0), v_month, p_at, p_note)
  on conflict (source_id) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- ---------- 3. Monthly allocation (user-centric) ----------

-- One month's split of each member's net payment across the shows they watched, by seconds.
-- Exact to the cent (largest remainder). Computed live until the month is closed.
create function public.allocate_month_live(p_month date)
returns table (user_id uuid, show_id text, seconds numeric, cents bigint)
language sql stable security definer set search_path = public as $$
  with m as (
    select date_trunc('month', p_month)::date as m0, (date_trunc('month', p_month) + interval '1 month')::date as m1
  ), nets as (
    select r.user_id, sum(r.net_cents)::numeric as net
      from revenue_ledger r, m
     where r.service_month = m.m0 and r.user_id is not null
     group by r.user_id
    having sum(r.net_cents) <> 0
  ), w as (
    select d.user_id, d.show_id, sum(d.seconds) as s
      from watch_daily d, m
     where d.day >= m.m0 and d.day < m.m1
     group by d.user_id, d.show_id
    having sum(d.seconds) > 0
  ), base as (
    select n.user_id, w.show_id, w.s, n.net,
           n.net * w.s / sum(w.s) over (partition by n.user_id) as exact
      from nets n join w on w.user_id = n.user_id
  ), parts as (
    select base.*, trunc(exact) as whole, exact - trunc(exact) as frac from base
  ), ranked as (
    select parts.*,
           net - sum(whole) over (partition by parts.user_id) as leftover,
           row_number() over (partition by parts.user_id order by abs(frac) desc, parts.show_id) as rn
      from parts
  )
  select user_id, show_id, s,
         (whole + case when rn <= abs(leftover) then sign(leftover) else 0 end)::bigint
    from ranked;
$$;

-- Allocations for every month in [p_from, p_to): frozen rows for closed months, live for open ones.
create function public.allocations(p_from date, p_to date)
returns table (month date, user_id uuid, show_id text, seconds numeric, cents bigint)
language sql stable security definer set search_path = public as $$
  select a.month, a.user_id, a.show_id, a.seconds, a.cents
    from member_allocations a
   where a.month >= p_from and a.month < p_to
  union all
  select mo, l.user_id, l.show_id, l.seconds, l.cents
    from generate_series(date_trunc('month', p_from), p_to - interval '1 day', interval '1 month') g(mo_ts)
    cross join lateral (select g.mo_ts::date as mo) x
    cross join lateral allocate_month_live(x.mo) l
   where not exists (select 1 from month_totals t where t.month = x.mo and t.closed);
$$;

-- Freeze a month: store its allocation and totals. Runs once per month (rows are never rewritten).
create function public.close_month(p_month date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_month)::date;
begin
  if exists (select 1 from month_totals where month = v_month and closed) then
    raise exception 'Month % is already closed.', v_month;
  end if;
  insert into member_allocations (month, user_id, show_id, seconds, cents)
  select v_month, l.user_id, l.show_id, l.seconds, l.cents from allocate_month_live(v_month) l;
  insert into month_totals (month, member_net_cents, allocated_cents, unwatched_cents, computed_at, closed)
  select v_month, x.net, x.alloc, x.net - x.alloc, now(), true
    from (select coalesce((select sum(net_cents) from revenue_ledger where service_month = v_month and user_id is not null), 0) as net,
                 coalesce((select sum(cents) from member_allocations where month = v_month), 0) as alloc) x
  on conflict (month) do update
     set member_net_cents = excluded.member_net_cents, allocated_cents = excluded.allocated_cents,
         unwatched_cents = excluded.unwatched_cents, computed_at = excluded.computed_at, closed = true;
end $$;

-- ---------- 4. The quarter's pools and shares ----------

-- Each show's pool for a quarter. Negative months (refunds) carry forward instead of clawing back.
create function public.compute_show_pools(p_quarter text)
returns table (
  show_id text, seconds_watched numeric, members int, revenue_cents bigint, earned_before_cents bigint,
  budget_cents bigint, carry_in_cents bigint, raw_pool_cents bigint, pool_cents bigint
)
language sql stable security definer set search_path = public as $$
  with b as (
    select quarter_start(p_quarter) as qs,
           (quarter_start(p_quarter) + interval '3 months')::date as qe,
           least(coalesce((select min(service_month) from revenue_ledger), quarter_start(p_quarter)), quarter_start(p_quarter)) as first
  ), al as (
    select a.*, (a.month >= b.qs) as in_q from b cross join lateral allocations(b.first, b.qe) a
  ), q as (
    select s.id, s.production_budget_cents as budget,
           coalesce((select sum(al.cents) from al where al.show_id = s.id and al.in_q), 0) as rev,
           coalesce((select sum(al.cents) from al where al.show_id = s.id and not al.in_q), 0) as before,
           coalesce((select count(distinct al.user_id) from al where al.show_id = s.id and al.in_q and al.cents > 0), 0)::int as members,
           coalesce((select sum(d.seconds) from watch_daily d, b where d.show_id = s.id and d.day >= b.qs and d.day < b.qe), 0) as secs,
           coalesce((select p.remainder_cents from show_quarter_pools p, b
                      where p.show_id = s.id and quarter_start(p.quarter) < b.qs
                      order by quarter_start(p.quarter) desc limit 1), 0) as carry
      from shows s
  ), r as (
    select q.*, (round(least(rev, greatest(budget - before, 0)) * 0.40
                       + (rev - least(rev, greatest(budget - before, 0))) * 0.60) + carry)::bigint as raw
      from q
  )
  select id, secs, members, rev::bigint, before::bigint, budget, carry::bigint, raw, greatest(raw, 0)
    from r;
$$;

-- One row per role. Used live for the open quarter and frozen by close_quarter.
create function public.compute_quarter(p_quarter text)
returns table (
  show_id text, profile_id uuid, role text, points int, total_points int,
  seconds_watched numeric, members int, revenue_cents bigint, earned_before_cents bigint,
  budget_cents bigint, carry_in_cents bigint, pool_cents bigint, share_cents bigint
)
language sql stable security definer set search_path = public as $$
  with d as (
    select t.*, sum(t.points) over (partition by t.show_id)::int as total from talent_deals t
  )
  select p.show_id, d.profile_id, d.role, d.points, d.total,
         p.seconds_watched, p.members, p.revenue_cents, p.earned_before_cents, p.budget_cents,
         p.carry_in_cents, p.pool_cents,
         floor(p.pool_cents::numeric * d.points / d.total)::bigint
    from compute_show_pools(p_quarter) p join d on d.show_id = p.show_id;
$$;

-- Gifts per actor for a quarter: picked actor gets the gift; "the cast" splits by points.
create function public.compute_quarter_gifts(p_quarter text)
returns table (profile_id uuid, gift_count int, gross_cents bigint, fee_cents bigint, share_cents bigint)
language sql stable security definer set search_path = public as $$
  with b as (
    select quarter_start(p_quarter)::timestamptz as qs, (quarter_start(p_quarter) + interval '3 months')::timestamptz as qe
  ), g as (
    select gp.* from gift_purchases gp, b
     where gp.created_at >= b.qs and gp.created_at < b.qe and gp.refunded_at is null
  ), parts as (
    select g.recipient_id as profile_id, g.amount_cents::numeric as gross, g.card_fee_cents::numeric as fee
      from g where g.recipient_id is not null
    union all
    select d.profile_id,
           g.amount_cents::numeric * d.points / sum(d.points) over (partition by g.id),
           g.card_fee_cents::numeric * d.points / sum(d.points) over (partition by g.id)
      from g join talent_deals d on d.show_id = g.show_id
     where g.recipient_id is null
  )
  select profile_id, count(*)::int, floor(sum(gross))::bigint, ceil(sum(fee))::bigint,
         floor(greatest(sum(gross) - sum(fee), 0) * 0.90)::bigint
    from parts group by profile_id;
$$;

-- Freeze a finished quarter: allocate and close its months, store pools, lines and statements.
create function public.close_quarter(p_quarter text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_qs date := quarter_start(p_quarter);
  m date;
begin
  if exists (select 1 from quarter_closes where quarter = p_quarter) then
    raise exception 'Quarter % is already closed.', p_quarter;
  end if;
  if now() < (v_qs + interval '3 months') then
    raise exception 'Quarter % hasn''t ended yet.', p_quarter;
  end if;
  for m in select generate_series(v_qs, v_qs + interval '2 months', interval '1 month')::date loop
    if not exists (select 1 from month_totals where month = m and closed) then
      perform close_month(m);
    end if;
  end loop;

  insert into quarter_closes (quarter) values (p_quarter);

  insert into show_quarter_pools (show_id, quarter, revenue_cents, earned_before_cents, budget_cents,
                                  carry_in_cents, pool_cents, paid_cents, remainder_cents)
  select p.show_id, p_quarter, p.revenue_cents, p.earned_before_cents, p.budget_cents, p.carry_in_cents,
         p.pool_cents, x.paid, p.raw_pool_cents - x.paid
    from compute_show_pools(p_quarter) p
    cross join lateral (
      select coalesce(sum(l.share_cents), 0)::bigint as paid
        from compute_quarter(p_quarter) l where l.show_id = p.show_id
    ) x;

  insert into share_lines (profile_id, quarter, show_id, role, points, total_points, seconds_watched, members,
                           revenue_cents, earned_before_cents, budget_cents, pool_cents, share_cents)
  select profile_id, p_quarter, show_id, role, points, total_points, seconds_watched, members,
         revenue_cents, earned_before_cents, budget_cents, pool_cents, share_cents
    from compute_quarter(p_quarter);

  insert into share_statements (profile_id, quarter, gift_count, gift_gross_cents, gift_card_fees_cents,
                                gift_share_cents, shows_cents)
  select p.profile_id, p_quarter,
         coalesce(g.gift_count, 0), coalesce(g.gross_cents, 0), coalesce(g.fee_cents, 0),
         coalesce(g.share_cents, 0),
         coalesce((select sum(l.share_cents) from share_lines l
                    where l.profile_id = p.profile_id and l.quarter = p_quarter), 0)
    from (select l.profile_id from share_lines l where l.quarter = p_quarter
          union select g2.profile_id from compute_quarter_gifts(p_quarter) g2) p
    left join compute_quarter_gifts(p_quarter) g on g.profile_id = p.profile_id;
end $$;

create function public.mark_statement_paid(p_profile uuid, p_quarter text, p_paid_on timestamptz default now())
returns void
language sql security definer set search_path = public as $$
  update share_statements set status = 'paid', paid_on = p_paid_on
   where profile_id = p_profile and quarter = p_quarter;
$$;

-- ---------- 5. What the app reads ----------

create function public.my_share_statements()
returns table (quarter text, status text, paid_on timestamptz, shows jsonb, gifts jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_now text := quarter_of(now());
  v_prev text := quarter_of(now() - interval '3 months');
  q text;
begin
  if v_me is null then return; end if;
  if not exists (select 1 from talent_deals where profile_id = v_me)
     and not exists (select 1 from share_statements where profile_id = v_me) then
    return;
  end if;

  -- The open quarter, and last quarter until it's closed: live numbers.
  foreach q in array array[v_now, v_prev] loop
    if not exists (select 1 from quarter_closes c where c.quarter = q) then
      return query
      select q,
             case when q = v_now then 'open' else 'due' end,
             null::timestamptz,
             coalesce((select jsonb_agg(jsonb_build_object(
                 'show_id', l.show_id, 'show_title', s.title, 'role', l.role,
                 'points', l.points, 'total_points', l.total_points,
                 'minutes_watched', floor(l.seconds_watched / 60), 'members', l.members,
                 'revenue_cents', l.revenue_cents, 'earned_before_cents', l.earned_before_cents,
                 'budget_cents', l.budget_cents, 'pool_cents', l.pool_cents, 'share_cents', l.share_cents
               ) order by s.number)
               from compute_quarter(q) l join shows s on s.id = l.show_id
              where l.profile_id = v_me), '[]'::jsonb),
             coalesce((select jsonb_build_object('count', g.gift_count, 'gross_cents', g.gross_cents,
                                                 'card_fees_cents', g.fee_cents, 'share_cents', g.share_cents)
                         from compute_quarter_gifts(q) g where g.profile_id = v_me),
                      jsonb_build_object('count', 0, 'gross_cents', 0, 'card_fees_cents', 0, 'share_cents', 0));
    end if;
  end loop;

  -- Closed quarters: frozen statements, newest first.
  return query
  select st.quarter, st.status, st.paid_on,
         coalesce((select jsonb_agg(jsonb_build_object(
             'show_id', l.show_id, 'show_title', s.title, 'role', l.role,
             'points', l.points, 'total_points', l.total_points,
             'minutes_watched', floor(l.seconds_watched / 60), 'members', l.members,
             'revenue_cents', l.revenue_cents, 'earned_before_cents', l.earned_before_cents,
             'budget_cents', l.budget_cents, 'pool_cents', l.pool_cents, 'share_cents', l.share_cents
           ) order by s.number)
           from share_lines l join shows s on s.id = l.show_id
          where l.profile_id = v_me and l.quarter = st.quarter), '[]'::jsonb),
         jsonb_build_object('count', st.gift_count, 'gross_cents', st.gift_gross_cents,
                            'card_fees_cents', st.gift_card_fees_cents, 'share_cents', st.gift_share_cents)
    from share_statements st
   where st.profile_id = v_me
   order by quarter_start(st.quarter) desc;
end $$;

-- ---------- 6. The daily job ----------

-- Daily: closes last quarter 7 days after it ends, once late payments and refunds have landed.
create function public.share_daily_job() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prev_q text := quarter_of(now() - interval '3 months');
begin
  if not exists (select 1 from quarter_closes where quarter = v_prev_q)
     and now() >= quarter_start(quarter_of(now())) + interval '7 days' then
    perform close_quarter(v_prev_q);
  end if;
end $$;

select cron.schedule('snippets-share-daily', '17 9 * * *', $$select public.share_daily_job()$$);

-- ---------- Permissions ----------

revoke all on function public._record_watch(uuid, uuid, text, int, int, numeric, numeric, timestamptz) from public, anon, authenticated;
revoke all on function public.record_revenue(text, text, uuid, bigint, bigint, bigint, date, timestamptz, text) from public, anon, authenticated;
revoke all on function public.allocate_month_live(date) from public, anon, authenticated;
revoke all on function public.allocations(date, date) from public, anon, authenticated;
revoke all on function public.close_month(date) from public, anon, authenticated;
revoke all on function public.compute_quarter(text) from public, anon, authenticated;
revoke all on function public.compute_show_pools(text) from public, anon, authenticated;
revoke all on function public.compute_quarter_gifts(text) from public, anon, authenticated;
revoke all on function public.close_quarter(text) from public, anon, authenticated;
revoke all on function public.mark_statement_paid(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.share_daily_job() from public, anon, authenticated;
revoke all on function public.record_watch(uuid, text, int, int, numeric, numeric) from public, anon;
revoke all on function public.my_share_statements() from public, anon;
grant execute on function public.record_watch(uuid, text, int, int, numeric, numeric) to authenticated;
grant execute on function public.my_share_statements() to authenticated;
