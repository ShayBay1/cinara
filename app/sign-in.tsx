import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Button, IconButton, T } from '@/components/ui';
import { api } from '@/data';
import { colors, fonts, radius } from '@/theme/tokens';

/** Passwordless sign-in: we email a 6-digit code. */
export default function SignInScreen() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

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
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ alignSelf: 'flex-end' }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>
      <T variant="serif" style={{ fontSize: 34, lineHeight: 38 }}>{step === 'email' ? 'Sign in to Snippets' : 'Check your email'}</T>
      <T style={{ color: colors.textSoft }}>
        {step === 'email' ? 'We’ll email you a 6-digit code. No password needed.' : `Enter the code we sent to ${email.trim()}.`}
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
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          placeholderTextColor={colors.dim}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          accessibilityLabel="Six digit code"
          style={[styles.input, { letterSpacing: 6, fontSize: 22 }]}
        />
      )}
      {error ? <T variant="caption" style={{ color: colors.accent }}>{error}</T> : null}
      {step === 'email' ? (
        <Button label="Email me a code" disabled={!validEmail} loading={busy} onPress={() => run(async () => { await api.sendSignInCode(email.trim()); setStep('code'); })} />
      ) : (
        <Button
          label="Sign in"
          disabled={code.length !== 6}
          loading={busy}
          onPress={() =>
            run(async () => {
              await api.verifySignInCode(email.trim(), code);
              await qc.invalidateQueries();
              router.back();
            })
          }
        />
      )}
      {step === 'code' ? <Button kind="outline" label="Use a different email" onPress={() => setStep('email')} /> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface, padding: 20, gap: 14 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: '#3A3A44', backgroundColor: '#0C0C10', paddingHorizontal: 16, color: colors.text, fontFamily: fonts.body, fontSize: 16 },
});
