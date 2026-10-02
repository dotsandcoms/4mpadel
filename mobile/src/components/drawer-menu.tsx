import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { hapticLight } from '@/lib/haptics';
import { nameFromUser } from '@/lib/profile';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];
type Dest = { kind: 'tab'; href: string } | { kind: 'site'; path: string };

type NavChild = { name: string; dest: Dest };
type NavItem = {
  hidden?: boolean;
  name: string;
  icon: SymbolName;
  dest?: Dest;
  children?: NavChild[];
};

type PlayerCard = {
  name: string;
  email: string;
  rankedinId: string | null;
  imageUrl: string | null;
  region: string | null;
  racketBrand: string | null;
  homeClub: string | null;
};

const NAV: NavItem[] = [
  {
    name: 'Home',
    icon: { ios: 'house', android: 'home', web: 'home' },
    dest: { kind: 'tab', href: '/' },
  },
  {
    name: 'Players',
    icon: { ios: 'person.2', android: 'group', web: 'group' },
    dest: { kind: 'tab', href: '/rankings?view=Discover' },
  },
  {
    name: 'Calendar',
    icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
    dest: { kind: 'tab', href: '/calendar' },
  },
  {
    name: 'Media',
    icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
    dest: { kind: 'tab', href: '/media' },
  },
  {
    name: 'Events',
    hidden: true, // Not included in the launch navigation.
    icon: { ios: 'bolt', android: 'bolt', web: 'bolt' },
    children: [
      { name: 'All Tournaments', dest: { kind: 'tab', href: '/calendar' } },
      { name: 'My Calendar', dest: { kind: 'tab', href: '/calendar' } },
      { name: 'Broll Pro Tour', dest: { kind: 'site', path: '/tournaments/broll' } },
      { name: 'Kit Kat League', dest: { kind: 'site', path: '/tournaments/kit-kat-league' } },
      { name: 'North vs South', dest: { kind: 'site', path: '/tournaments/north-vs-south' } },
    ],
  },
  {
    name: 'Ecosystem',
    hidden: true, // Not included in the launch navigation.
    icon: { ios: 'globe', android: 'public', web: 'public' },
    children: [
      { name: 'Sapa', dest: { kind: 'site', path: '/federations/sapa' } },
      { name: 'Organisations', dest: { kind: 'site', path: '/organisations' } },
      { name: 'Clubs', dest: { kind: 'site', path: '/clubs' } },
    ],
  },
  {
    name: 'Academy',
    hidden: true, // Not included in the launch navigation.
    icon: { ios: 'graduationcap', android: 'school', web: 'school' },
    children: [
      { name: 'Approved Coaches', dest: { kind: 'site', path: '/academy/coaches' } },
      { name: 'Coaching Videos', dest: { kind: 'site', path: '/academy/videos' } },
      { name: 'Register', dest: { kind: 'site', path: '/academy/register' } },
    ],
  },
  {
    name: 'Help & enquiries',
    icon: { ios: 'envelope', android: 'email', web: 'email' },
    dest: { kind: 'tab', href: '/help' },
  },
];

function tabActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/index';
  return pathname.includes(href.split('?')[0].replace(/^\//, ''));
}

/** Website hamburger contents, laid out for a native right drawer. */
export function DrawerMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [player, setPlayer] = useState<PlayerCard | null>(null);
  const [email, setEmail] = useState('');
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const signedIn = Boolean(email);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(userEmail: string, fallbackName: string) {
      setEmail(userEmail);
      setPlayer((current) =>
        current?.email.toLowerCase() === userEmail.toLowerCase()
          ? current
          : {
              name: fallbackName || userEmail.split('@')[0] || 'Player',
              email: userEmail,
              rankedinId: null,
              imageUrl: null,
              region: null,
              racketBrand: null,
              homeClub: null,
            }
      );

      const { data: row } = await supabase
        .from('players')
        .select('name, email, rankedin_id, region, racket_brand, home_club, image_url')
        .ilike('email', userEmail)
        .maybeSingle();
      if (cancelled) return;
      setPlayer({
        name: row?.name || fallbackName || userEmail.split('@')[0] || 'Player',
        email: userEmail,
        rankedinId: row?.rankedin_id ? String(row.rankedin_id) : null,
        imageUrl: row?.image_url ?? null,
        region: row?.region ?? null,
        racketBrand: row?.racket_brand ?? null,
        homeClub: row?.home_club ?? null,
      });
    }

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;
      const userEmail = user?.email?.trim() ?? '';
      if (!userEmail) {
        setEmail('');
        setPlayer(null);
        return;
      }
      const names = nameFromUser(user ?? null);
      await hydrate(userEmail, [names.firstName, names.lastName].filter(Boolean).join(' '));
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const user = session?.user;
      const userEmail = user?.email?.trim() ?? '';
      if (!userEmail) {
        setEmail('');
        setPlayer(null);
        return;
      }
      const names = nameFromUser(user ?? null);
      void hydrate(userEmail, [names.firstName, names.lastName].filter(Boolean).join(' '));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const go = useMemo(
    () => (dest: Dest) => {
      onClose();
      if (dest.kind === 'tab') router.push(dest.href as never);
      else openSitePath(dest.path);
    },
    [onClose, router]
  );


  return (
    <View
      accessibilityRole="menu"
      accessibilityViewIsModal={visible}
      accessibilityLabel="Navigation"
      style={{
        flex: 1,
        backgroundColor: brand.page,
        paddingTop: insets.top + 4,
        paddingBottom: Math.max(insets.bottom, 12),
      }}>
      <View className="flex-row items-center justify-between border-b border-court-edge px-5 py-4">
        <Text
          className="text-[10px] font-black uppercase text-court-accent"
          style={{ letterSpacing: 1.8 }}>
          Navigation
        </Text>
        <Pressable
          onPress={() => {
            hapticLight();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center">
          <View className="h-8 w-8 items-center justify-center rounded-lg border border-court-edge bg-court-surface">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={16}
              tintColor="rgba(22,37,31,0.7)"
            />
          </View>
        </Pressable>
      </View>

      {player ? (
        <View className="px-5 pt-5">
          <PressableScale
            onPress={() => go({ kind: 'tab', href: '/profile' })}
            accessibilityRole="button"
            accessibilityLabel={`${player.name}, profile`}>
            <View className="flex-row items-center rounded-2xl border border-court-edge bg-court-surface p-3.5">
              {player.imageUrl ? (
                <Image
                  source={{ uri: player.imageUrl }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(22,37,31,0.2)',
                  }}
                  contentFit="cover"
                  accessibilityElementsHidden
                />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-xl border border-padel/30 bg-padel/10">
                  <Text className="text-lg font-black uppercase text-court-accent">
                    {player.name.charAt(0) || 'P'}
                  </Text>
                </View>
              )}
              <View className="ml-3 min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm font-black uppercase tracking-tight text-court-ink">
                  {player.name}
                </Text>
                {player.rankedinId ? (
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-court-muted">
                    ID: {player.rankedinId}
                  </Text>
                ) : null}
              </View>
            </View>
          </PressableScale>
        </View>
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled">
        {NAV.filter((item) => !item.hidden).map((item) => {
          const expanded = openMenus.includes(item.name);
          const active = item.dest?.kind === 'tab' ? tabActive(pathname, item.dest.href) : false;
          return (
            <View key={item.name} className="mb-1.5">
              <Pressable
                onPress={() => {
                  if (item.children) {
                    setOpenMenus((current) =>
                      current.includes(item.name)
                        ? current.filter((name) => name !== item.name)
                        : [...current, item.name]
                    );
                    return;
                  }
                  if (item.dest) go(item.dest);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active, expanded: item.children ? expanded : undefined }}
                accessibilityLabel={item.name}
                className="min-h-11 flex-row items-center justify-between rounded-xl border px-4"
                style={{
                  backgroundColor: active ? 'rgba(204,255,0,0.10)' : 'transparent',
                  borderColor: active ? 'rgba(204,255,0,0.35)' : 'transparent',
                }}>
                <View className="flex-row items-center">
                  <SymbolView
                    name={item.icon}
                    size={16}
                    weight="medium"
                    tintColor={active ? brand.accent : brand.premium}
                    accessibilityElementsHidden
                  />
                  <Text
                    className="ml-3 text-xs font-bold uppercase tracking-widest"
                    style={{ color: active ? brand.accent : '#52625A' }}>
                    {item.name}
                  </Text>
                </View>
                {item.children ? (
                  <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                    <SymbolView
                      name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'expand_more' }}
                      size={16}
                      tintColor={expanded ? brand.accent : brand.faint}
                    />
                  </View>
                ) : null}
              </Pressable>

              {item.children && expanded
                ? item.children.map((child) => {
                    const childActive =
                      child.dest.kind === 'tab' ? tabActive(pathname, child.dest.href) : false;
                    return (
                      <Pressable
                        key={child.name}
                        onPress={() => go(child.dest)}
                        accessibilityRole="menuitem"
                        accessibilityState={{ selected: childActive }}
                        accessibilityLabel={child.name}
                        className="ml-6 min-h-11 justify-center border-l border-court-edge py-2 pl-5 pr-3">
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider"
                          style={{ color: childActive ? brand.accent : brand.faint }}>
                          {child.name}
                        </Text>
                      </Pressable>
                    );
                  })
                : null}
            </View>
          );
        })}

      </ScrollView>

      {signedIn ? (
        <View className="border-t border-court-edge px-5 py-3">
          <PressableScale onPress={() => go({ kind: 'tab', href: '/settings' })} accessibilityRole="button" accessibilityLabel="Account & settings" className="w-full">
            <View className="min-h-12 w-full flex-row items-center rounded-xl bg-court-elevated px-4">
              <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={20} tintColor="#2449D8" />
              <Text className="ml-3 text-[13px] font-bold text-court-ink">Account & settings</Text>
            </View>
          </PressableScale>



        </View>
      ) : null}
    </View>
  );
}
