import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

function run(fn: () => Promise<unknown>) {
  if (!native) return;
  void fn().catch(() => {});
}

/** Control tap. Light impact is felt; selection ticks often are not. */
export function hapticLight() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticMedium() {
  run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticSuccess() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticError() {
  run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
