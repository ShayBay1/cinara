import { useQueryClient } from '@tanstack/react-query';
import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { LegalNote } from '@/components/LegalNote';
import { Button, IconButton, T } from '@/components/ui';
import { api } from '@/data';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import {
  appleAvailable,
  sendPhoneCode,
  signInWithApple,
  signInWithGoogle,
  signInWithPassword,
  toE164,
  validPhone,
  verifyPhoneCode,
} from '@/lib/auth';
import { colors, fonts, radius } from '@/theme/tokens';

type Step = 'start' | 'email' | 'emailCode' | 'phone' | 'phoneCode';

/** Sign in or sign up: Apple, Google, phone, or email (password or code). */
export default function SignInScreen() {
  const qc = useQueryClient();
  const keyboard = useKeyboardHeight();
  const [step, setStep] = useState<Step>('start');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const cleanEmail = email.trim().toLowerCase();
  const validEmail = /^\S+@\S+\.\S+$/.test(cleanEmail);
  const e164 = toE164(phone);

  const go = (s: Step) => {
    setError(null);
    setCode('');
    setStep(s);
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  /** Same landing for every method. */
  const done = async () => {
    await qc.invalidateQueries();
    const user = await api.currentUser();
    if (!user) throw new Error('Sign-in didn’t finish. Try again.');
    if (resetting) router.replace({ pathname: '/login-security', params: { reset: '1' } });
    else if (/^user[0-9a-f]{8}$/.test(user.handle)) router.replace({ pathname: '/settings', params: { pick: '1' } });
    else router.back();
  };

  const back = () => (step === 'emailCode' ? go('email') : step === 'phoneCode' ? go('phone') : go('start'));

  const title =
    step === 'start'
      ? 'Welcome to Cinara'
      : step === 'email'
        ? resetting
          ? 'Reset your password'
          : 'Continue with email'
        : step === 'phone'
          ? 'Continue with phone'
          : step === 'emailCode'
            ? 'Check your email'
            : 'Check your texts';

  const sub =
    step === 'start'
      ? 'Sign in or create an account. It takes a few seconds.'
      : step === 'email'
        ? resetting
          ? 'We’ll email you a code. Then you can pick a new password.'
          : 'Use your password, or we can email you a one-time code.'
        : step === 'phone'
          ? 'We’ll text you a 6-digit code. Message and data rates may apply.'
          : step === 'emailCode'
            ? `Enter the 8-digit code we sent to ${cleanEmail}.`
            : `Enter the 6-digit code we sent to ${e164}.`;

  const codeLen = step === 'emailCode' ? 8 : 6;

  const sendEmailCode = () =>
    run('code', async () => {
      await api.sendSignInCode(cleanEmail);
      go('emailCode');
      setResendIn(30);
    });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ink }}
      contentContainerStyle={[styles.fill, { paddingBottom: 20 + keyboard }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.top}>
        {step !== 'start' ? <IconButton icon="back" label="Back" onPress={back} /> : <View />}
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>

      <T variant="serif" style={{ fontSize: 34, lineHeight: 40 }}>
        {title}
      </T>
      <T style={{ color: colors.textSoft }}>{sub}</T>

      {step === 'start' ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          {apple ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={26}
              style={{ height: 52, opacity: busy ? 0.6 : 1 }}
              onPress={() =>
                !busy &&
                run('apple', async () => {
                  if (await signInWithApple()) await done();
                })
              }
            />
          ) : null}
          <Method
            label="Continue with Google"
            letter="G"
            light
            loading={busy === 'google'}
            onPress={() =>
              run('google', async () => {
                if (await signInWithGoogle()) await done();
              })
            }
          />
          <Method label="Continue with phone" icon="chat" onPress={() => go('phone')} />
          <Method label="Continue with email" icon="send" onPress={() => go('email')} />
        </View>
      ) : null}

      {step === 'email' ? (
        <View style={{ gap: 12 }}>
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email address"
          />
          {!resetting ? (
            <Field
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              accessibilityLabel="Password"
              onSubmitEditing={() => validEmail && password && run('pw', async () => (await signInWithPassword(cleanEmail, password), await done()))}
            />
          ) : null}
          {error ? <Err text={error} /> : null}
          {!resetting ? (
            <Button
              label="Sign in"
              disabled={!validEmail || password.length === 0}
              loading={busy === 'pw'}
              onPress={() =>
                run('pw', async () => {
                  await signInWithPassword(cleanEmail, password);
                  await done();
                })
              }
            />
          ) : null}
          <Button
            kind={resetting ? 'primary' : 'outline'}
            label={resetting ? 'Email me a reset code' : 'Email me a code instead'}
            disabled={!validEmail}
            loading={busy === 'code'}
            onPress={sendEmailCode}
          />
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => (setResetting(!resetting), setError(null))} style={{ alignSelf: 'center', padding: 6 }}>
            <T variant="caption" style={{ color: colors.gold }}>
              {resetting ? 'Back to sign in' : 'Forgot password?'}
            </T>
          </Pressable>
        </View>
      ) : null}

      {step === 'phone' ? (
        <View style={{ gap: 12 }}>
          <View style={styles.phoneRow}>
            {!phone.trim().startsWith('+') ? (
              <View style={styles.cc}>
                <T style={{ fontFamily: fonts.bodyHeavy }}>+1</T>
              </View>
            ) : null}
            <Field
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              accessibilityLabel="Phone number"
              style={{ flex: 1 }}
            />
          </View>
          <T variant="caption">Outside the US? Start with + and your country code.</T>
          {error ? <Err text={error} /> : null}
          <Button
            label="Text me a code"
            disabled={!validPhone(e164)}
            loading={busy === 'code'}
            onPress={() =>
              run('code', async () => {
                await sendPhoneCode(e164);
                go('phoneCode');
                setResendIn(30);
              })
            }
          />
        </View>
      ) : null}

      {step === 'emailCode' || step === 'phoneCode' ? (
        <View style={{ gap: 12 }}>
          <Field
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, codeLen))}
            placeholder={'0'.repeat(codeLen)}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            accessibilityLabel={`${codeLen} digit code`}
            autoFocus
            style={{ letterSpacing: 6, fontSize: 22 }}
          />
          {error ? <Err text={error} /> : null}
          <Button
            label={resetting ? 'Continue' : 'Sign in'}
            disabled={code.length < codeLen}
            loading={busy === 'verify'}
            onPress={() =>
              run('verify', async () => {
                if (step === 'emailCode') await api.verifySignInCode(cleanEmail, code);
                else await verifyPhoneCode(e164, code);
                await done();
              })
            }
          />
          <Button
            kind="outline"
            label={resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
            disabled={resendIn > 0 || !!busy}
            onPress={() =>
              run('resend', async () => {
                if (step === 'emailCode') await api.sendSignInCode(cleanEmail);
                else await sendPhoneCode(e164);
                setResendIn(30);
              })
            }
          />
        </View>
      ) : null}

      {step === 'start' && error ? <Err text={error} /> : null}
      {step === 'start' ? <LegalNote /> : null}
    </ScrollView>
  );
}

function Method({ label, icon, letter, light, loading, onPress }: { label: string; icon?: 'chat' | 'send'; letter?: string; light?: boolean; loading?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.method, light && styles.methodLight, (pressed || loading) && { opacity: 0.7 }]}
    >
      <View style={styles.methodIcon}>
        {letter ? (
          <T style={{ fontFamily: fonts.bodyHeavy, fontSize: 18, color: light ? '#1F1F1F' : colors.text }}>{letter}</T>
        ) : icon ? (
          <Icon name={icon} size={20} color={colors.text} />
        ) : null}
      </View>
      <T style={[styles.methodText, light && { color: '#1F1F1F' }]} numberOfLines={1}>
        {loading ? 'Opening…' : label}
      </T>
      <View style={styles.methodIcon} />
    </Pressable>
  );
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return <TextInput placeholderTextColor={colors.dim} autoCapitalize="none" autoCorrect={false} {...props} style={[styles.input, props.style]} />;
}

function Err({ text }: { text: string }) {
  return (
    <T variant="caption" style={{ color: colors.liveSoft }} accessibilityLiveRegion="polite">
      {text}
    </T>
  );
}

const styles = StyleSheet.create({
  fill: { flexGrow: 1, padding: 20, gap: 14 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  method: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  methodLight: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  methodIcon: { width: 28, alignItems: 'center' },
  methodText: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.text },
  phoneRow: { flexDirection: 'row', gap: 10 },
  cc: {
    minHeight: 52,
    minWidth: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#3A2E20',
    backgroundColor: '#110D09',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#3A2E20',
    backgroundColor: '#110D09',
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
});
