import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Image as ImageIcon, ArrowLeft } from 'lucide-react';
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

    return (
        <div className="pt-24 pb-12 min-h-screen relative overflow-hidden bg-[#0A0D14]">
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
                {/* Stylistic WOW Header - Full Width Style */}
                <div className="relative pt-20 pb-32 overflow-hidden">
                    {/* Background Translucent Watermark (Now scaled for true full width) */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none w-full flex items-center justify-center -rotate-2 overflow-hidden opacity-[0.03]">
                        <h2 className="text-[20vw] font-black text-white uppercase tracking-tighter w-full text-center leading-none whitespace-nowrap">
                            Moments
                        </h2>
                    </div>

                    <div className="relative z-10 text-center flex flex-col items-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-padel-green/10 border border-padel-green/20 px-6 py-2 rounded-full text-padel-green text-[10px] md:text-xs font-black uppercase tracking-[0.4em] mb-10"
                        >
                            4M Padel Official Gallery
                        </motion.div>
                        
                        <motion.h1 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-6xl sm:text-8xl md:text-[10rem] font-black text-white tracking-tighter uppercase mb-8 leading-[0.8] drop-shadow-2xl"
                        >
                            Our <span className="text-padel-green">Gallery</span>
                        </motion.h1>
                        
                        <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-lg md:text-2xl text-gray-400 max-w-3xl font-medium leading-relaxed px-4"
                        >
                            Capturing the intensity, the passion, and the legendary moments on the 4M courts.
                        </motion.p>
                    </div>
                </div>

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
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12 pb-32">
                        {albums.map((album, index) => (
                            <motion.div
                                key={album.id}
                                initial={{ opacity: 0, y: 40 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-100px" }}
                                transition={{ delay: index * 0.05, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="h-full"
                            >
                                <Link
                                    to={`/gallery/${album.id}`}
                                    className="group relative block bg-slate-900/60 border border-white/5 rounded-[3rem] overflow-hidden hover:border-padel-green/40 transition-all duration-700 shadow-3xl h-full flex flex-col"
                                >
                                    <div className="relative aspect-[16/11] overflow-hidden bg-slate-950">
                                        {album.cover_image_url ? (
                                            <img
                                                src={album.cover_image_url}
                                                alt={album.title}
                                                className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                                <ImageIcon className="w-16 h-16 text-slate-800" />
                                            </div>
                                        )}
                                        
                                        {/* Immersive Overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent opacity-90 group-hover:opacity-100 transition-opacity duration-700" />
                                        
                                        <div className="absolute inset-x-0 bottom-0 p-10 transform group-hover:-translate-y-2 transition-transform duration-700">
                                            <div className="flex items-center gap-3 mb-5">
                                                <div className="px-4 py-1.5 rounded-full bg-padel-green/10 border border-padel-green/30 backdrop-blur-xl">
                                                    <p className="text-padel-green text-[11px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                                                        {new Date(album.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                            </div>
                                            <h3 className="text-4xl md:text-5xl font-black text-white leading-[0.9] uppercase tracking-tighter mb-6 group-hover:text-white transition-colors">
                                                {album.title}
                                            </h3>
                                            <div className="flex items-center gap-3 text-gray-500 font-black text-xs uppercase tracking-[0.3em] group-hover:text-padel-green transition-all duration-500">
                                                <span>Enter Gallery</span>
                                                <ArrowLeft className="w-5 h-5 rotate-180 group-hover:translate-x-3 transition-transform duration-500" />
                                            </div>
                                        </div>

                                        {/* Floating Action Button */}
                                        <div className="absolute top-8 right-8 w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0 shadow-2xl">
                                            <ImageIcon size={24} className="text-padel-green" />
                                        </div>
                                    </div>
                                    
                                    {album.description && (
                                        <div className="p-10 pt-4 flex-grow bg-slate-900/40">
                                            <p className="text-gray-400 text-base font-medium line-clamp-3 leading-relaxed opacity-60 italic border-l-[3px] border-padel-green/30 pl-6 group-hover:opacity-100 transition-opacity duration-700">
                                                {album.description}
                                            </p>
                                        </div>
                                    )}
                                </Link>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Gallery;
