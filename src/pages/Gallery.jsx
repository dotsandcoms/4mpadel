import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
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
                    .eq('is_active', true)
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
        <div className="pt-24 pb-16 min-h-screen relative overflow-hidden bg-[#0A0D14]">
            <Helmet>
                <title>Gallery | 4M Padel</title>
                <meta name="description" content="View our latest photo galleries from 4M Padel tournaments and events." />
            </Helmet>

            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute -top-40 -right-40 w-96 h-96 bg-padel-green/10 rounded-full blur-[100px]" />
                <div className="absolute top-1/2 -left-40 w-96 h-96 bg-padel-green/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                    >
                        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 uppercase tracking-tight">
                            Our <span className="text-padel-green">Gallery</span>
                        </h1>
                        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                            Relive the best moments from our tournaments and events.
                        </p>
                    </motion.div>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-16 h-16 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
                    </div>
                ) : albums.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-32"
                    >
                        <ImageIcon className="w-24 h-24 text-gray-600 mx-auto mb-6" />
                        <h3 className="text-2xl font-bold text-white mb-2">No Albums Yet</h3>
                        <p className="text-gray-400">Check back soon for photo updates</p>
                    </motion.div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {albums.map((album, index) => (
                            <motion.div
                                key={album.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                <Link
                                    to={`/gallery/${album.id}`}
                                    className="group block bg-[#1E293B]/50 border border-white/10 rounded-2xl overflow-hidden hover:border-padel-green/50 transition-all duration-300"
                                >
                                    <div className="relative aspect-[4/3] overflow-hidden bg-black/50">
                                        {album.cover_image_url ? (
                                            <img
                                                src={album.cover_image_url}
                                                alt={album.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <ImageIcon className="w-16 h-16 text-white/20" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                                        <div className="absolute inset-x-0 bottom-0 p-6 translate-y-2 group-hover:translate-y-0 transition-transform">
                                            <h3 className="text-2xl font-bold text-white mb-1 drop-shadow-lg">{album.title}</h3>
                                            <p className="text-padel-green text-sm font-medium drop-shadow-md">
                                                {new Date(album.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    {album.description && (
                                        <div className="p-4 bg-black/40">
                                            <p className="text-gray-400 text-sm line-clamp-2">{album.description}</p>
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
