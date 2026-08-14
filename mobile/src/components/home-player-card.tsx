import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { PulseDot } from '@/components/pulse-dot';
import { firstNameOf, greetingForNow, type HomePlayer } from '@/lib/home';
import { brand } from '@/theme/tokens';

const RANK_GOLD = '#EAB308';

type Props = {
  player: HomePlayer | null;
  loading: boolean;
  onPress: () => void;
};

export function HomeGreeting({ player }: { player: HomePlayer | null }) {
  const first = firstNameOf(player?.name);
  return (
    <Text className="mb-3 text-[16px] font-bold text-premium">
      {greetingForNow()}
      {first ? (
        <>
          {', '}
          <Text className="text-padel">{first}</Text>
        </>
      ) : null}
      <Text accessibilityElementsHidden> 👋</Text>
    </Text>
  );
}

export function HomePlayerCard({ player, loading, onPress }: Props) {
  if (loading && !player) {
    return (
      <View className="rounded-2xl border border-edge bg-page/70 p-3.5">
        <View className="flex-row items-center">
          <View className="h-20 w-20 rounded-full bg-elevated" />
          <View className="ml-4 flex-1">
            <View className="h-3 w-24 rounded bg-elevated" />
            <View className="mt-2.5 h-5 w-40 rounded bg-elevated" />
            <View className="mt-3 h-4 w-full rounded bg-elevated" />
          </View>
        </View>
      </View>
    );
  }

  if (!player) return null;

  const rank =
    player.rank_label && player.rank_label !== 'Unranked' ? `#${player.rank_label}` : '—';
  const points =
    player.points !== undefined && player.points !== null
      ? Number(player.points).toLocaleString('en-ZA')
      : '—';
  const record = player.winLoss || '—';
  const license = licenseCopy(player.license_type);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View profile, ${player.name || 'player'}. Rank ${rank}, ${points} points, record ${record}.`}
      className="rounded-2xl border border-edge bg-[#0a0a0a]/70 p-3.5">
      <View className="flex-row items-stretch">
        <View className="h-20 w-20 items-center justify-center self-center overflow-hidden rounded-full border-2 border-edge bg-elevated">
          {player.image_url ? (
            <Image
              source={{ uri: player.image_url }}
              style={{ width: 80, height: 80 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <SymbolView name="person.fill" size={28} tintColor={brand.faint} />
          )}
        </View>

        <View className="ml-4 min-w-0 flex-1">
          {license ? (
            <View
              className="mb-1.5 flex-row items-center self-start rounded-full border px-2 py-0.5"
              style={{
                borderColor: license.border,
                backgroundColor: license.bg,
              }}>
              {license.pulse ? <PulseDot color={brand.padel} size={6} /> : null}
              <Text
                className="text-[8px] font-black uppercase tracking-wider"
                style={{
                  color: license.color,
                  marginLeft: license.pulse ? 6 : 0,
                }}>
                {license.label}
              </Text>
            </View>
          ) : null}

          <Text
            numberOfLines={1}
            className="text-[17px] font-extrabold uppercase tracking-tight text-premium"
            style={{ lineHeight: 20 }}>
            {player.name || 'Player'}
          </Text>

          <View className="mt-2 flex-row items-stretch">
            <Stat value={rank} label="Rank" color={RANK_GOLD} lead />
            <View className="w-px self-stretch bg-edge" />
            <Stat value={points} label="Points" color={brand.padel} />
            <View className="w-px self-stretch bg-edge" />
            <Stat value={record} label="W-L" color={brand.premium} />
          </View>
        </View>

        <View className="ml-1 justify-center">
          <SymbolView name="chevron.right" size={16} tintColor={brand.faint} />
        </View>
      </View>
    </PressableScale>
  );
}

function Stat({
  value,
  label,
  color,
  lead,
}: {
  value: string;
  label: string;
  color: string;
  lead?: boolean;
}) {
  return (
    <View className={`min-w-0 flex-1 ${lead ? 'pr-2.5' : 'px-2.5'}`}>
      <Text
        className="text-[16px] font-extrabold"
        style={{ color, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text className="mt-0.5 text-[8px] font-black uppercase tracking-widest text-faint">
        {label}
      </Text>
    </View>
  );
}

function licenseCopy(type?: string | null) {
  const key = (type || '').toLowerCase();
  if (!key) return null;
  if (key === 'full') {
    return {
      label: 'Full License Player',
      color: brand.padel,
      border: 'rgba(204,255,0,0.3)',
      bg: 'rgba(204,255,0,0.1)',
      pulse: true,
    };
  }
  if (key === 'temporary') {
    return {
      label: 'Temporary License Player',
      color: '#60A5FA',
      border: 'rgba(96,165,250,0.3)',
      bg: 'rgba(96,165,250,0.1)',
      pulse: false,
    };
  }
  if (key === 'none' || !key) {
    return {
      label: 'No License',
      color: brand.faint,
      border: 'rgba(255,255,255,0.1)',
      bg: 'rgba(255,255,255,0.05)',
      pulse: false,
    };
  }
  return null;
}
