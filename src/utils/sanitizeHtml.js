import DOMPurify from 'dompurify';

/**
 * Sanitise rich-text HTML before rendering with dangerouslySetInnerHTML.
 *
 * Org users (semi-trusted outsiders) author event descriptions, rules,
 * sanctioning details etc. via the RichTextEditor — this strips scripts,
 * event handlers and javascript: URLs while keeping normal formatting.
 */
export const sanitizeHtml = (html) => {
    if (!html) return '';
    return DOMPurify.sanitize(String(html), {
        ALLOWED_TAGS: [
            'a', 'b', 'strong', 'i', 'em', 'u', 's', 'p', 'br', 'hr', 'span', 'div',
            'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'
        ],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'class', 'style'],
        ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    });
};

/**
 * Sanitise a user-supplied URL for use in href attributes.
 * Returns null for anything that isn't plain http(s).
 */
export const safeUrl = (url) => {
    if (!url) return null;
    const trimmed = String(url).trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Bare domains get https:// prefixed; reject anything with a scheme
    if (/^[a-z0-9.-]+\.[a-z]{2,}([/?#].*)?$/i.test(trimmed.replace(/^www\./i, 'www.'))) {
        return `https://${trimmed}`;
    }
    return null;
};
