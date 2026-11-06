import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Alert, AppState, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as Device from 'expo-device';
// Opt-in local UI review only: never available in Release or on a physical device.
const simulatorScreenshots = __DEV__ && Platform.OS === 'ios' && Device.isDevice === false
  && process.env.EXPO_PUBLIC_ALLOW_SIMULATOR_SCREENSHOTS === '1';
const protectNativeScreen = Platform.OS !== 'web' && !simulatorScreenshots;
let sequence = 0;
const owners = new Set<string>();
let protection = Promise.resolve();
/** Each screen owns its protection key. Serial native calls prevent focus handoff races. */
export function usePrivateMessagingScreen() {
  const key = useRef(`messaging-${++sequence}`).current;
  const [active, setActive] = useState(false);
  useFocusEffect(useCallback(() => {
    let focused = true, protectedScreen = !protectNativeScreen;
    const reveal = () => { if (focused) setActive(protectedScreen && AppState.currentState === 'active'); };
    if (protectNativeScreen) {
      owners.add(key);
      protection = protection.catch(() => {}).then(async () => {
        await ScreenCapture.preventScreenCaptureAsync(key);
        if (Platform.OS === 'ios') await ScreenCapture.enableAppSwitcherProtectionAsync(1);
        protectedScreen = true; reveal();
      }).catch(() => {
        if (focused) { setActive(false); Alert.alert('Secure display unavailable', 'Please update or rebuild the app before opening private messages.'); }
      });
    }
    reveal();
    const subscription = AppState.addEventListener('change', reveal);
    return () => {
      focused = false; setActive(false); subscription.remove(); owners.delete(key);
      if (protectNativeScreen) protection = protection.catch(() => {}).then(async () => {
        await ScreenCapture.allowScreenCaptureAsync(key);
        if (Platform.OS === 'ios' && owners.size === 0) await ScreenCapture.disableAppSwitcherProtectionAsync();
      }).catch(() => {});
    };
  }, [key]));
  return active;
}
