import React, { useEffect, useState } from 'react';
import { Star, ExternalLink, Loader2, User } from 'lucide-react';
import { getPlaceReviews } from '../../utils/googleMaps';

const StarRow = ({ value, size = 12 }) => (
    <div className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
            <Star
                key={n}
                size={size}
                className={n <= Math.round(value || 0) ? 'text-amber-400 fill-amber-400' : 'text-white/15'}
            />
        ))}
    </div>
);

/**
 * Live Google review widget — fetched fresh on every view via the Places JS
 * library, never persisted to our DB. Google's Places API terms require review
 * content to be requested live and shown with attribution, not cached long-term.
 * Renders nothing if the club has no google_place_id or Google returns no reviews.
 */
const ClubReviews = ({ placeId, accent = '#ccff00' }) => {
    const [state, setState] = useState(() => ({
        status: placeId ? 'loading' : 'idle', result: null, error: null,
    }));

    useEffect(() => {
        if (!placeId) return undefined;
        let cancelled = false;
        getPlaceReviews(placeId)
            .then((result) => {
                if (!cancelled) setState({ status: 'ready', result, error: null });
            })
            .catch((err) => {
                if (!cancelled) setState({ status: 'error', result: null, error: err });
            });
        return () => { cancelled = true; };
    }, [placeId]);

    if (!placeId) return null;

    if (state.status === 'loading') {
        return (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                <Loader2 size={14} className="animate-spin" /> Loading Google reviews…
            </div>
        );
    }

    // Fail quiet — this is a nice-to-have widget, not core club info.
    if (state.status !== 'ready' || !state.result) return null;

    const { result } = state;
    const reviews = Array.isArray(result.reviews) ? result.reviews.slice(0, 5) : [];
    if (reviews.length === 0 && !result.rating) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                    {result.rating != null && (
                        <>
                            <span className="text-2xl font-display font-bold text-white">{result.rating.toFixed(1)}</span>
                            <div>
                                <StarRow value={result.rating} size={13} />
                                {result.user_ratings_total != null && (
                                    <p className="text-[10px] text-gray-500 mt-0.5">
                                        {result.user_ratings_total.toLocaleString()} Google reviews
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
                {result.url && (
                    <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest"
                        style={{ color: accent }}
                    >
                        View on Google <ExternalLink size={11} />
                    </a>
                )}
            </div>

            {reviews.length > 0 && (
                <div className="flex gap-3 overflow-x-auto scrollbar-hide no-scrollbar pb-1">
                    {reviews.map((r, idx) => (
                        <a
                            key={idx}
                            href={r.author_url || result.url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 w-64 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-white/20 transition-colors"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-full overflow-hidden border border-white/10 bg-white/5 shrink-0">
                                    {r.profile_photo_url ? (
                                        <img src={r.profile_photo_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <User size={14} className="text-gray-500" />
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-white truncate">{r.author_name}</p>
                                    <p className="text-[9px] text-gray-500">{r.relative_time_description}</p>
                                </div>
                            </div>
                            <StarRow value={r.rating} size={10} />
                            {r.text && (
                                <p className="text-[11px] text-gray-400 mt-2 line-clamp-4">{r.text}</p>
                            )}
                        </a>
                    ))}
                </div>
            )}

            <p className="text-[9px] text-gray-600 uppercase tracking-wider">Reviews via Google — not stored, fetched live</p>
        </div>
    );
};

export default ClubReviews;
