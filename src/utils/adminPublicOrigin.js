export function adminPublicOrigin() {
    return import.meta.env?.VITE_ADMIN_REVIEW_PUBLIC_ORIGIN || window.location.origin;
}

export function adminSecurityHref() {
    return import.meta.env?.VITE_ADMIN_REVIEW_PUBLIC_ORIGIN ? '/admin-preview/security' : '/admin?tab=security';
}
