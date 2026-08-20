import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getPlacePhotos } from '../../utils/googleMaps';

const ClubGooglePhotos = ({ placeId }) => {
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        getPlacePhotos(placeId)
            .then((data) => { if (!cancelled) setResult(data); })
            .catch(() => { if (!cancelled) setResult(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [placeId]);

    if (loading) {
        return <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading Google photos…</p>;
    }
    if (!result?.photos?.length) return null;

    return (
        <div className="mt-4 pt-4 border-t border-white/10">
            <div className="mb-2.5 flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Photos from Google</p>
                {result.googleMapsUrl && (
                    <a href={result.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-white">
                        View on Google <ExternalLink size={10} />
                    </a>
                )}
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide no-scrollbar pb-1 sm:grid sm:grid-cols-4 lg:grid-cols-6 sm:overflow-visible">
                {result.photos.map((photo, index) => (
                    <figure key={photo.url} className="shrink-0 w-36 sm:w-auto m-0">
                        <a href={result.googleMapsUrl || photo.url} target="_blank" rel="noopener noreferrer">
                            <img src={photo.url} alt={`Club on Google ${index + 1}`} loading="lazy" className="w-full aspect-[4/3] rounded-xl object-cover border border-white/10" />
                        </a>
                        {photo.attributions.map((html) => (
                            <span key={html} className="block mt-1 text-[9px] text-gray-600 [&_a]:text-gray-500" dangerouslySetInnerHTML={{ __html: html }} />
                        ))}
                    </figure>
                ))}
            </div>
        </div>
    );
};

export default ClubGooglePhotos;
