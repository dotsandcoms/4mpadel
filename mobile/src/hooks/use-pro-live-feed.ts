import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { connectProLive, type LiveConnectionState } from '@/lib/pro-live-connection';
import type { PointFeed } from '@/lib/pro-padel-live';

export function useProLiveFeed(id: number, channel: string | null | undefined, enabled: boolean, onFeed: (feed: PointFeed) => void, onReconnect: () => void) {
  const callbacks = useRef({ onFeed, onReconnect }); callbacks.current = { onFeed, onReconnect };
  const [state, setState] = useState<LiveConnectionState>('connecting');
  const connected = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!enabled || !channel) { connected.current = false; return; }
    let stop: (() => void) | undefined;
    const change = (value: string) => {
      stop?.(); stop = undefined; connected.current = false;
      if (value !== 'active') return;
      stop = connectProLive({ id, channel, onFeed: feed => callbacks.current.onFeed(feed), onState: value => { setState(value); connected.current = value === 'connected'; }, onReconnect: () => callbacks.current.onReconnect() });
    };
    change(AppState.currentState);
    const subscription = AppState.addEventListener('change', change);
    return () => { stop?.(); connected.current = false; subscription.remove(); };
  }, [id, channel, enabled]));
  return { state, connected };
}
