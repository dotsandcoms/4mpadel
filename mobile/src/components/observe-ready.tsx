import { useObserve } from 'expo-observe';
import { createContext, useContext, useEffect, useRef } from 'react';

export const StartupRevealedContext = createContext(false);

/** Mark a screen interactive after its content is ready and the launch overlay has cleared. */
export function ObserveReady({ ready = true }: { ready?: boolean }) {
  const revealed = useContext(StartupRevealedContext);
  const { markInteractive } = useObserve();
  const marked = useRef(false);

  useEffect(() => {
    if (!revealed || !ready || marked.current) return;
    marked.current = true;
    markInteractive();
  }, [revealed, ready, markInteractive]);

  return null;
}
