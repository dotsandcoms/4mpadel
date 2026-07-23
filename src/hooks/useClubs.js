import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

/**
 * Club list for AuthModal / player profile / event builder.
 * Selects only id + name so the extended clubs schema stays compatible.
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
                    .select('id, name')
                    .not('status', 'in', '(pending,rejected)')
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
