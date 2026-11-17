import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, AppState, Platform } from 'react-native';
import { ErrorPresentation } from './error-banner-presentation';

/** Screen-level feedback, outside scrolling content and above the keyboard. */
export function ErrorBanner({ message, top = 10, bottom }: { message: string | null; top?: number; bottom?: number }) {
  const [dismissed, setDismissed] = useState(false), [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => subscription.remove();
  }, []);
  useEffect(() => { setDismissed(false); }, [message]);
  const visible = !!message && !dismissed && focused && foreground;
  const dismiss = useCallback(() => setDismissed(true), []);
  useEffect(() => {
    if (visible && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message!);
  }, [message, visible]);
  if (!visible) return null;
  return <ErrorPresentation key={message} message={message!} top={top} bottom={bottom} onDismiss={dismiss} />;
}
