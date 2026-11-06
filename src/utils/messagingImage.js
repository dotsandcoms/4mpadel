export function eventProfileImage(value, origin) {
    if (!value || !origin) return null;
    try {
        const image = new URL(value), app = new URL(origin);
        if (image.protocol !== 'https:' || image.origin !== app.origin || image.username || image.password
            || !/^\/storage\/v1\/(?:object|render\/image)\/public\/profile-pics\//.test(image.pathname)) return null;
        return image.origin + image.pathname;
    } catch { return null; }
}
