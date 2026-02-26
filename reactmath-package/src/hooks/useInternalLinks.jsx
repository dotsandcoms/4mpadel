import { useMemo } from 'react';

/**
 * useInternalLinks Hook
 * Suggests relevant internal pages to link to based on content analysis
 * 
 * @param {object} params
 * @param {string} params.content - Current page text content
 * @param {string} params.currentPath - Current URL path
 * @param {object} params.pages - Dictionary of all known page configs (from Context)
 * @returns {array} - List of suggested links { path, title, reason }
 */
const useInternalLinks = ({ content, currentPath, pages }) => {
    return useMemo(() => {
        if (!content) return [];

        const suggestions = [];
        const contentLower = content.toLowerCase();

        // 1. Get all other pages
        const otherPages = pages ? Object.entries(pages).filter(([path]) => path !== currentPath) : [];

        // 2. Define some "Core" routes that should always be considered if not present
        // (In a real app, this might come from a sitemap or route config)
        const coreRoutes = [
            { path: '/', title: 'Home', keywords: ['home', 'main', 'start'] },
            { path: '/services', title: 'Services', keywords: ['service', 'offer', 'solution'] },
            { path: '/work', title: 'Our Work', keywords: ['portfolio', 'project', 'case study', 'work'] },
            { path: '/about', title: 'About Us', keywords: ['about', 'team', 'company', 'story'] },
            { path: '/contact', title: 'Contact', keywords: ['contact', 'email', 'touch', 'hire'] },
            // Add specific service routes if known or discovered
            { path: '/services/web-development', title: 'Web Development', keywords: ['web', 'website', 'react', 'development'] },
            { path: '/services/app-development', title: 'App Development', keywords: ['app', 'mobile', 'android', 'ios'] },
            { path: '/services/ui-ux-design', title: 'UI/UX Design', keywords: ['design', 'ui', 'ux', 'interface'] },
            { path: '/services/seo-optimization', title: 'SEO Optimization', keywords: ['seo', 'search', 'rank', 'optimization'] }
        ];

        // Merge Core Routes with Pages Context (prefer Context data if available)
        const candidates = [...coreRoutes];

        otherPages.forEach(([path, config]) => {
            if (!candidates.find(c => c.path === path)) {
                candidates.push({
                    path,
                    title: config.title || path,
                    keywords: [config.focusKeyword, ...(config.keywords || [])].filter(Boolean)
                });
            }
        });

        // 3. Analyze content for matches
        candidates.forEach(candidate => {
            // Don't suggest self
            if (candidate.path === currentPath) return;

            // Check if link already exists in content (rough check)
            // Note: This is a simple string check, ideally we'd parse the DOM for existing <a> tags
            // But we can assume the user might want to add MORE links even if one exists, 
            // or we can rely on the user to ignore it. A stricter check would be:
            // if (content.includes(`href="${candidate.path}"`)) return; 

            let score = 0;
            let matchReason = '';

            // Match Title
            if (contentLower.includes(candidate.title.toLowerCase())) {
                score += 10;
                matchReason = `Mentions "${candidate.title}"`;
            }

            // Match Keywords
            if (candidate.keywords) {
                candidate.keywords.forEach(kw => {
                    if (kw && contentLower.includes(kw.toLowerCase())) {
                        score += 5;
                        if (!matchReason) matchReason = `Relevant to "${kw}"`;
                    }
                });
            }

            if (score > 0) {
                suggestions.push({
                    path: candidate.path,
                    title: candidate.title,
                    reason: matchReason,
                    score
                });
            }
        });

        // Sort by relevance
        return suggestions.sort((a, b) => b.score - a.score).slice(0, 5); // Top 5
    }, [content, currentPath, pages]);
};

export default useInternalLinks;
