import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// import redirects from '../redirects.json'; // In a real app we'd load this

/**
 * useRedirects Hook
 * Handles client-side redirects based on configured rules.
 * Supports: 301 (simulated), 302, 307
 * Config: { "from": "/old", "to": "/new", "type": 301, "regex": false }
 */
const useRedirects = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        // Load redirects from localStorage or fallback to empty
        // In dev, we can use the JSON file content as initial state
        const storedRedirects = localStorage.getItem('seo_redirects');
        const rules = storedRedirects ? JSON.parse(storedRedirects) : [];

        const currentPath = location.pathname;

        // Check for matches
        for (const rule of rules) {
            if (!rule.active) continue;

            let match = false;

            if (rule.regex) {
                try {
                    const regex = new RegExp(rule.from);
                    match = regex.test(currentPath);
                } catch (e) {
                    console.error('Invalid redirect regex:', rule.from);
                }
            } else {
                // Exact match or query param handling could go here
                // For now, strict path matching
                match = rule.from === currentPath ||
                    (rule.from.endsWith('/') && rule.from.slice(0, -1) === currentPath) ||
                    (currentPath.endsWith('/') && rule.from === currentPath.slice(0, -1));
            }

            if (match) {
                console.log(`[SEO] Redirecting from ${currentPath} to ${rule.to} (${rule.type})`);

                // Track hits (in a real app this would call an API)
                const newRules = rules.map(r =>
                    r.id === rule.id ? { ...r, hits: (r.hits || 0) + 1, lastHit: new Date().toISOString() } : r
                );
                localStorage.setItem('seo_redirects', JSON.stringify(newRules));

                // Perform redirect
                navigate(rule.to, { replace: rule.type === 301 });
                break; // Stop after first match
            }
        }
    }, [location.pathname, navigate]);
};

export default useRedirects;
