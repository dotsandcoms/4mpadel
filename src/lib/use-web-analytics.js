import { useEffect, useRef } from 'react';
import { identifyWebAccount, trackWebEvent, viewWebPage, webAnalyticsRoute } from './web-analytics.js';

export function useWebAnalytics(pathname, accountId, isAuthLoading) {
    const lastPage = useRef();

    useEffect(() => {
        if (isAuthLoading) return;
        let cancelled = false;
        const page = webAnalyticsRoute(pathname);
        void identifyWebAccount(accountId).then(() => {
            if (!cancelled && lastPage.current !== pathname) {
                lastPage.current = pathname;
                viewWebPage(pathname);
            }
        });
        if (!page) return () => { cancelled = true; };

        const hasAttention = () => document.visibilityState === 'visible' && document.hasFocus();
        let started = hasAttention() ? performance.now() : null;
        const pause = () => {
            if (started === null) return;
            const engagement_seconds = Math.round((performance.now() - started) / 1000);
            started = null;
            if (engagement_seconds > 0) trackWebEvent('engagement_time', { engagement_seconds }, page);
        };
        const onAttention = () => {
            if (!hasAttention()) pause();
            else if (started === null) started = performance.now();
        };

        document.addEventListener('visibilitychange', onAttention);
        window.addEventListener('focus', onAttention);
        window.addEventListener('blur', onAttention);
        window.addEventListener('pagehide', pause);
        return () => {
            cancelled = true;
            pause();
            window.removeEventListener('pagehide', pause);
            document.removeEventListener('visibilitychange', onAttention);
            window.removeEventListener('focus', onAttention);
            window.removeEventListener('blur', onAttention);
        };
    }, [pathname, accountId, isAuthLoading]);
}
