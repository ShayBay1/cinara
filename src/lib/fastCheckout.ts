import type { QueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { getSupabase } from '@/data';
import { WEB_URL } from '@/lib/billing';
import { notify } from '@/lib/safety';

/**
 * The shortest legal way to pay: the app already knows who you are, so it creates the Stripe checkout
 * itself and opens it straight in Safari (no website, no signing in again). Apple Pay or your saved card
 * is one tap; Stripe then sends you to cinaratv.com/done, which drops you right back in the app where you
 * were, and the app refreshes until the purchase shows up.
 *
 * Store rules: purchases happen in Safari, never inside the app (US storefront: external purchase links).
 */

export type Purchase =
  | { type: 'unlock'; kind: 'dm' | 'post'; id: string }
  | { type: 'backstage' }
  | { type: 'messages'; actorId: string }
  | { type: 'membership' };

const FUNCTIONS: Record<Purchase['type'], string> = {
  unlock: 'create-unlock-checkout',
  backstage: 'create-backstage-checkout',
  messages: 'create-actor-subscription-checkout',
  membership: 'create-membership-checkout',
};

let pending: { at: number; label: string } | null = null;

/** Which flag /done passes back to the app for each purchase. */
const FLAG: Record<Purchase['type'], string> = { unlock: 'unlocked', backstage: 'backstage', messages: 'messages', membership: 'member' };

const labelOf = (p: Purchase) =>
  p.type === 'unlock' ? 'Unlocked' : p.type === 'backstage' ? 'You’re Backstage' : p.type === 'messages' ? 'Messages are on' : 'Welcome, member';

/** Opens Stripe for this purchase. `returnTo` is the app screen to come back to (e.g. /messages/123). */
export async function checkout(p: Purchase, returnTo: string): Promise<boolean> {
  const c = getSupabase();
  if (!c) {
    notify('Purchases need the live backend.');
    return false;
  }
  const { data: s } = await c.auth.getSession();
  if (!s.session) {
    router.push('/sign-in');
    return false;
  }
  pending = { at: Date.now(), label: labelOf(p) };

  // Preferred: our own one-button page (Apple Pay + Face ID). Needs STRIPE_PUBLISHABLE_KEY on the server.
  const fast = await c.functions.invoke('start-payment', {
    body: p.type === 'unlock' ? { type: 'unlock', kind: p.kind, id: p.id } : p.type === 'messages' ? { type: 'messages', actorId: p.actorId } : { type: p.type },
  });
  if (fast.error) {
    const res = (fast.error as { context?: Response }).context;
    const parsed = (await res?.json?.().catch(() => null)) as { error?: string } | null;
    if (parsed?.error) {
      pending = null;
      notify(parsed.error);
      return false;
    }
  } else if (fast.data && !(fast.data as { fallback?: boolean }).fallback) {
    const d = fast.data as { clientSecret: string; intent: 'payment' | 'setup'; amountCents: number; label: string; note: string; publishableKey: string };
    const hash = new URLSearchParams({
      cs: d.clientSecret,
      t: d.intent,
      m: p.type === 'unlock' ? 'payment' : 'subscription',
      pk: d.publishableKey,
      amt: String(d.amountCents),
      label: d.label,
      note: d.note,
      to: returnTo,
      flag: FLAG[p.type],
      ...(p.type === 'unlock' ? { sfu: 'on_session' } : {}),
    });
    const url = `${WEB_URL}/pay#${hash.toString()}`;
    if (Platform.OS === 'web') globalThis.location?.assign(url);
    else await Linking.openURL(url);
    return true;
  }

  // Fallback: Stripe's own checkout page (still signed in, Apple Pay included).
  const back = `/done?to=${encodeURIComponent(returnTo)}`;
  const body =
    p.type === 'unlock'
      ? { kind: p.kind, id: p.id, back }
      : p.type === 'backstage'
        ? { tier: 'creators', back }
        : p.type === 'messages'
          ? { actorId: p.actorId, back }
          : { back };
  const { data, error } = await c.functions.invoke(FUNCTIONS[p.type], { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    const parsed = (await res?.json?.().catch(() => null)) as { error?: string } | null;
    pending = null;
    notify(parsed?.error ?? 'Checkout didn’t open. Try again.');
    return false;
  }
  const url = (data as { url?: string }).url;
  if (!url) return true; // e.g. an in-place upgrade that needed no checkout
  if (Platform.OS === 'web') globalThis.location?.assign(url);
  else await Linking.openURL(url);
  return true;
}

/**
 * Mounted once in the root layout. Coming back from Safari after paying (or reopening the app),
 * refreshes everything for a few seconds so the purchase appears the moment Stripe confirms it.
 */
export function usePurchaseReturn(qc: QueryClient) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const settle = (paid: boolean | null) => {
      if (!pending || Date.now() - pending.at > 30 * 60_000) return;
      const label = pending.label;
      if (paid === false) {
        pending = null;
        return;
      }
      pending = null;
      // Only say "paid" when Stripe sent them back paid; switching back by hand just refreshes quietly.
      if (paid) notify(`Payment received. ${label}…`);
      let n = 0;
      if (timer) clearInterval(timer);
      void qc.invalidateQueries();
      timer = setInterval(() => {
        n += 1;
        void qc.invalidateQueries();
        if (n >= 8 && timer) {
          clearInterval(timer);
          timer = null;
        }
      }, 2500);
    };
    const onUrl = ({ url }: { url: string }) => {
      const parsed = Linking.parse(url);
      const q = parsed.queryParams ?? {};
      // Universal Link back from paying: https://cinaratv.com/done?to=…&unlocked=1 (no paid= on it).
      const isDone = (parsed.path ?? '').replace(/^\/+|\/+$/g, '') === 'done';
      const flagged = Object.values(FLAG).some((f) => q[f] === '1');
      if (q.paid === '1' || (isDone && flagged)) settle(true);
      else if (q.paid === '0' || isDone) settle(false);
    };
    const link = Linking.addEventListener('url', onUrl);
    // Came back by switching apps instead of the link: still refresh.
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active' && pending && Date.now() - pending.at > 4000) setTimeout(() => settle(null), 600);
    });
    return () => {
      link.remove();
      app.remove();
      if (timer) clearInterval(timer);
    };
  }, [qc]);
}
