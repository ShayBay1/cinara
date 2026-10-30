import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getSupabase } from '@/data';

/**
 * Every way to sign in: Apple, Google, phone code, email + password, email code.
 * All of them end with a normal Supabase session, so the rest of the app
 * doesn't care which one was used.
 */
const sb = () => {
  const c = getSupabase();
  if (!c) throw new Error('Sign-in isn’t available in preview mode.');
  return c;
};

const fail = (e: { message: string } | null) => {
  if (e) throw new Error(friendly(e.message));
};

/** Supabase error text, rewritten for people. */
function friendly(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'That email and password don’t match. New here? Use “Email me a code” and add a password after.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'That sign-in option isn’t switched on yet. Try another one.';
  if (m.includes('token has expired') || m.includes('invalid otp') || m.includes('otp')) return 'That code didn’t work or has expired. Send a new one.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('password should be') || m.includes('weak')) return 'Use at least 8 characters for your password.';
  if (m.includes('same as the old')) return 'That’s already your password.';
  return msg;
}

/** Sign in with Apple is only on iPhone/iPad (and needs the native module). */
export async function appleAvailable() {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Returns false if the person closed the Apple sheet. */
export async function signInWithApple(): Promise<boolean> {
  const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let cred: AppleAuthentication.AppleAuthenticationCredential;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
  if (!cred.identityToken) throw new Error('Apple didn’t send a sign-in token. Try again.');
  const { data, error } = await sb().auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
  fail(error);
  // Apple only shares the name on the very first sign-in, so keep it.
  const name = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
  if (name && data.user) {
    await sb().from('profiles').update({ display_name: name }).eq('id', data.user.id).is('display_name', null);
  }
  return true;
}

/** Google opens a secure sheet in the app and comes straight back. False if closed. */
export async function signInWithGoogle(): Promise<boolean> {
  if (Platform.OS === 'web') {
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth-callback` },
    });
    fail(error);
    return true; // the page navigates away
  }
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await sb().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  fail(error);
  if (!data?.url) throw new Error('Google sign-in didn’t start. Try again.');
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false;
  await finishFromUrl(res.url);
  return true;
}

/** Turns the URL Google/Supabase sends back into a session. */
export async function finishFromUrl(url: string) {
  const query = (url.split('?')[1] ?? '').split('#')[0] ?? '';
  const hash = url.split('#')[1] ?? '';
  const q = new URLSearchParams(query);
  const h = new URLSearchParams(hash);
  const err = q.get('error_description') ?? h.get('error_description');
  if (err) throw new Error(friendly(err.replace(/\+/g, ' ')));
  const code = q.get('code');
  if (code) {
    const { error } = await sb().auth.exchangeCodeForSession(code);
    fail(error);
    return;
  }
  const access_token = h.get('access_token');
  const refresh_token = h.get('refresh_token');
  if (access_token && refresh_token) {
    const { error } = await sb().auth.setSession({ access_token, refresh_token });
    fail(error);
    return;
  }
  throw new Error('Sign-in didn’t finish. Try again.');
}

/** "(555) 123-4567" → "+15551234567". Numbers starting with + are kept as typed. */
export function toE164(input: string, country = '1') {
  const t = input.trim();
  const digits = t.replace(/\D/g, '');
  if (t.startsWith('+')) return `+${digits}`;
  if (country === '1' && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${country}${digits}`;
}
export const validPhone = (e164: string) => /^\+\d{8,15}$/.test(e164);

export async function sendPhoneCode(phone: string) {
  const { error } = await sb().auth.signInWithOtp({ phone, options: { shouldCreateUser: true, channel: 'sms' } });
  fail(error);
}
export async function verifyPhoneCode(phone: string, token: string) {
  const { error } = await sb().auth.verifyOtp({ phone, token, type: 'sms' });
  fail(error);
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  fail(error);
  if (!(data.user?.user_metadata as { has_password?: boolean } | undefined)?.has_password) void markHasPassword();
}

/** Sets or changes the password on the signed-in account. */
export async function setPassword(password: string) {
  if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
  const { error } = await sb().auth.updateUser({ password, data: { has_password: true } });
  fail(error);
}

/** Adds or changes the phone number: texts a code, then confirm it. */
export async function startPhoneChange(phone: string) {
  const { error } = await sb().auth.updateUser({ phone });
  fail(error);
}
export async function confirmPhoneChange(phone: string, token: string) {
  const { error } = await sb().auth.verifyOtp({ phone, token, type: 'phone_change' });
  fail(error);
}

export type LoginInfo = { email: string | null; phone: string | null; providers: string[]; hasPassword: boolean };

/** What this account can sign in with. */
export async function loginInfo(): Promise<LoginInfo | null> {
  const { data } = await sb().auth.getUser();
  const u = data.user;
  if (!u) return null;
  const providers = Array.from(new Set((u.identities ?? []).map((i) => i.provider)));
  const meta = (u.user_metadata ?? {}) as { has_password?: boolean };
  return {
    email: u.email ?? null,
    phone: u.phone ? `+${u.phone.replace(/^\+/, '')}` : null,
    providers,
    hasPassword: !!meta.has_password,
  };
}

/** Remembers that a password exists (Supabase doesn't expose that to the app). */
export async function markHasPassword() {
  await sb().auth.updateUser({ data: { has_password: true } });
}
