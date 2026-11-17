import { Platform, Pressable, Share, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Club } from '@/lib/clubs';
import type { useClubFavourites } from '@/hooks/use-club-favourites';
import { lightBrand as b } from '@/theme/tokens';

export function ClubActions({ club, favourites, onError }: {
  club: Club; favourites: ReturnType<typeof useClubFavourites>; onError: (message: string) => void;
}) {
  const saved = favourites.ids.has(club.id), disabled = !favourites.ready || favourites.loading || !!favourites.pending;
  const share = async () => {
    const url = `https://4mpadel.co.za/clubs/${encodeURIComponent(club.slug)}`;
    try { await Share.share(Platform.OS === 'ios' ? { title: club.name, message: club.name, url } : { title: club.name, message: `${club.name}\n${url}` }); }
    catch { onError('The club couldn’t be shared. Please try again.'); }
  };
  return <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${saved ? 'Remove' : 'Add'} ${club.name} ${saved ? 'from' : 'to'} favourites`}
      accessibilityState={{ selected: saved, disabled, busy: favourites.pending === club.id }} disabled={disabled}
      onPress={() => void favourites.toggle(club.id)}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: b.edge, backgroundColor: saved ? b.panel : b.elevated, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <SymbolView name={saved ? { ios: 'heart.fill', android: 'favorite', web: 'favorite' } : { ios: 'heart', android: 'favorite_border', web: 'favorite_border' }} size={20} tintColor={saved ? b.accent : b.muted} />
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Share ${club.name}`} onPress={() => void share()}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={19} tintColor={b.accent} />
    </Pressable>
  </View>;
}
