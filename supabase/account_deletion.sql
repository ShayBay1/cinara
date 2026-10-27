-- Applied Oct 20, 2026 (migration "account_deletion").
-- Lets a viewer delete their account in the app (App Store rule 5.1.1(v)).
-- Money records stay (the sender becomes anonymous); their chat lines go; their reports stay, unsigned.
-- Cast members with deals or statements are closed by hand (talent_deals / share_* stay ON DELETE RESTRICT).
alter table public.gift_purchases drop constraint gift_purchases_sender_id_fkey,
  add constraint gift_purchases_sender_id_fkey foreign key (sender_id) references public.profiles (id) on delete set null;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reporter_id_fkey,
  add constraint reports_reporter_id_fkey foreign key (reporter_id) references public.profiles (id) on delete set null;
alter table public.chat_messages drop constraint chat_messages_author_id_fkey,
  add constraint chat_messages_author_id_fkey foreign key (author_id) references public.profiles (id) on delete cascade;
