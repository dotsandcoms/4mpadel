import React, { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { AlertTriangle, Home, Search } from 'lucide-react';

/**
 * FourOhFourTracker
 * 
 * 1. Displays a 404 Page Not Found UI
 * 2. Logs the missing URL to localStorage for the SEO Admin Panel
 */
const FourOhFourTracker = () => {
    const location = useLocation();

    useEffect(() => {
        // Log the 404 error
        const log404 = () => {
            const currentPath = location.pathname;
            const referer = document.referrer || 'Direct';
            const timestamp = new Date().toISOString();

            // Get existing logs
            let logs = [];
            try {
                const stored = localStorage.getItem('seo_404_logs');
                if (stored) {
                    logs = JSON.parse(stored);
                }
            } catch (e) {
                console.error('Error reading 404 logs', e);
            }

            // Check if this URL is already logged recently (debounce/dedupe)
            const existingIndex = logs.findIndex(log => log.path === currentPath);

            if (existingIndex >= 0) {
                // Update existing log
                logs[existingIndex].hits = (logs[existingIndex].hits || 1) + 1;
                logs[existingIndex].lastSeen = timestamp;
                logs[existingIndex].referer = referer; // Updates to latest referer
            } else {
                // Add new log
                logs.push({
                    path: currentPath,
                    hits: 1,
                    firstSeen: timestamp,
                    lastSeen: timestamp,
                    referer: referer
                });
            }

            // Limit logs to prevent localStorage overflow (e.g., last 100 distinct URLs)
            if (logs.length > 100) {
                logs.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
                logs = logs.slice(0, 100);
            }

            // Save back
            localStorage.setItem('seo_404_logs', JSON.stringify(logs));
        };

        log404();
    }, [location.pathname]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
            <div className="bg-amber-500/10 p-6 rounded-full mb-6 animate-pulse">
                <AlertTriangle size={64} className="text-amber-500" />
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">404</h1>
            <h2 className="text-xl md:text-2xl font-semibold text-gray-300 mb-6">Page Not Found</h2>

            <p className="text-gray-400 max-w-md mb-8">
                The page you are looking for at <code className="bg-white/10 px-2 py-1 rounded text-amber-500">{location.pathname}</code> does not exist or has been moved.
            </p>

            <div className="flex gap-4">
                <Link to="/" className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
                    <Home size={20} />
                    Go Home
                </Link>
                {/* Could add a search bar or sitemap link here */}
            </div>
        </div>
    );
};

export default FourOhFourTracker;
