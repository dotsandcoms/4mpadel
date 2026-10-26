import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Text, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { firstNameOf, greetingForNow, type HomePlayer } from '@/lib/home';
import { lightBrand as brand } from '@/theme/tokens';


type Props = {
  player: HomePlayer | null;
  loading: boolean;
  fipLinked: boolean;
  onPress: () => void;
};

export function HomeGreeting({ player }: { player: HomePlayer | null }) {
  const first = firstNameOf(player?.name);
  return (
    <Text className="mb-3 text-[22px] font-bold text-court-ink">
      {greetingForNow()}
      {first ? (
        <>
          {', '}
          <Text className="text-court-accent">{first}</Text>
        </>
      ) : null}
      <Text accessibilityElementsHidden> 👋</Text>
    </Text>
  );
}

export function HomePlayerCard({ player, loading, fipLinked, onPress }: Props) {
  if (loading && !player) {
    return (
      <View className="rounded-2xl border border-court-edge bg-court-page/70 p-3.5">
        <View className="flex-row items-center">
          <View className="h-20 w-20 rounded-full bg-court-elevated" />
          <View className="ml-4 flex-1">
            <View className="h-3 w-24 rounded bg-court-elevated" />
            <View className="mt-2.5 h-5 w-40 rounded bg-court-elevated" />
            <View className="mt-3 h-4 w-full rounded bg-court-elevated" />
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
  const movement = player.rankingChange;
  const hasMovement = movement != null && Number.isFinite(movement) && rank !== '—';
  const movementLabel = hasMovement
    ? movement > 0 ? `Up ${movement} places` : movement < 0 ? `Down ${Math.abs(movement)} places` : 'Ranking unchanged'
    : '';
  const record = player.winLoss || '—';
  const license = licenseCopy(player.license_type);
  const sapaProfile = rank !== '—' || player.license_type?.toLowerCase() === 'full';

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View profile, ${player.name || 'player'}. Rank ${rank}${movementLabel ? `, ${movementLabel}` : ''}, ${points} points, record ${record}${license ? `. ${license.label}` : ''}.`}
      className="rounded-2xl border border-court-edge bg-court-elevated p-4">
      <View className="flex-row items-stretch">
        <View className="h-16 w-16 items-center justify-center self-center overflow-hidden rounded-full border-2 border-court-edge bg-court-elevated">
          {player.image_url ? (
            <Image
              source={{ uri: player.image_url }}
              style={{ width: 64, height: 64 }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
            />
          ) : (
            <SymbolView name="person.fill" size={28} tintColor={brand.faint} />
          )}
        </View>

        <View className="ml-3 min-w-0 flex-1 justify-center">
          <View className="mb-1.5 flex-row flex-wrap items-center" style={{ gap: 6 }}>
            {sapaProfile ? <IdentityBadge label="SAPA" color={brand.accent} border={brand.edge} background={brand.glass} /> : null}
            <IdentityBadge label="4M" color="#8D610C" border="#EFDCAA" background="#FFF7E5" />
            {fipLinked ? <IdentityBadge label="FIP" color="#2449D8" border="#CAD8FF" background="#EEF3FF" /> : null}
            {license && !sapaProfile ? <IdentityBadge label={license.label} color={license.color} border={license.border} background={license.bg} /> : null}
          </View>

          <Text
            numberOfLines={1}
            className="text-[17px] font-extrabold uppercase tracking-tight text-court-ink"
            style={{ lineHeight: 20 }}>
            {player.name || 'Player'}
          </Text>
        </View>

        <View className="ml-1 justify-center">
          <SymbolView name="chevron.right" size={16} tintColor={brand.faint} />
        </View>
      </View>
      <View className="mt-4 rounded-xl bg-court-surface px-3 py-3">
        <Text className="mb-2 text-[11px] font-bold text-court-muted">SAPA Career</Text>
        <View className="flex-row items-stretch">
          <Stat value={rank} label="Rank" color={brand.premium} lead movement={hasMovement ? movement : undefined} />
          <View className="w-px self-stretch bg-court-edge" />
          <Stat value={points} label="Points" color={brand.accent} />
          <View className="w-px self-stretch bg-court-edge" />
          <Stat value={record} label="Wins–losses" color={brand.premium} />
        </View>
      </View>
    </PressableScale>
  );
}

export function IdentityBadge({ label, color, border, background }: { label: string; color: string; border: string; background: string }) {
  return <View className="flex-row items-center rounded-full border px-2 py-0.5" style={{ borderColor: border, backgroundColor: background, gap: 4 }}>
    <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={11} tintColor={color} />
    <Text className="text-[9px] font-bold tracking-wider" style={{ color }}>{label}</Text>
  </View>;
}

function Stat({
  value,
  label,
  color,
  lead,
  movement,
}: {
  value: string;
  label: string;
  color: string;
  lead?: boolean;
  movement?: number;
}) {
  return (
    <View className={`min-w-0 flex-1 ${lead ? 'pr-2.5' : 'px-2.5'}`}>
      <Text
        className="text-[20px] font-bold"
        style={{ color, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {movement !== undefined ? (
        <Text style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: movement > 0 ? brand.accent : movement < 0 ? brand.danger : brand.faint, fontVariant: ['tabular-nums'] }}>
          {movement > 0 ? `▲ ${movement}` : movement < 0 ? `▼ ${Math.abs(movement)}` : '—'}
        </Text>
      ) : null}
      <Text className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-court-faint">
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
      label: 'SAPA Registered',
      color: brand.accent,
      border: brand.edge,
      bg: brand.glass,
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
      border: 'rgba(22,37,31,0.1)',
      bg: 'rgba(22,37,31,0.05)',
      pulse: false,
    };
  }
  return null;
}
