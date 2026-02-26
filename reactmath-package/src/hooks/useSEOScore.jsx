import { useMemo } from 'react';

/**
 * SEO Scoring Rules (inspired by RankMath's scoring system)
 * Each rule has a weight and contributes to the overall score
 */
const SEO_RULES = [
    {
        id: 'title-exists',
        name: 'Title Present',
        weight: 10,
        check: (data) => !!data.title && data.title.length > 0,
        message: 'Add a title to your page',
    },
    {
        id: 'title-length',
        name: 'Title Length',
        weight: 10,
        check: (data) => data.title && data.title.length >= 30 && data.title.length <= 60,
        message: 'Title should be between 30-60 characters',
        getDetails: (data) => `Current: ${data.title?.length || 0} characters`,
    },
    {
        id: 'title-keyword',
        name: 'Focus Keyword in Title',
        weight: 15,
        check: (data) => {
            if (!data.focusKeyword || !data.title) return false;
            return data.title.toLowerCase().includes(data.focusKeyword.toLowerCase());
        },
        message: 'Include your focus keyword in the title',
    },
    {
        id: 'description-exists',
        name: 'Meta Description Present',
        weight: 10,
        check: (data) => !!data.description && data.description.length > 0,
        message: 'Add a meta description',
    },
    {
        id: 'description-length',
        name: 'Description Length',
        weight: 10,
        check: (data) => data.description && data.description.length >= 120 && data.description.length <= 160,
        message: 'Description should be between 120-160 characters',
        getDetails: (data) => `Current: ${data.description?.length || 0} characters`,
    },
    {
        id: 'description-keyword',
        name: 'Focus Keyword in Description',
        weight: 10,
        check: (data) => {
            if (!data.focusKeyword || !data.description) return false;
            return data.description.toLowerCase().includes(data.focusKeyword.toLowerCase());
        },
        message: 'Include your focus keyword in the meta description',
    },
    {
        id: 'focus-keyword',
        name: 'Focus Keyword Set',
        weight: 10,
        check: (data) => !!data.focusKeyword && data.focusKeyword.length > 0,
        message: 'Set a focus keyword for this page',
    },
    {
        id: 'keywords-count',
        name: 'Keywords Present',
        weight: 5,
        check: (data) => data.keywords && data.keywords.length >= 3,
        message: 'Add at least 3 keywords',
        getDetails: (data) => `Current: ${data.keywords?.length || 0} keywords`,
    },
    {
        id: 'image-exists',
        name: 'Featured Image',
        weight: 10,
        check: (data) => !!data.image && data.image.length > 0,
        message: 'Add a featured image for social sharing',
    },
    {
        id: 'content-length',
        name: 'Content Length',
        weight: 10,
        check: (data) => {
            if (!data.content) return true; // Skip if no content provided
            const wordCount = data.content.split(/\s+/).filter(Boolean).length;
            return wordCount >= 300;
        },
        message: 'Content should be at least 300 words',
        getDetails: (data) => {
            if (!data.content) return 'Content not analyzed';
            const wordCount = data.content.split(/\s+/).filter(Boolean).length;
            return `Current: ${wordCount} words`;
        },
    },
    {
        id: 'url-keyword',
        name: 'Keyword in URL',
        weight: 10,
        check: (data) => {
            if (data.url === '/' || data.url === '') return true; // Homepage always passes
            if (!data.focusKeyword || !data.url) return false;
            // Normalize URL and keyword
            const slug = data.url.split('/').pop().toLowerCase();
            const keyword = data.focusKeyword.toLowerCase().replace(/\s+/g, '-');
            return slug.includes(keyword) || data.url.toLowerCase().includes(keyword);
        },
        message: 'Include your focus keyword in the URL',
    },
    {
        id: 'h1-exists',
        name: 'H1 Tag Present',
        weight: 10,
        check: (data) => data.domData && data.domData.h1Count === 1,
        message: 'Page should have exactly one H1 tag',
        getDetails: (data) => `Current: ${data.domData?.h1Count || 0} H1 tags`,
    },
    {
        id: 'external-links',
        name: 'External Links',
        weight: 5,
        check: (data) => data.domData && data.domData.externalLinks > 0,
        message: 'Add links to external resources',
        getDetails: (data) => `Current: ${data.domData?.externalLinks || 0} links`,
    },
    {
        id: 'internal-links',
        name: 'Internal Links',
        weight: 5,
        check: (data) => data.domData && data.domData.internalLinks > 0,
        message: 'Add internal links to other pages',
        getDetails: (data) => `Current: ${data.domData?.internalLinks || 0} links`,
    },
];

/**
 * useSEOScore Hook
 * Calculates a real-time SEO score based on RankMath-style scoring rules
 * 
 * @param {object} data - SEO data to analyze
 * @returns {object} - Score, issues, and analysis details
 */
const useSEOScore = (data) => {
    const analysis = useMemo(() => {
        const results = SEO_RULES.map((rule) => {
            const passed = rule.check(data);
            return {
                id: rule.id,
                name: rule.name,
                weight: rule.weight,
                passed,
                message: passed ? null : rule.message,
                details: rule.getDetails ? rule.getDetails(data) : null,
            };
        });

        // Calculate total score
        const maxScore = SEO_RULES.reduce((sum, rule) => sum + rule.weight, 0);
        const earnedScore = results
            .filter((r) => r.passed)
            .reduce((sum, r) => sum + r.weight, 0);

        const score = Math.round((earnedScore / maxScore) * 100);

        // Separate passed and failed checks
        const passed = results.filter((r) => r.passed);
        const issues = results.filter((r) => !r.passed);

        return {
            score,
            passed,
            issues,
            totalChecks: results.length,
            passedChecks: passed.length,
            failedChecks: issues.length,
        };
    }, [data]);

    return analysis;
};

export default useSEOScore;

// Export rules for admin panel
export { SEO_RULES };
