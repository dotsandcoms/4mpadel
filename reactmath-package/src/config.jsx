// SEO Configuration loader and utilities
import seoConfigData from './seo.config.json';

export const seoConfig = seoConfigData;

/**
 * Get SEO configuration for a specific page path
 * @param {string} path - The page path (e.g., '/', '/work', '/services/web-development')
 * @returns {object} - Merged SEO config with defaults
 */
export const getSEOForPage = (path) => {
    const { site, pages, defaults } = seoConfig;

    // Check for exact match first
    let pageConfig = pages[path];

    // If no exact match, check for dynamic routes (e.g., /services/:slug)
    if (!pageConfig) {
        const pathSegments = path.split('/').filter(Boolean);
        if (pathSegments.length > 0) {
            // Check for parent path config
            const parentPath = `/${pathSegments[0]}`;
            pageConfig = pages[parentPath];
        }
    }

    // Merge with defaults
    const mergedConfig = {
        ...defaults,
        ...pageConfig,
        site
    };

    // Build full title using template
    if (mergedConfig.title && site.titleTemplate) {
        mergedConfig.fullTitle = site.titleTemplate.replace('%s', mergedConfig.title);
    } else {
        mergedConfig.fullTitle = site.defaultTitle;
    }

    // Set canonical URL
    mergedConfig.canonicalUrl = `${site.siteUrl}${path}`;

    return mergedConfig;
};

/**
 * Get all page paths for sitemap generation
 * @returns {string[]} - Array of page paths
 */
export const getAllPagePaths = () => {
    return Object.keys(seoConfig.pages);
};

export default seoConfig;
