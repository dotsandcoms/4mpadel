import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Placeholder, Screen } from '@/components/screen';
import { PressableScale } from '@/components/pressable-scale';
import { signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

export default function ProfileScreen() {
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen eyebrow="Your account" title="Profile">
      {email ? (
        <Text className="mb-6 text-[15px] text-muted">{email}</Text>
      ) : null}

      <Placeholder label="Player profile, stats, biometric unlock and settings." />

      <PressableScale
        onPress={logout}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        accessibilityLabel="Sign out"
        className="mt-8 h-[52px] flex-row items-center justify-center rounded-[14px] border border-edge bg-elevated">
        {busy ? <ActivityIndicator color={brand.premium} style={{ marginRight: 10 }} /> : null}
        <Text className="text-[16px] font-semibold text-premium">Sign out</Text>
      </PressableScale>
    </Screen>
  );
}
