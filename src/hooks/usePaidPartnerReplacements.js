import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// Eligibility comes from the server's payment records, never booking attribution.
export function usePaidPartnerReplacements(eventId, enabled = true) {
    const [replacements, setReplacements] = useState([]);
    const refresh = useCallback(async () => {
        if (!enabled || !eventId) return [];
        const { data, error } = await supabase.rpc('get_paid_partner_replacements', { p_event_id: Number(eventId) });
        const rows = error ? [] : data || [];
        setReplacements(rows);
        if (error) console.warn('Could not check paid partner replacements:', error.message);
        return rows;
    }, [eventId, enabled]);

    useEffect(() => {
        setReplacements([]);
        if (!enabled || !eventId) return;
        let active = true;
        const load = async () => {
            const { data, error } = await supabase.rpc('get_paid_partner_replacements', { p_event_id: Number(eventId) });
            if (active) setReplacements(error ? [] : data || []);
        };
        load();
        window.addEventListener('4m:registrations-changed', load);
        return () => {
            active = false;
            window.removeEventListener('4m:registrations-changed', load);
        };
    }, [eventId, enabled]);
    return { replacements, refresh };
}
