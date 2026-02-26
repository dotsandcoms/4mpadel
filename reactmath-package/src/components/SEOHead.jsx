import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { getSEOForPage, seoConfig } from '../config';

/**
 * SEOHead Component
 * Manages all <head> meta tags including title, description, Open Graph, Twitter Cards, and robots
 * 
 * @param {object} props
 * @param {string} props.title - Page title (overrides config)
 * @param {string} props.description - Meta description (overrides config)
 * @param {string} props.image - OG/Twitter image URL
 * @param {string[]} props.keywords - Meta keywords array
 * @param {string} props.canonicalUrl - Canonical URL
 * @param {string} props.robots - Robots directive (e.g., 'index, follow')
 * @param {string} props.type - OG type (default: 'website')
 * @param {object} props.article - Article-specific meta (publishedTime, modifiedTime, author)
 */
const SEOHead = ({
    title,
    description,
    image,
    keywords,
    canonicalUrl,
    robots,
    type = 'website',
    article,
    noTemplate = false,
    children
}) => {
    const location = useLocation();
    const pageConfig = getSEOForPage(location.pathname);
    const { site } = seoConfig;

    // Merge props with config (props take precedence)
    const seo = {
        title: title || pageConfig.title || site.defaultTitle,
        description: description || pageConfig.description || '',
        image: image || pageConfig.image || site.defaultImage,
        keywords: keywords || pageConfig.keywords || [],
        canonicalUrl: canonicalUrl || pageConfig.canonicalUrl,
        robots: robots || pageConfig.robots || 'index, follow',
    };

    // Build full title
    const fullTitle = noTemplate
        ? seo.title
        : (seo.title === site.defaultTitle ? seo.title : site.titleTemplate.replace('%s', seo.title));

    // Build full image URL
    const fullImageUrl = seo.image?.startsWith('http')
        ? seo.image
        : `${site.siteUrl}${seo.image}`;

    return (
        <Helmet>
            {/* Primary Meta Tags */}
            <title>{fullTitle}</title>
            <meta name="description" content={seo.description} />
            {seo.keywords.length > 0 && (
                <meta name="keywords" content={seo.keywords.join(', ')} />
            )}
            <meta name="robots" content={seo.robots} />
            <link rel="canonical" href={seo.canonicalUrl} />

            {/* Theme Color */}
            <meta name="theme-color" content={site.themeColor} />

            {/* Open Graph / Facebook */}
            <meta property="og:type" content={type} />
            <meta property="og:url" content={seo.canonicalUrl} />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={seo.description} />
            <meta property="og:image" content={fullImageUrl} />
            <meta property="og:site_name" content={site.name} />
            <meta property="og:locale" content={site.locale} />

            {/* Twitter Card */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:url" content={seo.canonicalUrl} />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={seo.description} />
            <meta name="twitter:image" content={fullImageUrl} />
            {site.twitterHandle && (
                <meta name="twitter:site" content={site.twitterHandle} />
            )}

            {/* Article-specific meta */}
            {type === 'article' && article && (
                <>
                    {article.publishedTime && (
                        <meta property="article:published_time" content={article.publishedTime} />
                    )}
                    {article.modifiedTime && (
                        <meta property="article:modified_time" content={article.modifiedTime} />
                    )}
                    {article.author && (
                        <meta property="article:author" content={article.author} />
                    )}
                    {article.section && (
                        <meta property="article:section" content={article.section} />
                    )}
                    {article.tags?.map((tag, index) => (
                        <meta key={index} property="article:tag" content={tag} />
                    ))}
                </>
            )}

            {/* Additional head elements */}
            {children}
        </Helmet>
    );
};

export default SEOHead;
