import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the user has seen onboarding.
 *
 * Deliberately NOT SecureStore. Keychain entries survive app deletion on iOS,
 * so a SecureStore flag would suppress onboarding even after a fresh install —
 * which is both wrong for the user and confusing to test against. AsyncStorage
 * lives in the app container and is cleared on uninstall, which is the
 * behaviour people expect.
 *
 * Auth tokens stay in SecureStore, where hardware-backed storage matters and
 * surviving a reinstall is acceptable.
 */
const KEY = 'onboarding_complete_v1';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === 'true';
  } catch {
    // A read failure must never trap someone on the onboarding screen.
    return true;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch {
    // Non-fatal: worst case they see onboarding again next launch.
  }
}

/** Dev helper — call from a debug menu to replay onboarding. */
export async function resetOnboarding(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
