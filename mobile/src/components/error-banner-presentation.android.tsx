import { Host, SnackbarHost, type SnackbarHostRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useRef } from 'react';
import { ToastAndroid } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ErrorPresentationProps } from './error-banner-presentation.types';
import { SwipeDismissibleBanner } from './swipe-dismissible-banner';

/** Material owns text, actions, accessibility and dismissal. */
export function ErrorPresentation({ message, onDismiss, bottom }: ErrorPresentationProps) {
  const host = useRef<SnackbarHostRef>(null), safe = useSafeAreaInsets();
  useEffect(() => {
    let active = true;
    void host.current?.showSnackbar({ message, duration: 'indefinite', withDismissAction: true })
      .then(() => { if (active) onDismiss(); })
      .catch(() => { if (active) ToastAndroid.show(message, ToastAndroid.LONG); });
    // Unmounting disposes the native host and cancels its snackbar coroutine.
    return () => { active = false; };
  }, [message, onDismiss]);
  return <SwipeDismissibleBanner direction="horizontal" bottom={bottom ?? safe.bottom + 12} onDismiss={onDismiss}><Host matchContents={{ vertical: true }} colorScheme="light" ignoreSafeAreaKeyboardInsets style={{ width: '100%' }}>
    <SnackbarHost ref={host} modifiers={[fillMaxWidth()]} />
  </Host></SwipeDismissibleBanner>;
}
