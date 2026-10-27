-- Tests for share.sql. Run in the Supabase SQL editor: it builds fake members, viewing,
-- payments, refunds and gifts, checks every number, then rolls everything back.
-- Success ends with the error "ALL TESTS PASSED (rolled back)".
do $test$
declare
  A uuid := 'a0000000-0000-4000-a000-00000000000a';  -- actor A
  B uuid := 'b0000000-0000-4000-a000-00000000000b';  -- actor B
  M1 uuid := 'c1000000-0000-4000-a000-0000000000c1'; -- members
  M2 uuid := 'c2000000-0000-4000-a000-0000000000c2';
  M3 uuid := 'c3000000-0000-4000-a000-0000000000c3';
  W uuid := 'd1000000-0000-4000-a000-0000000000d1';  -- watch-tracking tester
  S1 uuid := '00000000-0000-4000-b000-000000000001';
  S2 uuid := '00000000-0000-4000-b000-000000000002';
  t0 timestamptz := '2026-04-10 20:00:00+00';
  c numeric;
  v bigint;
  r record;
  j jsonb;
  failed boolean;
begin
  insert into auth.users (id, email, aud, role)
  select x, x::text || '@test.local', 'authenticated', 'authenticated' from unnest(array[A, B, M1, M2, M3, W]) x;

  -- ---------- record_watch: anti-inflation rules ----------
  c := _record_watch(W, S1, 'his-secret-fortune', 1, 0, 10, 15, t0);
  assert c = 15, format('first tick credits 15, got %s', c);
  c := _record_watch(W, S1, 'his-secret-fortune', 1, 0, 10, 15, t0);
  assert c = 0, format('repeated tick credits 0, got %s', c);
  c := _record_watch(W, S1, 'his-secret-fortune', 1, 1, 25, 15, t0 + interval '15 s');
  assert c = 15, format('second tick credits 15, got %s', c);
  c := _record_watch(W, S2, 'his-secret-fortune', 1, 0, 5, 15, t0 + interval '16 s');
  assert c = 3, format('second device only gets real time (1 s + 2 s slack), got %s', c);
  c := _record_watch(W, S1, 'his-secret-fortune', 1, 2, 40, 100, t0 + interval '30 s');
  assert c = 16, format('a tick claiming 100 s gets real time 14 s + 2, got %s', c);
  c := _record_watch(W, S1, 'his-secret-fortune', 1, 3, 9999, 15, t0 + interval '45 s');
  assert c = 0, format('position past the end credits 0, got %s', c);
  failed := false;
  begin
    perform _record_watch(W, gen_random_uuid(), 'his-secret-fortune', 99, 0, 0, 15, t0 + interval '60 s');
  exception when others then failed := true;
  end;
  assert failed, 'an unreleased episode is refused';
  failed := false;
  begin
    perform _record_watch(M1, S1, 'his-secret-fortune', 1, 9, 0, 15, t0 + interval '60 s');
  exception when others then failed := true;
  end;
  assert failed, 'someone else''s session is refused';
  select seconds into c from watch_daily where user_id = W and show_id = 'his-secret-fortune' and day = '2026-04-10';
  assert c = 49, format('W has 49 s on the day, got %s', c);
  failed := false;
  begin
    perform record_watch(S1, 'his-secret-fortune', 1, 20, 0, 15);   -- no signed-in user
  exception when others then failed := true;
  end;
  assert failed, 'record_watch needs a signed-in user';

  -- ---------- Deals ----------
  update shows set production_budget_cents = 1000 where id = 'his-secret-fortune';
  update shows set production_budget_cents = 0 where id = 'the-alpha-next-door';
  insert into talent_deals (show_id, profile_id, role, points) values
    ('his-secret-fortune', A, 'Marcus', 6),
    ('his-secret-fortune', B, 'Nia', 3),
    ('the-alpha-next-door', A, 'Cole', 4);

  -- ---------- Viewing (April) and money ----------
  insert into watch_daily (user_id, show_id, day, seconds) values
    (M1, 'his-secret-fortune', '2026-04-05', 2000),
    (M1, 'the-alpha-next-door', '2026-04-06', 1000),
    (M2, 'his-secret-fortune', '2026-04-07', 500);
  v := record_revenue('in_M1_apr', 'membership', M1, 999, 59, 0, '2026-04-01', '2026-04-01');
  assert v is not null, 'payment recorded';
  v := record_revenue('in_M1_apr', 'membership', M1, 999, 59, 0, '2026-04-01', '2026-04-01');
  assert v is null, 'the same Stripe invoice is only recorded once';
  perform record_revenue('in_M2_apr', 'membership', M2, 999, 59, 0, '2026-04-01', '2026-04-02');
  perform record_revenue('in_M3_apr', 'membership', M3, 999, 59, 0, '2026-04-01', '2026-04-03');
  perform record_revenue('re_M1_apr', 'membership_refund', M1, -300, 0, 0, '2026-04-01', '2026-05-02');

  select sum(cents) into v from allocate_month_live('2026-04-01') where user_id = M1;
  assert v = 640, format('M1''s net (999 - 59 - 300) is fully allocated, got %s', v);
  select cents into v from allocate_month_live('2026-04-01') where user_id = M1 and show_id = 'his-secret-fortune';
  assert v = 427, format('M1: 2/3 of 640 to His Secret Fortune = 427 (largest remainder), got %s', v);
  select cents into v from allocate_month_live('2026-04-01') where user_id = M2;
  assert v = 940, format('M2 watched one show: all 940 to it, got %s', v);
  select count(*) into v from allocate_month_live('2026-04-01') where user_id = M3;
  assert v = 0, 'M3 watched nothing: nothing allocated';

  -- ---------- Gifts (May) ----------
  insert into gift_purchases (stripe_payment_intent_id, sender_id, show_id, gift_id, gift_to, amount_cents, card_fee_cents, recipient_id, created_at)
  values ('pi_g1', M2, 'his-secret-fortune', 'ovation', 'marcus', 499, 45, A, '2026-05-03'),
         ('pi_g2', M1, 'his-secret-fortune', 'encore', 'cast', 999, 59, null, '2026-05-04'),
         ('pi_g3', M1, 'his-secret-fortune', 'encore', 'cast', 999, 59, null, '2026-05-05');
  update gift_purchases set refunded_at = '2026-05-06' where stripe_payment_intent_id = 'pi_g3';

  -- ---------- Close Q2 ----------
  perform close_quarter('2026-Q2');
  select * into r from month_totals where month = '2026-04-01';
  assert r.closed and r.member_net_cents = 2520 and r.allocated_cents = 1580 and r.unwatched_cents = 940,
    format('April totals 2520 / 1580 / 940, got %s / %s / %s', r.member_net_cents, r.allocated_cents, r.unwatched_cents);
  select * into r from show_quarter_pools where quarter = '2026-Q2' and show_id = 'his-secret-fortune';
  -- revenue 1367 against a 1000 budget: 1000 x 40% + 367 x 60% = 620.2 -> 620
  assert r.revenue_cents = 1367 and r.pool_cents = 620, format('HSF pool 620 on 1367, got %s on %s', r.pool_cents, r.revenue_cents);
  assert r.paid_cents = 619 and r.remainder_cents = 1, format('6/9 -> 413, 3/9 -> 206, 1 cent carries, got paid %s rem %s', r.paid_cents, r.remainder_cents);
  select * into r from show_quarter_pools where quarter = '2026-Q2' and show_id = 'the-alpha-next-door';
  assert r.pool_cents = 128, format('no budget: 213 at 60%% = 128, got %s', r.pool_cents);
  select share_cents into v from share_lines where quarter = '2026-Q2' and profile_id = A and role = 'Marcus';
  assert v = 413, format('A as Marcus 413, got %s', v);
  select * into r from share_statements where quarter = '2026-Q2' and profile_id = A;
  -- gifts to A: 499 direct + 2/3 of 999 = 1165 gross; fees 45 + 39.33 -> 85; 90% of 1080.67 = 972
  assert r.gift_gross_cents = 1165 and r.gift_share_cents = 972, format('A gifts 1165 -> 972, got %s -> %s', r.gift_gross_cents, r.gift_share_cents);
  assert r.shows_cents = 413 + 128 and r.total_cents = 413 + 128 + 972, format('A total, got %s', r.total_cents);
  select * into r from share_statements where quarter = '2026-Q2' and profile_id = B;
  assert r.shows_cents = 206 and r.gift_count = 1, format('B shows 206, 1 gift, got %s, %s', r.shows_cents, r.gift_count);
  failed := false;
  begin perform close_quarter('2026-Q2'); exception when others then failed := true; end;
  assert failed, 'a quarter closes only once';
  failed := false;
  begin perform close_month('2026-05-01'); exception when others then failed := true; end;
  assert failed, 'closed months stay closed';
  v := record_revenue('re_late', 'membership_refund', M2, -100, 0, 0, '2026-04-01', '2026-10-15');
  assert (select service_month from revenue_ledger where id = v) = '2026-10-01', 'a late refund for a closed month lands in the current month';

  -- ---------- Q3 carries the cent; the app's view ----------
  select carry_in_cents into v from compute_show_pools('2026-Q3') where show_id = 'his-secret-fortune';
  assert v = 1, format('Q3 starts with the 1 cent carried, got %s', v);
  select earned_before_cents into v from compute_show_pools('2026-Q3') where show_id = 'his-secret-fortune';
  assert v = 1367, format('Q3 knows HSF has earned 1367 before, got %s', v);

  perform set_config('request.jwt.claims', json_build_object('sub', A, 'role', 'authenticated')::text, true);
  select jsonb_agg(jsonb_build_object('q', quarter, 's', status, 'n', jsonb_array_length(shows), 'g', gifts->'share_cents'))
    into j from my_share_statements();
  assert jsonb_array_length(j) = 3, format('A sees 3 quarters (open, last, closed Q2), got %s', j);
  assert j->2->>'q' = '2026-Q2' and j->2->>'s' = 'due' and (j->2->>'g')::int = 972, format('Q2 statement, got %s', j->2);
  perform mark_statement_paid(A, '2026-Q2', '2026-07-20');
  assert (select status from share_statements where profile_id = A and quarter = '2026-Q2') = 'paid', 'statement marked paid';
  perform set_config('request.jwt.claims', json_build_object('sub', M3, 'role', 'authenticated')::text, true);
  assert not exists (select 1 from my_share_statements()), 'a viewer with no deals sees nothing';

  raise exception 'ALL TESTS PASSED (rolled back)';
end
$test$;
