import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageIcon, X } from 'lucide-react';

export default function EventMediaGallery({ images, eventName }) {
    const [selectedIndex, setSelectedIndex] = useState(null);
    const dialogRef = useRef(null);
    const isOpen = selectedIndex !== null;
    const movePhoto = (direction) => setSelectedIndex((index) =>
        (index + direction + images.length) % images.length);

    useEffect(() => {
        if (!isOpen) return;
        const dialog = dialogRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    return (
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm" aria-label="Event photos">
            <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 sm:px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#CCFF00]/20">
                    <ImageIcon className="h-4 w-4 text-[#0a0a0a]" aria-hidden="true" />
                </div>
                <h2 className="text-sm font-semibold text-slate-900">Event Photos</h2>
                <span className="ml-auto text-xs text-gray-500">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 sm:gap-3 sm:p-5">
                {images.map((url, index) => (
                    <button
                        key={url}
                        type="button"
                        onClick={() => setSelectedIndex(index)}
                        aria-label={`View photo ${index + 1} of ${images.length} from ${eventName}`}
                        className="aspect-[3/4] cursor-zoom-in overflow-hidden rounded-lg bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                        <img src={url} alt={`${eventName} — photo ${index + 1}`} width="600" height="800" loading="lazy" className="h-full w-full object-contain" />
                    </button>
                ))}
            </div>
            <dialog
                ref={dialogRef}
                aria-label={`${eventName} photo viewer`}
                onCancel={(event) => { event.preventDefault(); setSelectedIndex(null); }}
                onClose={() => setSelectedIndex(null)}
                onClick={(event) => { if (event.target === event.currentTarget) setSelectedIndex(null); }}
                onKeyDown={(event) => {
                    if (images.length < 2) return;
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                        event.preventDefault();
                        movePhoto(event.key === 'ArrowLeft' ? -1 : 1);
                    }
                }}
                className="m-auto w-[calc(100%-2rem)] max-w-5xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a0a0a] p-0 text-white backdrop:bg-black/85"
            >
                <div>
                    <div className="flex items-center justify-between gap-3 px-4 py-2">
                        <p className="truncate text-sm">{eventName}</p>
                        <button type="button" aria-label="Close photo viewer" onClick={() => setSelectedIndex(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#CCFF00]">
                            <X size={22} aria-hidden="true" />
                        </button>
                    </div>
                    <div className="flex h-[70dvh] items-center justify-center bg-black">
                        {isOpen && <img src={images[selectedIndex]} alt={`${eventName} — photo ${selectedIndex + 1}`} className="h-full w-full object-contain" />}
                    </div>
                    <div className="flex items-center justify-center gap-4 px-4 py-2">
                        {images.length > 1 && <button type="button" aria-label="Previous photo" onClick={() => movePhoto(-1)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#CCFF00]"><ChevronLeft size={22} aria-hidden="true" /></button>}
                        <p className="text-sm text-gray-300" aria-live="polite">{isOpen ? selectedIndex + 1 : 0} / {images.length}</p>
                        {images.length > 1 && <button type="button" aria-label="Next photo" onClick={() => movePhoto(1)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-[#CCFF00]"><ChevronRight size={22} aria-hidden="true" /></button>}
                    </div>
                </div>
            </dialog>
        </section>
    );
}
