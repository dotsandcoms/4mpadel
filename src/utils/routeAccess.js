const PUBLIC_EXACT = ['/reset-password', '/contact', '/rankings'];

/** Routes accessible without signing in */
export function isPublicRoute(pathname) {
    if (pathname === '/') return true;
    return PUBLIC_EXACT.includes(pathname);
}

/** Member-only routes (modal / gate — excludes admin which has its own auth) */
export function requiresAuth(pathname) {
    if (pathname.startsWith('/admin') || pathname.startsWith('/reports')) {
        return false;
    }
    return !isPublicRoute(pathname);
}
