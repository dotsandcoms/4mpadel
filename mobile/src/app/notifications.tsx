import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { SheetHeader } from '@/components/sheet-header';
import { fetchPendingActions, type PendingAction } from '@/lib/home';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

export default function NotificationsSheet() {
  const router = useRouter();
  const [actions, setActions] = useState<PendingAction[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const rows = await fetchPendingActions(data.user?.email);
      if (!cancelled) setActions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openAction(action: PendingAction) {
    if (router.canDismiss()) router.dismiss();
    else router.back();
    if (action.kind === 'profile') {
      router.navigate('/(tabs)/profile');
      return;
    }
    openSitePath(action.path);
  }

  const count = actions.length;

  return (
    <View className="flex-1 bg-page">
      <SheetHeader
        title="Notifications"
        trailing={
          count > 0 ? (
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: 'rgba(239,68,68,0.2)' }}>
              <Text
                className="text-[10px] font-black uppercase tracking-wider"
                style={{ color: '#EF4444' }}>
                {count} total
              </Text>
            </View>
          ) : null
        }
      />

      {count === 0 ? (
        <View className="px-5 pb-6 pt-4">
          <Text className="text-[15px] font-semibold text-premium">Nothing waiting</Text>
          <Text className="mt-1.5 text-[14px] leading-5 text-muted">
            Partner updates, payments and match reminders will land here once they
            are sent.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          {actions.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => openAction(action)}
              accessibilityRole="button"
              accessibilityLabel={`${action.title}. ${action.subtitle}`}
              className="flex-row items-start border-b border-white/5 px-5 py-4">
              <View className="mt-0.5 h-9 w-9 items-center justify-center rounded-lg bg-padel/20">
                <SymbolView
                  name={action.kind === 'profile' ? 'person.fill' : 'creditcard.fill'}
                  size={16}
                  tintColor={brand.padel}
                />
              </View>
              <View className="ml-3 min-w-0 flex-1">
                <Text className="text-[15px] font-bold text-premium">{action.title}</Text>
                <Text className="mt-1 text-[13px] leading-5 text-muted">{action.subtitle}</Text>
                <Text className="mt-1.5 text-[10px] font-bold uppercase tracking-widest text-padel">
                  {action.kind === 'profile' ? 'Open profile' : 'Pay now'}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
