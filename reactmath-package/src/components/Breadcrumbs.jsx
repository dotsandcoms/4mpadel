import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

/**
 * Breadcrumbs Component
 * 
 * 1. Renders a visual breadcrumb trail (Home > Section > Page)
 * 2. Injects Schema.org BreadcrumbList JSON-LD for Google
 */
const Breadcrumbs = ({ className = '' }) => {
    const location = useLocation();

    // Don't show on home page
    if (location.pathname === '/') return null;

    // Split path into segments
    const pathSegments = location.pathname.split('/').filter(Boolean);

    // Generate Schema.org JSON-LD
    const schemaData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": 1,
                "name": "Home",
                "item": window.location.origin
            },
            ...pathSegments.map((segment, index) => {
                const url = `${window.location.origin}/${pathSegments.slice(0, index + 1).join('/')}`;
                // Simple title casing for segment name (can be improved with a lookup map)
                const name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

                return {
                    "@type": "ListItem",
                    "position": index + 2,
                    "name": name,
                    "item": url
                };
            })
        ]
    };

    return (
        <nav aria-label="Breadcrumb" className={`text-sm text-gray-400 ${className}`}>

            {/* JSON-LD for SEO */}
            <Helmet>
                <script type="application/ld+json">
                    {JSON.stringify(schemaData)}
                </script>
            </Helmet>

            {/* Visual Breadcrumbs */}
            <ol className="flex items-center flex-wrap gap-2">
                <li>
                    <Link to="/" className="flex items-center hover:text-white transition-colors">
                        <Home size={14} />
                        <span className="sr-only">Home</span>
                    </Link>
                </li>

                {pathSegments.map((segment, index) => {
                    const isLast = index === pathSegments.length - 1;
                    const to = `/${pathSegments.slice(0, index + 1).join('/')}`;
                    const name = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');

                    return (
                        <li key={to} className="flex items-center gap-2">
                            <ChevronRight size={14} className="text-gray-600" />
                            {isLast ? (
                                <span className="text-blue-400 font-medium" aria-current="page">
                                    {name}
                                </span>
                            ) : (
                                <Link to={to} className="hover:text-white transition-colors">
                                    {name}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
};

export default Breadcrumbs;
