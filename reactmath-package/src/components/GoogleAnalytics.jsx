import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useSEOContext } from '../context/SEOProvider';

const GoogleAnalytics = () => {
    const { site } = useSEOContext();
    const location = useLocation();
    const gaId = site?.googleAnalyticsId;

    // Track page views on route change
    useEffect(() => {
        if (gaId && window.gtag) {
            window.gtag('config', gaId, {
                page_path: location.pathname + location.search
            });
        }
    }, [location, gaId]);

    if (!gaId) return null;

    return (
        <Helmet>
            {/* Global Site Tag (gtag.js) - Google Analytics */}
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script>
                {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${gaId}');
                `}
            </script>
        </Helmet>
    );
};

export default GoogleAnalytics;
