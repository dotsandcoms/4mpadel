import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Club list for AuthModal / player profile / event builder.
 * Includes basic location fields so event setup can prefill an address after
 * an organiser selects a host club.
 */
export function useClubs(enabled = true) {
    const [clubs, setClubs] = useState([]);
    const [loadingClubs, setLoadingClubs] = useState(enabled);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        const controller = new AbortController();
        const fetchClubs = async () => {
            setLoadingClubs(true);
            try {
                const { data, error } = await supabase
                    .from('clubs')
                    .select('id, name, address, city')
                    .not('status', 'in', '(pending,rejected,in_review)')
                    .order('name')
                    .abortSignal(controller.signal);
                if (!active) return;
                if (error) {
                    console.error("Error fetching clubs:", error);
                } else {
                    setClubs(data || []);
                }
            } catch (err) {
                if (active) console.error("Failed to fetch clubs:", err);
            } finally {
                if (active) setLoadingClubs(false);
            }
        };

        fetchClubs();
        return () => { active = false; controller.abort(); };
    }, [enabled]);

    return { clubs, loadingClubs: enabled && loadingClubs, loading: enabled && loadingClubs };
}
