import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/pressable-scale';
import { signOut } from '@/lib/auth';
import { hapticLight } from '@/lib/haptics';
import { nameFromUser } from '@/lib/profile';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

const ADMIN_EMAILS = new Set([
  'bradein@dotsandcoms.co.za',
  'brad@dotsandcoms.co.za',
  'admin@4mpadel.co.za',
  'markstillerman@gmail.com',
]);

const AMBER = '#F59E0B';
const LOGOUT_RED = '#F87171';
const SKY = '#7DD3FC';

type SymbolName = { ios: string; android: string; web: string };
type Dest = { kind: 'tab'; href: string } | { kind: 'site'; path: string };

type NavChild = { name: string; dest: Dest };
type NavItem = {
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

type ManagedPage = {
  id: number;
  name: string;
  slug: string | null;
  logoUrl: string | null;
  status: string | null;
  verified: boolean | null;
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
    dest: { kind: 'site', path: '/players' },
  },
  {
    name: 'Rankings',
    icon: { ios: 'chart.line.uptrend.xyaxis', android: 'trending_up', web: 'trending_up' },
    dest: { kind: 'tab', href: '/rankings' },
  },
  {
    name: 'Calendar',
    icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
    dest: { kind: 'tab', href: '/calendar' },
  },
  {
    name: 'Media',
    icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
    dest: { kind: 'site', path: '/gallery' },
  },
  {
    name: 'Events',
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
    icon: { ios: 'globe', android: 'public', web: 'public' },
    children: [
      { name: 'Sapa', dest: { kind: 'site', path: '/federations/sapa' } },
      { name: 'Organisations', dest: { kind: 'site', path: '/organisations' } },
      { name: 'Clubs', dest: { kind: 'site', path: '/clubs' } },
    ],
  },
  {
    name: 'Academy',
    icon: { ios: 'graduationcap', android: 'school', web: 'school' },
    children: [
      { name: 'Approved Coaches', dest: { kind: 'site', path: '/academy/coaches' } },
      { name: 'Coaching Videos', dest: { kind: 'site', path: '/academy/videos' } },
      { name: 'Register', dest: { kind: 'site', path: '/academy/register' } },
    ],
  },
  {
    name: 'Contact',
    icon: { ios: 'envelope', android: 'email', web: 'email' },
    dest: { kind: 'site', path: '/contact' },
  },
];

function tabActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/index';
  return pathname.includes(href.replace(/^\//, ''));
}

function completeness(player: PlayerCard | null) {
  if (!player) return 0;
  const parts = [player.name, player.region, player.racketBrand, player.homeClub, player.imageUrl];
  return Math.round((parts.filter((v) => Boolean(v?.trim())).length / parts.length) * 100);
}

function clubSubtitle(page: ManagedPage) {
  const status = (page.status || '').toLowerCase().replace(/\s+/g, '_');
  if (page.verified || status === '4m_approved' || status === '4m_premium') {
    return { label: '4M approved', color: brand.padel };
  }
  return { label: 'Club', color: brand.faint };
}

function orgSubtitle(page: ManagedPage) {
  if (page.verified) return { label: 'Verified Organisation', color: SKY };
  if ((page.status || '').toLowerCase() === 'approved') {
    return { label: 'Approved Organisation', color: SKY };
  }
  return { label: 'Organisation', color: brand.faint };
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
  const [busy, setBusy] = useState(false);
  const [player, setPlayer] = useState<PlayerCard | null>(null);
  const [email, setEmail] = useState('');
  const [openMenus, setOpenMenus] = useState<string[]>([]);
  const [clubs, setClubs] = useState<ManagedPage[]>([]);
  const [orgs, setOrgs] = useState<ManagedPage[]>([]);
  const [manageTab, setManageTab] = useState<'clubs' | 'organisations'>('clubs');

  const isAdmin = email ? ADMIN_EMAILS.has(email.toLowerCase()) : false;
  const showManage = clubs.length > 0 || orgs.length > 0;
  const showTabs = clubs.length > 0 && orgs.length > 0;
  const activeManage = showTabs ? manageTab : clubs.length ? 'clubs' : 'organisations';
  const managed = activeManage === 'clubs' ? clubs : orgs;
  const percent = completeness(player);
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
        setClubs([]);
        setOrgs([]);
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

  useEffect(() => {
    if (!email) {
      setClubs([]);
      setOrgs([]);
      return;
    }
    let cancelled = false;

    (async () => {
      const [{ data: clubRows }, { data: orgRows }] = await Promise.all([
        supabase
          .from('club_members')
          .select('role, clubs(id, name, slug, logo_url, status, verified)')
          .ilike('user_email', email)
          .in('role', ['owner', 'admin', 'staff'])
          .limit(25),
        supabase
          .from('organisation_members')
          .select('organisation_id, organisations(id, name, slug, logo_url, status, verified)')
          .ilike('user_email', email)
          .limit(25),
      ]);

      if (cancelled) return;

      const nextClubs = uniquePages(
        (clubRows ?? [])
          .map((row) => asPage((row as { clubs?: unknown }).clubs))
          .filter((page): page is ManagedPage => {
            if (!page) return false;
            const status = (page.status || '').toLowerCase().replace(/\s+/g, '_');
            return status !== 'in_review' && status !== 'rejected';
          })
      );
      const nextOrgs = uniquePages(
        (orgRows ?? [])
          .map((row) => asPage((row as { organisations?: unknown }).organisations))
          .filter((page): page is ManagedPage => page?.status === 'approved')
      );
      setClubs(nextClubs);
      setOrgs(nextOrgs);
      if (nextClubs.length && !nextOrgs.length) setManageTab('clubs');
      if (nextOrgs.length && !nextClubs.length) setManageTab('organisations');
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  const go = useMemo(
    () => (dest: Dest) => {
      onClose();
      if (dest.kind === 'tab') router.push(dest.href as never);
      else openSitePath(dest.path);
    },
    [onClose, router]
  );

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      onClose();
      await signOut();
    } finally {
      setBusy(false);
    }
  }

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
      <View className="flex-row items-center justify-between border-b border-white/5 px-5 py-4">
        <Text
          className="text-[10px] font-black uppercase text-padel"
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
          <View className="h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <SymbolView
              name={{ ios: 'xmark', android: 'close', web: 'close' }}
              size={16}
              tintColor="rgba(255,255,255,0.7)"
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
            <View className="flex-row items-center rounded-2xl border border-white/10 bg-white/5 p-3.5">
              {player.imageUrl ? (
                <Image
                  source={{ uri: player.imageUrl }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                  contentFit="cover"
                  accessibilityElementsHidden
                />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-xl border border-padel/30 bg-padel/10">
                  <Text className="text-lg font-black uppercase text-padel">
                    {player.name.charAt(0) || 'P'}
                  </Text>
                </View>
              )}
              <View className="ml-3 min-w-0 flex-1">
                <Text
                  numberOfLines={1}
                  className="text-sm font-black uppercase tracking-tight text-premium">
                  {player.name}
                </Text>
                {player.rankedinId ? (
                  <Text
                    numberOfLines={1}
                    className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-white/40">
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
        {NAV.map((item) => {
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
                    tintColor={active ? brand.padel : brand.premium}
                    accessibilityElementsHidden
                  />
                  <Text
                    className="ml-3 text-xs font-bold uppercase tracking-widest"
                    style={{ color: active ? brand.padel : '#D1D5DB' }}>
                    {item.name}
                  </Text>
                </View>
                {item.children ? (
                  <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
                    <SymbolView
                      name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'expand_more' }}
                      size={16}
                      tintColor={expanded ? brand.padel : brand.faint}
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
                        className="ml-6 min-h-11 justify-center border-l border-white/5 py-2 pl-5 pr-3">
                        <Text
                          className="text-[10px] font-black uppercase tracking-wider"
                          style={{ color: childActive ? brand.padel : brand.faint }}>
                          {child.name}
                        </Text>
                      </Pressable>
                    );
                  })
                : null}
            </View>
          );
        })}

        {showManage ? (
          <View className="mt-3 border-t border-white/5 pt-4">
            <Text
              className="mb-3 px-1 text-[9px] font-black uppercase text-white/80"
              style={{ letterSpacing: 1.8 }}>
              Manage My Pages
            </Text>
            {showTabs ? (
              <View className="mb-3 flex-row gap-2">
                {(['clubs', 'organisations'] as const).map((tab) => {
                  const selected = activeManage === tab;
                  return (
                    <Pressable
                      key={tab}
                      onPress={() => setManageTab(tab)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="min-h-11 flex-1 items-center justify-center rounded-xl border"
                      style={{
                        borderColor: selected ? brand.padel : 'transparent',
                        backgroundColor: selected ? 'rgba(204,255,0,0.05)' : 'rgba(255,255,255,0.05)',
                      }}>
                      <Text
                        className="text-[10px] font-black uppercase tracking-widest"
                        style={{ color: selected ? brand.padel : brand.faint }}>
                        {tab === 'clubs' ? 'Clubs' : 'Organisations'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {managed.map((page) => {
              const isClub = activeManage === 'clubs';
              const subtitle = isClub ? clubSubtitle(page) : orgSubtitle(page);
              const path = isClub
                ? `/admin?tab=clubs&view=mine&club=${page.id}`
                : `/admin?tab=organisations&view=host&org=${page.id}`;
              return (
                <Pressable
                  key={page.id}
                  onPress={() => go({ kind: 'site', path })}
                  accessibilityRole="button"
                  accessibilityLabel={`${page.name}. ${subtitle.label}`}
                  className="mb-2 min-h-11 flex-row items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  {page.logoUrl ? (
                    <Image
                      source={{ uri: page.logoUrl }}
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#fff' }}
                      contentFit="cover"
                      accessibilityElementsHidden
                    />
                  ) : (
                    <View className="h-9 w-9 items-center justify-center rounded-lg bg-white">
                      <Text className="text-sm font-black uppercase text-black">
                        {(page.name || '?').charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View className="ml-3 min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-[12px] font-bold text-premium">
                      {page.name}
                    </Text>
                    <Text numberOfLines={1} className="mt-0.5 text-[10px] font-semibold" style={{ color: subtitle.color }}>
                      {subtitle.label}
                    </Text>
                  </View>
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    size={14}
                    tintColor="rgba(255,255,255,0.5)"
                  />
                </Pressable>
              );
            })}

            <Pressable
              onPress={() =>
                go({
                  kind: 'site',
                  path: activeManage === 'clubs' ? '/clubs' : '/organisations',
                })
              }
              accessibilityRole="button"
              accessibilityLabel={
                activeManage === 'clubs' ? 'Manage another club' : 'Manage another organisation'
              }
              className="mt-1 min-h-11 flex-row items-center px-1">
              <SymbolView
                name={{ ios: 'plus', android: 'add', web: 'add' }}
                size={14}
                tintColor={brand.padel}
              />
              <Text className="ml-1.5 text-[11px] font-bold text-padel">
                {activeManage === 'clubs' ? 'Manage another club' : 'Manage another organisation'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {signedIn ? (
        <View className="border-t border-white/5 px-5 py-3">
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Profile completeness"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            className="mb-3">
            <View className="mb-1.5 flex-row items-center justify-between">
              <Text className="text-[8px] font-black uppercase tracking-widest text-white/45">
                Profile Completeness
              </Text>
              <Text
                className="text-[10px] font-black text-padel"
                style={{ fontVariant: ['tabular-nums'] }}>
                {percent}%
              </Text>
            </View>
            <View className="h-1.5 overflow-hidden rounded-full bg-white/5">
              <View className="h-full rounded-full bg-padel" style={{ width: `${percent}%` }} />
            </View>
          </View>

          <PressableScale
            onPress={() => go({ kind: 'tab', href: '/profile' })}
            accessibilityRole="button"
            accessibilityLabel="My Profile"
            className="w-full">
            <View className="min-h-11 w-full flex-row items-center justify-center rounded-xl border border-white/10 bg-white/5">
              <SymbolView
                name={{ ios: 'person', android: 'person', web: 'person' }}
                size={16}
                tintColor={brand.padel}
              />
              <Text className="ml-2 text-[10px] font-black uppercase tracking-widest text-premium">
                My Profile
              </Text>
            </View>
          </PressableScale>

          {isAdmin ? (
            <PressableScale
              onPress={() => go({ kind: 'site', path: '/admin' })}
              accessibilityRole="button"
              accessibilityLabel="Admin Panel"
              className="w-full">
              <View
                className="mt-2 min-h-11 w-full flex-row items-center justify-center rounded-xl"
                style={{ backgroundColor: AMBER }}>
                <SymbolView
                  name={{ ios: 'exclamationmark.shield.fill', android: 'security', web: 'security' }}
                  size={16}
                  tintColor="#000"
                />
                <Text className="ml-2 text-[10px] font-black uppercase tracking-widest text-black">
                  Admin Panel
                </Text>
              </View>
            </PressableScale>
          ) : null}

          <PressableScale
            onPress={logout}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            accessibilityLabel="Logout"
            className="w-full">
            <View className="mt-2 min-h-11 w-full flex-row items-center justify-center rounded-xl border bg-red-500/10" style={{ borderColor: 'rgba(248,113,113,0.2)' }}>
              {busy ? (
                <ActivityIndicator color={LOGOUT_RED} />
              ) : (
                <>
                  <SymbolView
                    name={{
                      ios: 'rectangle.portrait.and.arrow.right',
                      android: 'logout',
                      web: 'logout',
                    }}
                    size={16}
                    tintColor={LOGOUT_RED}
                  />
                  <Text
                    className="ml-2 text-[10px] font-black uppercase tracking-widest"
                    style={{ color: LOGOUT_RED }}>
                    Logout
                  </Text>
                </>
              )}
            </View>
          </PressableScale>
        </View>
      ) : null}
    </View>
  );
}

function asPage(raw: unknown): ManagedPage | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = Number(record.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: typeof record.name === 'string' ? record.name : '',
    slug: typeof record.slug === 'string' ? record.slug : null,
    logoUrl: typeof record.logo_url === 'string' ? record.logo_url : null,
    status: typeof record.status === 'string' ? record.status : null,
    verified: typeof record.verified === 'boolean' ? record.verified : null,
  };
}

function uniquePages(pages: ManagedPage[]) {
  const byId = new Map<number, ManagedPage>();
  for (const page of pages) byId.set(page.id, page);
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
