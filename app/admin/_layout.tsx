import Head from 'expo-router/head';
import { Link, Redirect, router, Slot, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useIsAdmin } from '@/admin/data';
import { Btn, Card, Loading, s as ui } from '@/admin/ui';
import { api } from '@/data';
import { useMe } from '@/hooks/queries';
import { colors, fonts } from '@/theme/tokens';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/shows', label: 'Shows & episodes' },
  { href: '/admin/releases', label: 'Releases' },
  { href: '/admin/money', label: 'Money' },
  { href: '/admin/people', label: 'Cast & people' },
  { href: '/admin/community', label: 'Community' },
] as const;

/** /admin: the owner's control room. Web only; the database decides who's an admin. */
export default function AdminLayout() {
  const me = useMe();
  const userId = api.mode === 'live' ? me.data?.id : undefined;
  const admin = useIsAdmin(userId);
  const path = usePathname();

  if (Platform.OS !== 'web') return <Redirect href="/" />;

  let gate: React.ReactNode = null;
  if (api.mode !== 'live') gate = <Gate text="The admin needs the live backend. Add the Supabase keys to .env and reload." />;
  else if (me.isPending || (userId && admin.isPending)) gate = <Loading />;
  else if (!userId)
    gate = (
      <Gate text="Sign in with your Cinara account.">
        <Btn kind="primary" label="Sign in" onPress={() => router.push('/sign-in')} />
      </Gate>
    );
  else if (admin.error) gate = <Gate text={admin.error.message} />;
  else if (!admin.data) gate = <Gate text={`@${me.data?.handle} isn't an admin.`} />;

  return (
    <View style={st.shell}>
      <Head>
        <title>Cinara Admin</title>
        <meta name="robots" content="noindex" />
      </Head>
      {gate ? (
        <View style={st.center}>{gate}</View>
      ) : (
        <>
          <View style={st.side}>
            <Text style={st.logo}>Cinara.</Text>
            <Text style={[ui.label, { marginBottom: 24 }]}>Admin</Text>
            {NAV.map((n) => {
              const active = n.href === '/admin' ? path === '/admin' : path.startsWith(n.href);
              return (
                <Pressable
                  key={n.href}
                  accessibilityRole="link"
                  onPress={() => router.push(n.href)}
                  style={({ hovered }) => [st.nav, active && st.navOn, hovered && !active && { backgroundColor: colors.surface }]}
                >
                  <Text style={[st.navText, active && { color: colors.goldLight }]}>{n.label}</Text>
                </Pressable>
              );
            })}
            <View style={{ flex: 1 }} />
            <Text style={ui.small}>{`Signed in as @${me.data?.handle}`}</Text>
            <Link href="/" style={[ui.small, { color: colors.gold, marginTop: 6 }]}>
              Open the app
            </Link>
          </View>
          <View style={{ flex: 1 }}>
            <Slot />
          </View>
        </>
      )}
    </View>
  );
}

function Gate({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <Card style={{ width: 420, gap: 16, alignItems: 'flex-start' }}>
      <Text style={st.logo}>Cinara.</Text>
      <Text style={ui.body}>{text}</Text>
      {children}
    </Card>
  );
}

const st = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.ink, minHeight: '100%' as unknown as number },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  side: { width: 232, padding: 24, borderRightWidth: 1, borderRightColor: colors.line, backgroundColor: '#110D09' },
  logo: { fontFamily: fonts.serifItalic, fontSize: 34, color: colors.gold },
  nav: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8, marginBottom: 2 },
  navOn: { backgroundColor: colors.surfaceRaised },
  navText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.textSoft },
});
