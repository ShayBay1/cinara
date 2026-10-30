import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { Group, LinkRow, Rule, SettingsPage } from '@/components/settings/Page';
import { Button, T } from '@/components/ui';
import { confirmPhoneChange, loginInfo, setPassword, startPhoneChange, toE164, validPhone } from '@/lib/auth';
import { notify } from '@/lib/safety';
import { colors, fonts, radius } from '@/theme/tokens';

const NAMES: Record<string, string> = { apple: 'Apple', google: 'Google', email: 'Email', phone: 'Phone' };

/** How you sign in: linked accounts, password, phone number. */
export default function LoginSecurityScreen() {
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const qc = useQueryClient();
  const info = useQuery({ queryKey: ['login-info'], queryFn: loginInfo });
  const [editing, setEditing] = useState<'password' | 'phone' | null>(reset ? 'password' : null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['login-info'] });

  const d = info.data;
  if (info.isPending) {
    return (
      <SettingsPage title="Login & security">
        <ActivityIndicator color={colors.gold} />
      </SettingsPage>
    );
  }
  if (!d) {
    return (
      <SettingsPage title="Login & security">
        <T>Sign in to manage how you log in.</T>
        <Button label="Sign in" onPress={() => router.push('/sign-in')} />
      </SettingsPage>
    );
  }

  const e164 = toE164(phone);
  const linked = d.providers.filter((p) => p === 'apple' || p === 'google');

  return (
    <SettingsPage title="Login & security">
      {reset ? (
        <T style={{ color: colors.textSoft }}>You’re signed in. Pick a new password below.</T>
      ) : null}

      <Group title="Ways you sign in" note="Any of these opens the same account.">
        {linked.map((p, i) => (
          <View key={p}>
            {i > 0 ? <Rule /> : null}
            <Row label={NAMES[p] ?? p} value="Connected" />
          </View>
        ))}
        {linked.length ? <Rule /> : null}
        <Row label="Email" value={d.email ?? 'Not added'} />
        <Rule />
        <LinkRow label="Phone" value={d.phone ?? 'Add'} hint="Sign in with a text code" onPress={() => (setEditing('phone'), setError(null), setCodeSent(false))} />
        <Rule />
        <LinkRow
          label="Password"
          value={d.hasPassword ? 'Change' : d.email ? 'Add' : undefined}
          hint={d.email ? 'Sign in with your email and password' : 'Add an email first to use a password'}
          onPress={() => (d.email ? (setEditing('password'), setError(null)) : notify('Sign in with email once to add a password.'))}
        />
      </Group>

      {editing === 'password' ? (
        <Group title={d.hasPassword ? 'Change password' : 'Add a password'} note="At least 8 characters.">
          <View style={styles.form}>
            <TextInput value={pw} onChangeText={setPw} placeholder="New password" secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholderTextColor={colors.dim} style={styles.input} accessibilityLabel="New password" />
            <TextInput value={pw2} onChangeText={setPw2} placeholder="Type it again" secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholderTextColor={colors.dim} style={styles.input} accessibilityLabel="Confirm new password" />
            {error ? <T variant="caption" style={{ color: colors.liveSoft }}>{error}</T> : null}
            <Button
              label="Save password"
              disabled={pw.length < 8 || pw !== pw2}
              loading={busy}
              onPress={() =>
                run(async () => {
                  await setPassword(pw);
                  setPw('');
                  setPw2('');
                  setEditing(null);
                  notify('Password saved.');
                  await refresh();
                })
              }
            />
            {pw2.length >= pw.length && pw2 && pw !== pw2 ? <T variant="caption">The two passwords don’t match.</T> : null}
          </View>
        </Group>
      ) : null}

      {editing === 'phone' ? (
        <Group title={d.phone ? 'Change phone number' : 'Add a phone number'} note="We text a code to confirm it’s yours. US numbers can skip the +1.">
          <View style={styles.form}>
            {!codeSent ? (
              <>
                <TextInput value={phone} onChangeText={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholderTextColor={colors.dim} style={styles.input} accessibilityLabel="Phone number" />
                {error ? <T variant="caption" style={{ color: colors.liveSoft }}>{error}</T> : null}
                <Button label="Text me a code" disabled={!validPhone(e164)} loading={busy} onPress={() => run(async () => (await startPhoneChange(e164), setCodeSent(true)))} />
              </>
            ) : (
              <>
                <TextInput value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholderTextColor={colors.dim} style={[styles.input, { letterSpacing: 6, fontSize: 22 }]} accessibilityLabel="Six digit code" />
                {error ? <T variant="caption" style={{ color: colors.liveSoft }}>{error}</T> : null}
                <Button
                  label="Confirm"
                  disabled={code.length < 6}
                  loading={busy}
                  onPress={() =>
                    run(async () => {
                      await confirmPhoneChange(e164, code);
                      setEditing(null);
                      setCode('');
                      notify('Phone number saved.');
                      await refresh();
                    })
                  }
                />
              </>
            )}
          </View>
        </Group>
      ) : null}
    </SettingsPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <T style={styles.label}>{label}</T>
      <T variant="caption" style={{ fontSize: 14, flexShrink: 1 }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10, paddingVertical: 8 },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
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
