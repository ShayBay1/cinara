import type { QueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { notify } from '@/lib/safety';

import { backstageCheckout, getSignedInId, messagesCheckout, type PassTier } from './api';

/**
 * Web only (the apps never sell): opens Stripe for Backstage, or upgrades $4.99 to $19.99 in place.
 * `back` is the page to return to after paying.
 */
export async function startBackstage(tier: PassTier, back: string, qc: QueryClient) {
  if (Platform.OS !== 'web') return;
  if (!(await getSignedInId())) {
    router.push('/sign-in');
    return;
  }
  try {
    const url = await backstageCheckout(tier, back);
    if (url) globalThis.location?.assign(url);
    else {
      await qc.invalidateQueries({ queryKey: ['social'] });
      notify('Messages unlocked. You can message any actor who has messages turned on.');
    }
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Checkout didn’t open. Try again.');
  }
}

/** Web only: opens Stripe for messages with one actor. */
export async function startMessages(actorId: string, back: string) {
  if (Platform.OS !== 'web') return;
  if (!(await getSignedInId())) {
    router.push('/sign-in');
    return;
  }
  try {
    globalThis.location?.assign(await messagesCheckout(actorId, back));
  } catch (e) {
    notify(e instanceof Error ? e.message : 'Checkout didn’t open. Try again.');
  }
}
