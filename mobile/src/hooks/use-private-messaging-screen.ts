import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, AppState, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
// Screenshots are allowed. iOS keeps its separate inactive/app-switcher cover.
const protectAppSwitcher = Platform.OS === 'ios';
let sequence = 0;
const owners = new Set<string>();
let protection = Promise.resolve();
/** Serial cover changes prevent focus handoff races without blocking screenshots. */
export function usePrivateMessagingScreen() {
  const key = useRef(`messaging-${++sequence}`).current;
  const [active, setActive] = useState(false);
  useFocusEffect(useCallback(() => {
    let focused = true, protectedScreen = !protectAppSwitcher;
    const reveal = () => { if (focused) setActive(protectedScreen && AppState.currentState === 'active'); };
    if (protectAppSwitcher) {
      owners.add(key);
      protection = protection.catch(() => {}).then(async () => {
        await ScreenCapture.enableAppSwitcherProtectionAsync(1);
        protectedScreen = true; reveal();
      }).catch(() => {
        if (focused) { setActive(false); Alert.alert('Secure display unavailable', 'Please update or rebuild the app before opening private messages.'); }
      });
    }
    reveal();
    const subscription = AppState.addEventListener('change', reveal);
    return () => {
      focused = false; setActive(false); subscription.remove(); owners.delete(key);
      if (protectAppSwitcher) protection = protection.catch(() => {}).then(async () => {
        if (owners.size === 0) await ScreenCapture.disableAppSwitcherProtectionAsync();
      }).catch(() => {});
    };
  }, [key]));
  return active;
}
