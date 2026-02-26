import React, { useEffect, useRef } from 'react';
import { seoConfig } from '../config';

/**
 * Image SEO Component
 * 
 * Automatically enhances images with:
 * - Alt text (if missing) based on filename or title
 * - Title attribute (if configured)
 * - Lazy loading support
 * - Case transformation
 */
const ImageSEO = ({ children }) => {
    const observerRef = useRef(null);
    const { imageSeo } = seoConfig.site;

    // Helper to format text based on settings
    const formatText = (text, format, caseType) => {
        if (!text) return '';

        // Remove file extension and hyphens/underscores
        let cleanText = text.split('/').pop().split('.')[0]
            .replace(/[-_]/g, ' ');

        // Apply templates (simple implementation)
        let processed = format.replace('%filename%', cleanText);

        // precise case transformation
        switch (caseType) {
            case 'titleCase':
                return processed.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
            case 'sentenceCase':
                return processed.charAt(0).toUpperCase() + processed.slice(1).toLowerCase();
            case 'lowerCase':
                return processed.toLowerCase();
            case 'upperCase':
                return processed.toUpperCase();
            default:
                return processed;
        }
    };

    useEffect(() => {
        if (!imageSeo) return;

        // Function to process images
        const processImages = () => {
            const images = document.querySelectorAll('img');

            images.forEach(img => {
                // Auto Alt Text
                if (imageSeo.autoAlt && !img.alt) {
                    img.alt = formatText(img.src, imageSeo.altFormat, imageSeo.changeCase);
                }

                // Auto Title
                if (imageSeo.autoTitle && !img.title) {
                    img.title = formatText(img.src, imageSeo.titleFormat, imageSeo.changeCase);
                }

                // Lazy Loading
                if (imageSeo.lazyLoad && !img.loading) {
                    img.loading = 'lazy';
                }
            });
        };

        // Run initially
        processImages();

        // Set up mutation observer to handle dynamically added images
        observerRef.current = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.addedNodes.length) {
                    processImages();
                }
            });
        });

        observerRef.current.observe(document.body, {
            childList: true,
            subtree: true
        });

        return () => {
            if (observerRef.current) {
                observerRef.current.disconnect();
            }
        };
    }, [imageSeo]);

    // This component doesn't render anything itself, it just attaches the behavior
    // But we return children to allow wrapping if needed in future
    return <>{children}</>;
};

export default ImageSEO;
