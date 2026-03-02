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
        <div className="min-h-screen bg-[#0A0D14] pt-24 pb-20 relative">
            <Helmet>
                <title>{`${album.title} | 4M Padel Gallery`}</title>
            </Helmet>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="mb-12">
                    <Link
                        to="/gallery"
                        className="inline-flex items-center text-gray-400 hover:text-white transition-colors mb-6 group"
                    >
                        <ArrowLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                        Back to Galleries
                    </Link>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 uppercase">{album.title}</h1>
                        {album.description && (
                            <p className="text-xl text-gray-400 max-w-3xl border-l-4 border-padel-green pl-4">
                                {album.description}
                            </p>
                        )}
                    </motion.div>
                </div>

                {/* Masonry / Grid Layout */}
                {images.length === 0 ? (
                    <div className="text-center py-32 bg-[#1E293B]/20 rounded-2xl border border-white/5">
                        <ImageIcon className="w-24 h-24 text-gray-700 mx-auto mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">No Images Yet</h3>
                        <p className="text-gray-500">This album is currently empty.</p>
                    </div>
                ) : (
                    <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
                        {images.map((img, index) => (
                            <motion.div
                                key={img.id}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05, duration: 0.3 }}
                                className="break-inside-avoid relative group cursor-zoom-in overflow-hidden rounded-xl bg-black/50 border border-white/10"
                                onClick={() => setSelectedImageIndex(index)}
                            >
                                <img
                                    src={img.image_url}
                                    alt={img.caption || album.title}
                                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lightbox Modal */}
            <AnimatePresence>
                {selectedImageIndex !== null && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
                        onClick={() => setSelectedImageIndex(null)}
                    >
                        {/* Close Button */}
                        <button
                            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-50"
                            onClick={() => setSelectedImageIndex(null)}
                        >
                            <X size={24} />
                        </button>

                        {/* Prev Button */}
                        <button
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors z-50 hidden sm:block"
                            onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        >
                            <ArrowLeft size={32} />
                        </button>

                        {/* Next Button */}
                        <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/5 hover:bg-white/10 rounded-full text-white transition-colors z-50 hidden sm:block rotate-180"
                            onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        >
                            <ArrowLeft size={32} />
                        </button>

                        {/* Main Image */}
                        <div
                            className="relative max-w-7xl max-h-full flex flex-col items-center justify-center"
                            onClick={(e) => e.stopPropagation()} // Prevent click from closing modal
                        >
                            <motion.img
                                key={selectedImageIndex}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                src={images[selectedImageIndex].image_url}
                                alt="Gallery Full"
                                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                            />
                            <div className="text-gray-400 mt-4 text-sm font-medium">
                                {selectedImageIndex + 1} / {images.length}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AlbumDetails;
