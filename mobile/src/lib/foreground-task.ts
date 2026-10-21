import { AppState } from 'react-native';

/** No timer while suspended; one request at a time, refreshed on return. */
export function startForegroundTask(task: () => void | Promise<unknown>, intervalMs: number) {
  let disposed = false;
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const run = () => {
    if (disposed || running || AppState.currentState !== 'active') return;
    running = true;
    void Promise.resolve().then(() => {
      if (!disposed && AppState.currentState === 'active') return task();
    }).catch(() => { /* Callers own their visible request errors. */ }).finally(() => { running = false; });
  };
  const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
  const change = (state: string) => {
    stop();
    if (state === 'active' && !disposed) { run(); timer = setInterval(run, intervalMs); }
  };
  change(AppState.currentState);
  const listener = AppState.addEventListener('change', change);
  return () => { disposed = true; stop(); listener.remove(); };
}

/** Native auth has no browser visibility handler. Register once at the root. */
export function watchAuthRefresh(auth: { startAutoRefresh(): Promise<void>; stopAutoRefresh(): Promise<void> }) {
  const change = (state: string) => {
    void (state === 'active' ? auth.startAutoRefresh() : auth.stopAutoRefresh()).catch(() => {});
  };
  change(AppState.currentState);
  const listener = AppState.addEventListener('change', change);
  return () => { listener.remove(); void auth.stopAutoRefresh().catch(() => {}); };
}

type Clock = { listeners: Set<(now: number) => void>; stop: () => void };
const clocks = new Map<number, Clock>();
/** Many visible countdowns share one timer per cadence. */
export function subscribeForegroundClock(listener: (now: number) => void, intervalMs: number) {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    const listeners = new Set<(now: number) => void>();
    const stop = startForegroundTask(() => {
      const now = Date.now();
      listeners.forEach(receive => receive(now));
    }, intervalMs);
    clock = { listeners, stop };
    clocks.set(intervalMs, clock);
  }
  clock.listeners.add(listener);
  listener(Date.now());
  const current = clock;
  return () => {
    current.listeners.delete(listener);
    if (!current.listeners.size) { current.stop(); clocks.delete(intervalMs); }
  };
}
