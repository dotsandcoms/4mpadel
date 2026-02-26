/**
 * @burkcorp/reactmath
 * React SEO Plugin with Admin Panel
 * 
 * A drop-in SEO management solution for React applications.
 */

// Context & Provider
export { SEOProvider, useSEOContext } from './context/SEOProvider';

// Admin Panel
export { default as SEOAdminPanel } from './admin/SEOAdminPanel';
export { default as RedirectManager } from './admin/RedirectManager';
export { default as FourOhFourMonitor } from './admin/FourOhFourMonitor';
export { default as AnalyticsDashboard } from './admin/AnalyticsDashboard';
export { default as ReportsDashboard } from './admin/ReportsDashboard';

// Components
export { default as SEOHead } from './components/SEOHead';
export { default as SchemaOrg } from './components/SchemaOrg';
export { default as Breadcrumbs } from './components/Breadcrumbs';
export { default as ImageSEO } from './components/ImageSEO';
export { default as GoogleAnalytics } from './components/GoogleAnalytics';
export { default as FourOhFourTracker } from './components/FourOhFourTracker';

// Hooks
export { default as useSEO } from './hooks/useSEO';
export { default as useSEOScore, SEO_RULES } from './hooks/useSEOScore';
export { default as useReadability } from './hooks/useReadability';
export { default as useInternalLinks } from './hooks/useInternalLinks';

// Utilities
export * from './utils/github';
export * from './utils/ai';

// Default config structure (for reference)
export const defaultConfig = {
    site: {
        name: "Site Name",
        tagline: "Site Tagline",
        titleTemplate: "%s | Site Name",
        defaultTitle: "Site Name | Tagline",
        siteUrl: "https://example.com",
        defaultImage: "/og-default.jpg",
        twitterHandle: "@handle",
        locale: "en_US",
        themeColor: "#000000"
    },
    organization: {
        name: "Organization Name",
        url: "https://example.com",
        logo: "https://example.com/logo.svg",
        email: "hello@example.com"
    },
    pages: {},
    defaults: {
        robots: "index, follow",
        schema: "WebPage"
    }
};
