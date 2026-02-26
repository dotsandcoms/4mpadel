import React from 'react';
import { Helmet } from 'react-helmet-async';
import { seoConfig } from '../config';

/**
 * Schema.org JSON-LD Component
 * Generates structured data for search engines
 * 
 * Supported schema types:
 * - WebSite, WebPage, Organization
 * - Article, BlogPosting, Blog
 * - LocalBusiness, Service
 * - BreadcrumbList
 * - FAQPage, HowTo
 * - Product, Offer
 * - ContactPage
 */
const SchemaOrg = ({
    type = 'WebPage',
    name,
    description,
    url,
    image,
    datePublished,
    dateModified,
    author,
    breadcrumbs,
    faq,
    services,
    customSchema,
    includeOrganization = true,
    includeWebSite = false,
}) => {
    const { site, organization } = seoConfig;
    const schemas = [];

    // Organization Schema
    if (includeOrganization) {
        const orgSchema = {
            '@type': 'Organization',
            '@id': `${site.siteUrl}/#organization`,
            name: organization.name,
            url: organization.url,
            logo: {
                '@type': 'ImageObject',
                url: organization.logo,
            },
        };

        if (organization.email) {
            orgSchema.email = organization.email;
        }
        if (organization.phone) {
            orgSchema.telephone = organization.phone;
        }
        if (organization.sameAs?.length > 0) {
            orgSchema.sameAs = organization.sameAs;
        }
        if (organization.address?.streetAddress) {
            orgSchema.address = {
                '@type': 'PostalAddress',
                ...organization.address,
            };
        }

        schemas.push(orgSchema);
    }

    // WebSite Schema
    if (includeWebSite) {
        schemas.push({
            '@type': 'WebSite',
            '@id': `${site.siteUrl}/#website`,
            url: site.siteUrl,
            name: site.name,
            description: site.tagline,
            publisher: {
                '@id': `${site.siteUrl}/#organization`,
            },
            potentialAction: {
                '@type': 'SearchAction',
                target: `${site.siteUrl}/search?q={search_term_string}`,
                'query-input': 'required name=search_term_string',
            },
        });
    }

    // Main page schema based on type
    const pageSchema = {
        '@type': type,
        name: name || site.name,
        description: description,
        url: url,
    };

    if (image) {
        pageSchema.image = image.startsWith('http') ? image : `${site.siteUrl}${image}`;
    }

    // Add type-specific properties
    switch (type) {
        case 'Article':
        case 'BlogPosting':
            if (datePublished) pageSchema.datePublished = datePublished;
            if (dateModified) pageSchema.dateModified = dateModified;
            if (author) {
                pageSchema.author = {
                    '@type': 'Person',
                    name: author,
                };
            }
            pageSchema.publisher = {
                '@id': `${site.siteUrl}/#organization`,
            };
            break;

        case 'Blog':
            pageSchema.blogPost = []; // Can be populated with blog posts
            break;

        case 'LocalBusiness':
            Object.assign(pageSchema, {
                address: {
                    '@type': 'PostalAddress',
                    ...organization.address,
                },
                telephone: organization.phone,
                email: organization.email,
            });
            break;

        case 'Service':
            pageSchema.provider = {
                '@id': `${site.siteUrl}/#organization`,
            };
            break;

        case 'ContactPage':
            pageSchema.mainEntity = {
                '@id': `${site.siteUrl}/#organization`,
            };
            break;

        default:
            break;
    }

    // Only add page schema if it has content beyond the basic structure
    if (name || description || url) {
        schemas.push(pageSchema);
    }

    // BreadcrumbList Schema
    if (breadcrumbs && breadcrumbs.length > 0) {
        schemas.push({
            '@type': 'BreadcrumbList',
            itemListElement: breadcrumbs.map((crumb, index) => ({
                '@type': 'ListItem',
                position: index + 1,
                name: crumb.name,
                item: crumb.url.startsWith('http') ? crumb.url : `${site.siteUrl}${crumb.url}`,
            })),
        });
    }

    // FAQPage Schema
    if (faq && faq.length > 0) {
        schemas.push({
            '@type': 'FAQPage',
            mainEntity: faq.map((item) => ({
                '@type': 'Question',
                name: item.question,
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: item.answer,
                },
            })),
        });
    }

    // Services Schema (for service pages)
    if (services && services.length > 0) {
        services.forEach((service) => {
            schemas.push({
                '@type': 'Service',
                name: service.name,
                description: service.description,
                provider: {
                    '@id': `${site.siteUrl}/#organization`,
                },
                serviceType: service.type,
                areaServed: service.areaServed || 'Worldwide',
            });
        });
    }

    // Custom schema (allows full flexibility)
    if (customSchema) {
        schemas.push(customSchema);
    }

    // Build the final JSON-LD
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': schemas,
    };

    return (
        <Helmet>
            <script type="application/ld+json">
                {JSON.stringify(jsonLd, null, 0)}
            </script>
        </Helmet>
    );
};

export default SchemaOrg;
