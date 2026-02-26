import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { getSEOForPage } from '../config';
import useSEOScore from './useSEOScore';

/**
 * useSEO Hook
 * Main hook for pages to configure and analyze their SEO
 * 
 * @param {object} options
 * @param {string} options.title - Page title
 * @param {string} options.description - Meta description
 * @param {string} options.focusKeyword - Primary focus keyword
 * @param {string[]} options.keywords - Additional keywords
 * @param {string} options.image - OG image
 * @param {string} options.content - Page content for analysis (optional)
 * @returns {object} - SEO configuration and score data
 */
const useSEO = (options = {}) => {
    const location = useLocation();
    const pageConfig = getSEOForPage(location.pathname);

    // Merge options with page config
    const seoData = useMemo(() => ({
        title: options.title || pageConfig.title || '',
        description: options.description || pageConfig.description || '',
        focusKeyword: options.focusKeyword || pageConfig.focusKeyword || '',
        keywords: options.keywords || pageConfig.keywords || [],
        image: options.image || pageConfig.image || '',
        canonicalUrl: options.canonicalUrl || pageConfig.canonicalUrl || '',
        robots: options.robots || pageConfig.robots || 'index, follow',
        schema: options.schema || pageConfig.schema || 'WebPage',
        content: options.content || '',
    }), [options, pageConfig]);

    // Calculate SEO score
    const { score, issues, passed, analysis } = useSEOScore(seoData);

    return {
        // SEO Configuration
        seo: seoData,
        pageConfig,

        // Score and Analysis
        score,
        issues,
        passed,
        analysis,

        // Helper functions
        getScoreColor: () => {
            if (score >= 80) return 'green';
            if (score >= 50) return 'orange';
            return 'red';
        },
        getScoreLabel: () => {
            if (score >= 80) return 'Good';
            if (score >= 50) return 'Needs Improvement';
            return 'Poor';
        },
    };
};

export default useSEO;
