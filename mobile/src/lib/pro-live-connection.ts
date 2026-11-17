import { parsePointFeed, type PointFeed } from './pro-padel-live';

// Public application identifier from https://padelapi.org/docs/websockets.
// This is not the private REST API token. No app-user details are transmitted.
const endpoint = 'wss://ws-eu.pusher.com/app/0ffbefeb945e4e466065?protocol=7&client=4m-padel&version=1.0';
const updateEvent = 'App\\PadelApi\\Events\\MatchLiveUpdated';
export type LiveConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'finished';
type Socket = Pick<WebSocket, 'send' | 'close' | 'onopen' | 'onmessage' | 'onerror' | 'onclose'>;

/** Public Pusher protocol over the platform WebSocket. One socket for the open match. */
export function connectProLive({ id, channel, onFeed, onState, onReconnect, createSocket = url => new WebSocket(url) }: {
  id: number; channel: string; onFeed: (feed: PointFeed) => void; onState: (state: LiveConnectionState) => void;
  onReconnect: () => void; createSocket?: (url: string) => Socket;
}) {
  if (!Number.isSafeInteger(id) || id <= 0 || !/^matches\.[a-zA-Z0-9_-]{8,128}$/.test(channel)) return () => {};
  let disposed = false, finished = false, attempt = 0, subscribed = false, everSubscribed = false;
  let socket: Socket | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setTimeout> | undefined, pong: ReturnType<typeof setTimeout> | undefined;
  let activityMs = 120000;
  const clearHeartbeat = () => { clearTimeout(heartbeat); clearTimeout(pong); };
  const decode = (v: unknown): any => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  const close = () => { clearHeartbeat(); if (socket) { socket.onclose = null; socket.onmessage = null; socket.onerror = null; socket.close(); socket = null; } };
  const reconnect = () => {
    if (disposed || finished || retry) return;
    close(); onState('reconnecting');
    retry = setTimeout(() => { retry = undefined; open(); }, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
  };
  const touch = () => {
    clearHeartbeat();
    heartbeat = setTimeout(() => {
      try { socket?.send(JSON.stringify({ event: 'pusher:ping', data: {} })); pong = setTimeout(reconnect, 10000); } catch { reconnect(); }
    }, activityMs);
  };
  const open = () => {
    if (disposed || finished) return;
    subscribed = false;
    onState(everSubscribed ? 'reconnecting' : 'connecting');
    try { socket = createSocket(endpoint); } catch { reconnect(); return; }
    const current = socket;
    // A stalled handshake also falls back and retries.
    heartbeat = setTimeout(reconnect, 15000);
    current.onmessage = message => {
      if (disposed || current !== socket || typeof message.data !== 'string' || message.data.length > 1000000) return;
      const event = decode(message.data);
      if (!event || typeof event.event !== 'string') return;
      touch();
      const data = decode(event.data);
      if (event.event === 'pusher:connection_established') {
        activityMs = typeof data?.activity_timeout === 'number' ? Math.max(10000, Math.min(120000, data.activity_timeout * 1000)) : 120000;
        current.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel } })); touch();
      } else if (event.event === 'pusher:ping') current.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
      else if (event.event === 'pusher:error') reconnect();
      else if (event.channel === channel && event.event === 'pusher_internal:subscription_succeeded') {
        subscribed = true; attempt = 0; onState('connected');
        if (everSubscribed) onReconnect();
        everSubscribed = true;
      } else if (subscribed && event.channel === channel && event.event === updateEvent) {
        const feed = parsePointFeed(data, id);
        if (!feed || !['live', 'ongoing', 'ended', 'finished'].includes(feed.status) || (feed.channel && feed.channel !== channel)) return;
        onFeed({ ...feed, channel, freshness: { stale: false, updatedAt: new Date().toISOString() } });
        if (feed.status === 'finished') { finished = true; onState('finished'); close(); onReconnect(); }
      }
    };
    current.onerror = reconnect; current.onclose = reconnect;
  };
  open();
  return () => { disposed = true; clearTimeout(retry); close(); };
}
