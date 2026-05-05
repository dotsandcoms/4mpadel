import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, X, Image as ImageIcon, PlayCircle, Play, Loader, Lock, UserPlus, Instagram } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import VideoModal from '../components/VideoModal';
import AuthModal from '../components/AuthModal';

const AlbumDetails = () => {
    const { slug } = useParams();
    const [album, setAlbum] = useState(null);
    const [images, setImages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedImageIndex, setSelectedImageIndex] = useState(null);
    const [activeTab, setActiveTab] = useState('photos'); // 'photos' or 'video'
    const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState(null);
    const [playlistVideos, setPlaylistVideos] = useState([]);
    const [fetchingVideos, setFetchingVideos] = useState(false);
    const [videoModal, setVideoModal] = useState({ isOpen: false, url: '', title: '' });
    const [session, setSession] = useState(null);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        const fetchAlbumAndImages = async () => {
            try {
                // Fetch Album
                // Fetch Album - Try Slug first, then ID as fallback 
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
                let albumQuery = supabase.from('albums').select('*').eq('is_active', true);
                
                if (isUUID) {
                    albumQuery = albumQuery.or(`slug.eq.${slug},id.eq.${slug}`);
                } else {
                    albumQuery = albumQuery.eq('slug', slug);
                }

                const { data: albumData, error: albumError } = await albumQuery.single();

                if (albumError) throw albumError;
                setAlbum(albumData);

                // Fetch Images
                const { data: imagesData, error: imagesError } = await supabase
                    .from('gallery_images')
                    .select('*')
                    .eq('album_id', albumData.id)
                    .order('sort_order', { ascending: true })
                    .order('created_at', { ascending: true }); // old ones first generally makes sense for chronological event photos

                if (imagesError) throw imagesError;
                setImages(imagesData || []);

                // Fetch YouTube Playlist - Prioritize Album's own URL, then fallback to Event
                if (albumData.youtube_playlist_url) {
                    setYoutubePlaylistUrl(albumData.youtube_playlist_url);
                } else if (albumData.event_id) {
                    const { data: eventData } = await supabase
                        .from('calendar')
                        .select('youtube_playlist_url')
                        .eq('id', albumData.event_id)
                        .single();
                    
                    if (eventData?.youtube_playlist_url) {
                        setYoutubePlaylistUrl(eventData.youtube_playlist_url);
                    }
                }

            } catch (error) {
                console.error("Error fetching album details:", error);
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchAlbumAndImages();
        }
    }, [slug]);

    useEffect(() => {
        const fetchPlaylistItems = async () => {
            if (!youtubePlaylistUrl) return;

            const match = youtubePlaylistUrl.match(/[&?]list=([^&]+)/);
            const playlistId = match ? match[1] : null;
            if (!playlistId) return;

            setFetchingVideos(true);
            try {
                const response = await fetch(
                    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=12&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`
                );
                const data = await response.json();
                if (data.items) {
                    setPlaylistVideos(data.items
                        .filter(item =>
                            item.snippet.title !== 'Deleted video' &&
                            item.snippet.title !== 'Private video'
                        )
                        .map(item => ({
                            id: item.snippet.resourceId.videoId,
                            title: item.snippet.title,
                            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
                            publishedAt: item.snippet.publishedAt
                        }))
                    );
                }
            } catch (error) {
                console.error('Error fetching playlist videos:', error);
            } finally {
                setFetchingVideos(false);
            }
        };

        fetchPlaylistItems();
    }, [youtubePlaylistUrl, YOUTUBE_API_KEY]);

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
        <div className="min-h-screen bg-[#0A0D14] pt-4 md:pt-24 pb-12 relative overflow-x-hidden">
            <Helmet>
                <title>{`${album.title} | 4M Padel Gallery`}</title>
                <meta property="og:title" content={`${album.title} | 4M Padel Gallery`} />
                <meta property="og:description" content={album.description || "View official tournament action shots and media highlights on 4M Padel."} />
                <meta property="og:type" content="article" />
                {images[0]?.image_url && <meta property="og:image" content={images[0].image_url} />}
            </Helmet>

            {/* Cinematic Hero Section - Full Width & Square */}
            <div className="relative mb-8 md:mb-16 overflow-hidden bg-slate-900 shadow-2xl border-b border-white/5 min-h-[35vh] md:min-h-[45vh] flex items-center">
                {/* Dynamic Background Image Layer */}
                <AnimatePresence mode="wait">
                    <motion.div 
                        key={images[0]?.image_url || 'fallback'}
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1.2 }}
                        className="absolute inset-0"
                    >
                        {images[0]?.image_url ? (
                            <img 
                                src={images[0].image_url} 
                                alt="" 
                                className="w-full h-full object-cover blur-2xl opacity-30 scale-105"
                            />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-black" />
                        )}
                        {/* Deep Vignette Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent" />
                    </motion.div>
                </AnimatePresence>

                {/* Header Content */}
                <div className="relative z-10 w-full max-w-[1800px] mx-auto px-4 sm:px-10 lg:px-16 py-8 md:py-12">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                    >
                        <Link
                            to="/gallery"
                            className="inline-flex items-center text-padel-green font-black uppercase tracking-[0.2em] text-[9px] sm:text-xs hover:translate-x-[-8px] transition-all mb-6 md:mb-10 group bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-3 group-hover:scale-110 transition-transform" />
                            Back to Collection
                        </Link>
                    </motion.div>

                    {/* Title Group with Watermark - Centered Content */}
                    <div className="relative flex flex-col items-center">
                        {/* Massive Background Watermark Title (Centered Behind) */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none opacity-[0.03] whitespace-nowrap overflow-hidden w-full text-center z-0">
                            <h2 className="text-[10vw] font-black text-white uppercase tracking-tighter leading-none">
                                {album.title}
                            </h2>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, y: 40 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-4 md:space-y-8 relative z-10 flex flex-col items-center text-center"
                        >
                            <div className="flex flex-col items-center">
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-padel-green/10 border border-padel-green/20 text-padel-green text-[10px] md:text-xs font-black uppercase tracking-[0.2em] mb-4 md:mb-5"
                                >
                                    <div className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
                                    <span>Official Album</span>
                                </motion.div>
                                
                                <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tighter uppercase leading-[0.9] transition-all drop-shadow-2xl">
                                    {album.title}
                                </h1>
                            </div>

                            <div className="flex flex-wrap items-center justify-center gap-4 text-white/40 font-black text-[9px] sm:text-xs uppercase tracking-[0.3em]">
                                <div className="px-5 py-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white flex items-center gap-3">
                                    <span className="text-padel-green font-black">
                                        {new Date(album.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                    </span>
                                </div>
                                <div className="px-5 py-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white flex items-center gap-3">
                                    <span className="text-padel-green">{images.length}</span>
                                    <span className="opacity-40">MOMENTS CAPTURED</span>
                                </div>
                                {album.photographer_name && (
                                    <div className="px-5 py-2.5 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 text-white flex items-center gap-3">
                                        <span className="opacity-40">PHOTOS BY</span>
                                        <a 
                                            href={album.photographer_instagram ? `https://instagram.com/${album.photographer_instagram.replace('@', '')}` : '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-padel-green hover:text-white transition-colors flex items-center gap-2"
                                        >
                                            {album.photographer_instagram && <Instagram size={14} />}
                                            {album.photographer_name}
                                        </a>
                                    </div>
                                )}
                            </div>

                            {album.description && (
                                <p className="text-gray-400 text-sm sm:text-lg md:text-xl max-w-3xl font-medium leading-relaxed opacity-60 border-l-[3px] border-padel-green/30 pl-6 md:pl-8 mt-5 md:mt-8 mx-auto">
                                    {album.description}
                                </p>
                            )}

                            {/* Rankings-style Tab Navigation */}
                            {youtubePlaylistUrl && (
                                <div className="flex items-center gap-1 md:gap-2 mt-8 bg-white/5 p-1 rounded-2xl md:rounded-full border border-white/10 w-full md:max-w-fit mx-auto backdrop-blur-xl">
                                    {[
                                        { id: 'photos', label: 'Action Shots', icon: <ImageIcon className="w-3.5 h-3.5 md:w-4 md:h-4" /> },
                                        { id: 'video', label: 'Video', icon: <PlayCircle className="w-3.5 h-3.5 md:w-4 md:h-4" /> }
                                    ].map((tab) => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-4 md:px-8 py-2 md:py-3 rounded-xl md:rounded-full text-[10px] md:text-xs font-black uppercase tracking-[0.2em] transition-all duration-300 ${activeTab === tab.id
                                                ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20'
                                                : 'text-gray-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            {tab.icon}
                                            <span className="truncate">{tab.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </div>
            </div>

            <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-10 lg:px-16">
                <AnimatePresence mode="wait">
                        {activeTab === 'photos' ? (
                            <motion.div
                                key="photos-grid"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                {/* Masonry / Grid Layout - 4 columns on mobile */}
                                {images.length === 0 ? (
                                    <div className="text-center py-10 bg-[#1E293B]/10 rounded-2xl border border-white/5">
                                        <ImageIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                                        <h3 className="text-sm font-bold text-white uppercase">Archive is Empty</h3>
                                    </div>
                                ) : (
                                    <div className="columns-4 sm:columns-2 md:columns-3 lg:columns-4 gap-1 sm:gap-4 space-y-1 sm:space-y-4">
                                        {images.map((img, index) => (
                                            <motion.div
                                                key={img.id}
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                transition={{ delay: (index % 10) * 0.03, duration: 0.4 }}
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
                            </motion.div>
                        ) : (
                            <motion.div
                                key="video-player"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="max-w-7xl mx-auto"
                            >
                                {fetchingVideos ? (
                                    <div className="flex flex-col items-center justify-center py-24 bg-white/5 rounded-[2rem] border border-white/10 backdrop-blur-xl">
                                        <Loader className="w-10 h-10 animate-spin text-padel-green mb-4" />
                                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">Loading highlights...</p>
                                    </div>
                                ) : playlistVideos.length > 0 ? (
                                    <div className="grid grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-8">
                                        {playlistVideos.map((video) => (
                                            <motion.div
                                                key={video.id}
                                                whileHover={{ y: -8 }}
                                                className="group relative cursor-pointer"
                                                onClick={() => setVideoModal({ isOpen: true, url: video.id, title: video.title })}
                                            >
                                                <div className="aspect-video rounded-2xl overflow-hidden bg-slate-900 relative shadow-lg group-hover:shadow-2xl transition-all duration-500 border border-white/5">
                                                    <img 
                                                        src={video.thumbnail} 
                                                        alt={video.title} 
                                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                                    />
                                                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100">
                                                        <div className="w-14 h-14 rounded-full bg-padel-green text-black flex items-center justify-center shadow-2xl backdrop-blur-sm">
                                                            <Play className="w-7 h-7 fill-current ml-1" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-4 px-2">
                                                    <h3 className="font-bold text-white line-clamp-2 group-hover:text-padel-green transition-colors leading-snug tracking-tight text-base">{video.title}</h3>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-20 bg-white/5 rounded-[2rem] border border-white/10">
                                        <PlayCircle className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                                        <h3 className="text-base font-bold text-white uppercase tracking-wider">No highlights available</h3>
                                    </div>
                                )}
                            </motion.div>
                        )}
                </AnimatePresence>
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

            <VideoModal
                isOpen={videoModal.isOpen}
                onClose={() => setVideoModal({ ...videoModal, isOpen: false })}
                videoUrl={videoModal.url}
                title={videoModal.title}
            />

            <AuthModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
            />
        </div>
    );
};

export default AlbumDetails;
