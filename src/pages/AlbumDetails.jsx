import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Image as ImageIcon } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

const AlbumDetails = () => {
    const { id } = useParams();
    const [album, setAlbum] = useState(null);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);

    useEffect(() => {
        const fetchAlbumAndImages = async () => {
            try {
                // Fetch Album
                const { data: albumData, error: albumError } = await supabase
                    .from('albums')
                    .select('*')
                    .eq('id', id)
                    .eq('is_active', true)
                    .single();

                if (albumError) throw albumError;
                setAlbum(albumData);

                // Fetch Images
                const { data: imagesData, error: imagesError } = await supabase
                    .from('gallery_images')
                    .select('*')
                    .eq('album_id', id)
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true }); // old ones first generally makes sense for chronological event photos

                if (imagesError) throw imagesError;
                setImages(imagesData || []);

            } catch (error) {
                console.error("Error fetching album details:", error);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchAlbumAndImages();
        }
    }, [id]);

    // Handle Keyboard Navigation for Lightbox
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (selectedImageIndex === null) return;

            if (e.key === 'Escape') setSelectedImageIndex(null);
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImageIndex, images.length]);

    const nextImage = () => {
        setSelectedImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    };

    const prevImage = () => {
        setSelectedImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    };


    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0D14] flex justify-center items-center">
                <div className="w-16 h-16 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!album) {
        return (
            <div className="min-h-screen bg-[#0A0D14] flex flex-col justify-center items-center px-4">
                <h2 className="text-3xl font-bold text-white mb-4">Album Not Found</h2>
                <Link to="/gallery" className="text-padel-green hover:underline">Return to Gallery</Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0A0D14] pt-8 md:pt-24 pb-12 relative overflow-x-hidden">
            <Helmet>
                <title>{`${album.title} | 4M Padel Gallery`}</title>
            </Helmet>

            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-10 lg:px-16">
                {/* Header */}
                <div className="mb-8 md:mb-20">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <Link
                            to="/gallery"
                            className="inline-flex items-center text-padel-green font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs hover:translate-x-[-8px] transition-transform mb-6 sm:mb-8 group"
                        >
                            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 mr-3 group-hover:scale-110 transition-transform" />
                            Back to Collection
                        </Link>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4 sm:space-y-6"
                    >
                        <h1 className="text-4xl sm:text-6xl md:text-[8rem] font-black text-white tracking-tighter uppercase leading-[0.8] mb-4 sm:mb-8 transition-all">{album.title}</h1>
                        <div className="flex items-center gap-3 sm:gap-4 text-white/40 font-black text-[9px] sm:text-xs uppercase tracking-[0.3em]">
                            <span className="text-padel-green">
                                {new Date(album.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                            </span>
                            <div className="w-[1px] h-3 sm:h-4 bg-white/10" />
                            <span>{images.length} Photos</span>
                        </div>
                        {album.description && (
                            <p className="text-gray-400 text-sm sm:text-lg md:text-2xl max-w-4xl font-medium leading-relaxed opacity-60 border-l-[2px] sm:border-l-[3px] border-padel-green/30 pl-4 sm:pl-8 mt-6 sm:mt-10">
                                {album.description}
                            </p>
                        )}
                    </motion.div>
                </div>

                {/* Masonry / Grid Layout - 4 columns on mobile */}
                {images.length === 0 ? (
                    <div className="text-center py-20 bg-[#1E293B]/10 rounded-2xl border border-white/5">
                        <ImageIcon className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">No Images Yet</h3>
                    </div>
                ) : (
                    <div className="columns-4 sm:columns-2 md:columns-3 lg:columns-4 gap-2 sm:gap-4 space-y-2 sm:space-y-4">
                        {images.map((img, index) => (
                                <motion.div
                                    key={img.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    whileInView={{ opacity: 1, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: (index % 10) * 0.02, duration: 0.3 }}
                                    whileHover={{ scale: 1.05, zIndex: 10 }}
                                    className="break-inside-avoid relative cursor-zoom-in overflow-hidden rounded-md sm:rounded-2xl bg-slate-900 border border-white/5 shadow-sm sm:shadow-lg"
                                    onClick={() => setSelectedImageIndex(index)}
                                >
                                    <img
                                        src={img.thumbnail_url || img.image_url}
                                        alt={img.caption || album.title}
                                        className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-slate-900/10 transition-colors duration-300" />
                                </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lightbox Modal with Swipe Support */}
            <AnimatePresence>
                {selectedImageIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-2 sm:p-8 select-none"
                    >
                        {/* Close Button */}
                        <button
                            className="absolute top-6 right-6 p-4 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all z-[1110] active:scale-95"
                            onClick={() => setSelectedImageIndex(null)}
                        >
                            <X size={24} />
                        </button>

                        {/* Prev Button */}
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all z-[1110] active:scale-90"
                            onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        >
                            <ArrowLeft size={32} className="w-6 h-6 sm:w-8 sm:h-8" />
                        </button>

                        {/* Next Button */}
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-all z-[1110] rotate-180 active:scale-90"
                            onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        >
                            <ArrowLeft size={32} className="w-6 h-6 sm:w-8 sm:h-8" />
                        </button>

                        {/* Main Image Container */}
                        <div
                            className="relative w-full h-full flex flex-col items-center justify-center"
                            onClick={() => setSelectedImageIndex(null)}
                        >
                            <div 
                                className="relative flex flex-col items-center justify-center pointer-events-auto"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <motion.img
                                    key={selectedImageIndex}
                                    drag="x"
                                    dragConstraints={{ left: 0, right: 0 }}
                                    dragElastic={0.7}
                                    onDragEnd={(e, info) => {
                                        const swipeThreshold = 50;
                                        if (info.offset.x < -swipeThreshold) {
                                            nextImage();
                                        } else if (info.offset.x > swipeThreshold) {
                                            prevImage();
                                        }
                                    }}
                                    initial={{ opacity: 0, x: 100 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -100 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    src={images[selectedImageIndex].image_url}
                                    alt="Gallery Full"
                                    className="max-w-[95vw] sm:max-w-7xl max-h-[80vh] sm:max-h-[85vh] object-contain rounded-xl shadow-2xl cursor-grab active:cursor-grabbing"
                                />
                                
                                <div className="mt-8 flex flex-col items-center gap-2">
                                    <div className="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/10">
                                        <p className="text-white font-black text-xs uppercase tracking-widest leading-none">
                                            {selectedImageIndex + 1} <span className="text-white/40 mx-1">/</span> {images.length}
                                        </p>
                                    </div>
                                    <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.2em] animate-pulse hidden sm:block">
                                        Swipe or arrows to navigate
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AlbumDetails;
