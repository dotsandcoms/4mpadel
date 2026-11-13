import { View } from 'react-native';
import { HomeAction } from '@/components/home-action';
import { lightBrand as b } from '@/theme/tokens';

/** One compact native control for player following across local and FIP screens. */
export function PlayerFollowAction({ name, following, pending = false, pendingLabel = 'Saving…', disabled = false, iconOnly = false, accentColor = b.accent, onPress }: {
  name: string; following: boolean; pending?: boolean; pendingLabel?: string; disabled?: boolean; iconOnly?: boolean; accentColor?: string; onPress: () => void;
}) {
  return <View style={{ alignSelf: 'center', flexShrink: 0 }}>
    <HomeAction compact size="small" kind={iconOnly ? 'icon' : 'link'}
      icon={following ? 'followed' : 'following'} accentColor={accentColor}
      label={pending ? pendingLabel : following ? 'Following' : 'Follow'}
      accessibilityLabel={`${following ? 'Unfollow' : 'Follow'} ${name}${pending ? `, ${pendingLabel}` : ''}`}
      disabled={disabled || pending} onPress={onPress} />
  </View>;
}
