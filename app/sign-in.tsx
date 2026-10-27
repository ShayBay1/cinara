import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { LegalNote } from '@/components/LegalNote';
import { Button, IconButton, T } from '@/components/ui';
import { api } from '@/data';
import { colors, fonts, radius } from '@/theme/tokens';

/** Passwordless sign-in: we email an 8-digit code. */
export default function SignInScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());
  // "Resend code" unlocks 30 seconds after a code is sent.
  const [resendIn, setResendIn] = useState(0);
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ alignSelf: 'flex-end' }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <T variant="serif" style={{ fontSize: 34, lineHeight: 38 }}>
        {step === 'email' ? 'Continue with email' : 'Check your email'}
      </T>
      <T style={{ color: colors.textSoft }}>
        {step === 'email'
          ? 'New here or coming back, it’s the same: we email you an 8-digit code. No password.'
          : `Enter the code we sent to ${email.trim()}.`}
      </T>
      {step === 'email' ? (
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={colors.dim}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          accessibilityLabel="Email address"
          style={styles.input}
        />
      ) : (
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 8))}
          placeholder="12345678"
          placeholderTextColor={colors.dim}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          accessibilityLabel="Eight digit code"
          style={[styles.input, { letterSpacing: 6, fontSize: 22 }]}
        />
      )}
      {error ? (
        <T variant="caption" style={{ color: colors.liveSoft }} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : null}
      {step === 'email' ? (
        <Button
          label="Email me a code"
          disabled={!validEmail}
          loading={busy}
          onPress={() =>
            run(async () => {
              await api.sendSignInCode(email.trim());
              setStep('code');
              setResendIn(30);
            })
          }
        />
      ) : (
        <Button
          label="Sign in"
          disabled={code.length < 8}
          loading={busy}
          onPress={() =>
            run(async () => {
              const user = await api.verifySignInCode(email.trim(), code);
              await qc.invalidateQueries();
              // New accounts start with a placeholder name; ask them to pick a real one.
              if (/^user[0-9a-f]{8}$/.test(user.handle)) router.replace({ pathname: '/settings', params: { pick: '1' } });
              else router.back();
            })
          }
        />
      )}
      {step === 'code' ? (
        <Button
          kind="outline"
          label={resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          disabled={resendIn > 0 || busy}
          onPress={() =>
            run(async () => {
              await api.sendSignInCode(email.trim());
              setResendIn(30);
            })
          }
        />
      ) : null}
      {step === 'code' ? (
        <Button kind="ghost" label="Use a different email" onPress={() => setStep('email')} />
      ) : null}
      {step === 'email' ? <LegalNote /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink, padding: 20, gap: 14 },
  input: {
    height: 52,
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
