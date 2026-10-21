import { useEffect, useState } from 'react';
import { loadProExplore } from '../services/proPadel';
export default function useProExplore(kind, params, enabled = true, delay = 0, refreshMs = 0) {
  const key = JSON.stringify(params);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ key: '', data: null, error: '', loading: false });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      loadProExplore(kind, JSON.parse(key), controller.signal).then(data => { if (!controller.signal.aborted) setState({ key, data, error: '', loading: false }); }).catch(error => { if (!controller.signal.aborted) setState({ key, data: null, error: error.message, loading: false }); });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind,key,enabled,delay,attempt]);
  useEffect(() => {
    if (!enabled || !refreshMs) return;
    const timer = setInterval(() => { if (!document.hidden) setAttempt(n => n + 1); }, refreshMs);
    return () => clearInterval(timer);
  }, [enabled, refreshMs]);
  const retry = () => { setState({ key: '', data: null, error: '', loading: true }); setAttempt(n => n+1); };
  return { ...(state.key === key ? state : { data: null, error: '', loading: enabled }), retry };
}
