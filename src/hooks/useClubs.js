import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Club list for AuthModal / player profile / event builder.
 * Includes basic location fields so event setup can prefill an address after
 * an organiser selects a host club.
 */
export function useClubs() {
    const [clubs, setClubs] = useState([]);
    const [loadingClubs, setLoadingClubs] = useState(true);

    useEffect(() => {
        const fetchClubs = async () => {
            setLoadingClubs(true);
            try {
                const { data, error } = await supabase
                    .from('clubs')
                    .select('id, name, address, city')
                    .not('status', 'in', '(pending,rejected,in_review)')
                    .order('name');
                if (error) {
                    console.error("Error fetching clubs:", error);
                } else {
                    setClubs(data || []);
                }
            } catch (err) {
                console.error("Failed to fetch clubs:", err);
            } finally {
                setLoadingClubs(false);
            }
        };

        fetchClubs();
    }, []);

    return { clubs, loadingClubs, loading: loadingClubs };
}
