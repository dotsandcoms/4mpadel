import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Native tab bars overlay the scene (Liquid Glass on iOS, M3 on Android)
 * instead of pushing content. Scroll padding has to clear the bar, the
 * home-indicator inset, and a little air so the last row isn't flush.
 */
export function useTabScenePadding() {
  const insets = useSafeAreaInsets();
  const bar = Platform.OS === 'ios' ? 96 : 88;
  return insets.bottom + bar + 40;
}
