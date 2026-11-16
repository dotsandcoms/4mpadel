import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { helpRequestApi } from '../../utils/helpRequests';

export function useHelpUnread() {
    const [unread, setUnread] = useState(0), [topics, setTopics] = useState(''), [revision, setRevision] = useState(0);
    const epoch = useRef(0), alive = useRef(true), pending = useRef(false), again = useRef(false);
    const refresh = useCallback(async () => {
        if (document.hidden) return;
        if (pending.current) { again.current = true; return; }
        pending.current = true; const version = epoch.current;
        try {
            const page = await helpRequestApi('inbox', { countsOnly: true });
            if (alive.current && version === epoch.current && !document.hidden) { setUnread(page.unread); setTopics(page.topics.join(',')); }
        } catch { if (alive.current && version === epoch.current) { setUnread(0); setTopics(''); } }
        finally { pending.current = false; if (again.current) { again.current = false; void refresh(); } }
    }, []);
    useEffect(() => {
        alive.current = true;
        const reset = () => { epoch.current++; setUnread(0); setTopics(''); setTimeout(() => { if (alive.current) void refresh(); }, 0); };
        const { data } = supabase.auth.onAuthStateChange(reset);
        const visibility = () => { epoch.current++; setTopics(''); if (document.hidden) setUnread(0); else void refresh(); };
        document.addEventListener('visibilitychange', visibility);
        void refresh(); const repair = setInterval(() => void refresh(), 60000);
        return () => { alive.current = false; epoch.current++; data.subscription.unsubscribe(); clearInterval(repair); document.removeEventListener('visibilitychange', visibility); };
    }, [refresh]);
    useEffect(() => {
        if (!topics || document.hidden) return;
        let signalTimer;
        const signal = () => { if (!signalTimer) signalTimer = setTimeout(() => { signalTimer = null; setRevision(value => value + 1); void refresh(); }, 400); };
        const channels = topics.split(',').map(topic => supabase.channel(topic, { config: { private: true } }).on('broadcast', { event: 'help_changed' }, signal).subscribe());
        return () => { clearTimeout(signalTimer); channels.forEach(channel => void supabase.removeChannel(channel)); };
    }, [topics, refresh]);
    return { unread, revision, refresh };
}
