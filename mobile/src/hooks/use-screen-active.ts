import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';

/** Stop decorative loops when another route covers the screen or the app sleeps. */
export function useScreenActive() {
  const [active, setActive] = useState(false);
  useFocusEffect(useCallback(() => {
    setActive(AppState.currentState === 'active');
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { listener.remove(); setActive(false); };
  }, []));
  return active;
}
