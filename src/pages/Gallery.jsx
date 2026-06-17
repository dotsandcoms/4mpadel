import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, ArrowLeft, Instagram } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

const Gallery = () => {
    const [albums, setAlbums] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAlbums = async () => {
            try {
                const { data, error } = await supabase
                    .from('albums')
                    .select('*')
                    .is('parent_album_id', null)
                    .order('is_featured', { ascending: false, nullsFirst: false })
                    .order('created_at', { ascending: false });

                if (error) throw error;
                setAlbums(data || []);
            } catch (error) {
                console.error("Error fetching albums:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAlbums();
    }, []);

    const featuredAlbums = albums.filter(a => a.is_featured);
    const regularAlbums = albums.filter(a => !a.is_featured);

    const renderAlbumCard = (album, index) => (
        <motion.div
            key={album.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
        >
            <Link
                to={`/gallery/${album.slug || album.id}`}
                className="group relative block bg-slate-900/60 border border-white/5 rounded-2xl md:rounded-[3rem] overflow-hidden hover:border-padel-green/40 transition-all duration-700 shadow-xl h-full flex flex-col"
            >
                <div className="relative aspect-[16/11] overflow-hidden bg-slate-950">
                    {album.cover_image_url ? (
                        <img
                            src={album.cover_image_url}
                            alt={album.title}
                            className="w-full h-full object-cover object-top transition-transform duration-[1.5s] group-hover:scale-110"
                            loading="lazy"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-900">
                            <ImageIcon className="w-10 h-10 text-slate-800" />
                        </div>
                    )}
                    
                    {/* Immersive Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent opacity-90 group-hover:opacity-100 transition-opacity duration-700" />
                    
                    <div className="absolute inset-x-0 bottom-0 p-4 md:p-8 transform group-hover:-translate-y-2 transition-transform duration-700">
                        <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
                            <div className="px-2 md:px-4 py-0.5 md:py-1.5 rounded-full bg-padel-green/10 border border-padel-green/30 backdrop-blur-xl">
                                <p className="text-padel-green text-[7px] md:text-[11px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                                    {new Date(album.album_date || album.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            {album.is_featured && (
                                <div className="px-2 md:px-4 py-0.5 md:py-1.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-xl">
                                    <p className="text-yellow-400 text-[7px] md:text-[11px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                                        Featured
                                    </p>
                                </div>
                            )}
                        </div>
                        <h3 className="text-lg md:text-3xl lg:text-4xl font-black text-white leading-[1] uppercase tracking-tighter mb-2 md:mb-4 group-hover:text-white transition-colors line-clamp-2">
                            {album.title}
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-gray-500 font-black text-[7px] md:text-[10px] uppercase tracking-[0.3em] group-hover:text-padel-green transition-all duration-500">
                                <span>Enter</span>
                                <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 rotate-180 group-hover:translate-x-2 transition-transform duration-500" />
                            </div>

                            {(album.photographer_name || album.photographer_instagram) && (
                                <div className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors">
                                    <p className="text-[7px] md:text-[9px] font-bold uppercase tracking-widest hidden sm:block text-white">Photos by</p>
                                    <a 
                                        href={album.photographer_instagram ? `https://instagram.com/${album.photographer_instagram.replace('@', '')}` : '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-1.5 text-[7px] md:text-[9px] font-black uppercase tracking-widest text-padel-green/80 hover:text-padel-green transition-all"
                                    >
                                        {album.photographer_instagram && <Instagram size={10} className="md:w-3 md:h-3" />}
                                        {album.photographer_instagram || album.photographer_name}
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    </div>
                
                {album.description && (
                    <div className="p-4 md:p-8 pt-2 flex-grow bg-slate-900/40 hidden md:block">
                        <p className="text-gray-400 text-xs md:text-sm font-medium line-clamp-2 leading-relaxed opacity-60 italic border-l-[2px] md:border-l-[3px] border-padel-green/30 pl-4 md:pl-6 group-hover:opacity-100 transition-opacity duration-700">
                            {album.description}
                        </p>
                    </div>
                )}
            </Link>
        </motion.div>
    );

    return (
        <div className="pt-4 md:pt-24 pb-4 md:pb-2 min-h-[60vh] relative overflow-hidden bg-[#0A0D14]">
            <Helmet>
                <title>Gallery | 4M Padel</title>
                <meta name="description" content="View our latest photo galleries from 4M Padel tournaments and events." />
            </Helmet>

            {/* Background Effects */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-padel-green/5 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-padel-green/10 rounded-full blur-[150px] translate-y-1/2 -translate-x-1/4" />
            </div>

            <div className="relative z-10 w-full max-w-[1800px] mx-auto px-4 sm:px-10 lg:px-16">
                {/* Unified Header */}
                <section className="relative z-20 flex flex-col justify-start pt-6 md:pt-12 lg:pt-16 pb-4 md:pb-12">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-6 max-w-fit">
                        <ImageIcon className="w-3 h-3" />
                        <span>Official Gallery</span>
                    </div>

                    <div className="overflow-hidden mb-6">
                        <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal">
                            OUR <span className="text-transparent bg-clip-text bg-gradient-to-r from-padel-green to-[#beff00]">GALLERY</span>
                        </h1>
                    </div>

                    <p className="text-gray-200 text-sm md:text-lg lg:text-xl max-w-4xl mb-2 leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal">
                        <strong className="text-white font-medium">Capturing the intensity, the passion, and the legendary moments on the 4M courts.</strong>
                    </p>
                </section>

                {loading ? (
                    <div className="flex flex-col justify-center items-center py-40 space-y-6">
                        <div className="w-24 h-24 border-[3px] border-padel-green/10 border-t-padel-green rounded-full animate-spin"></div>
                        <p className="text-padel-green font-black text-xs uppercase tracking-[0.3em] animate-pulse">Loading Archive</p>
                    </div>
                ) : albums.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-40 bg-white/5 rounded-[3rem] border border-dashed border-white/10"
                    >
                        <ImageIcon className="w-20 h-20 text-white/10 mx-auto mb-8" />
                        <h3 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">Gallery is Empty</h3>
                        <p className="text-gray-500 font-bold text-lg">New memories are currently being processed.</p>
                    </motion.div>
                ) : (
                    <div className="space-y-12 md:space-y-20 pb-12">
                        {featuredAlbums.length > 0 && (
                            <div>
                                <div className="flex items-center gap-4 mb-6 md:mb-10">
                                    <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">Featured <span className="text-yellow-400">Albums</span></h2>
                                    <div className="flex-1 h-px bg-gradient-to-r from-yellow-400/50 to-transparent"></div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-8">
                                    {featuredAlbums.map((album, index) => renderAlbumCard(album, index))}
                                </div>
                            </div>
                        )}

                        {regularAlbums.length > 0 && (
                            <div>
                                <div className="flex items-center gap-4 mb-6 md:mb-10">
                                    <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter">All <span className="text-padel-green">Albums</span></h2>
                                    <div className="flex-1 h-px bg-gradient-to-r from-padel-green/50 to-transparent"></div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-8">
                                    {regularAlbums.map((album, index) => renderAlbumCard(album, index))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Gallery;
