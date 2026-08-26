const getYoutubeVideoId = (url) => {
    if (!url) return null;

    const source = String(url).trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(source)) return source;

    try {
        const parsedUrl = new URL(source);
        const hostname = parsedUrl.hostname.replace(/^www\./, '');

        if (hostname === 'youtu.be') {
            return parsedUrl.pathname.split('/').filter(Boolean)[0] || null;
        }

        if (hostname === 'youtube.com' || hostname === 'youtube-nocookie.com') {
            if (parsedUrl.pathname === '/watch') return parsedUrl.searchParams.get('v');

            const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
            if (['embed', 'live', 'shorts'].includes(pathParts[0])) {
                return pathParts[1] || null;
            }
        }
    } catch {
        return null;
    }

    return null;
};

export const getYoutubeWatchUrl = (url) => {
    const videoId = getYoutubeVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
};

export const getYoutubeEmbedUrl = (url) => {
    const videoId = getYoutubeVideoId(url);
    if (!videoId) return null;

    const params = new URLSearchParams({ rel: '0', playsinline: '1' });
    if (typeof window !== 'undefined' && window.location?.origin) {
        params.set('origin', window.location.origin);
    }

    return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
};
