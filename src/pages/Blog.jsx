import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Eye, Calendar as CalendarIcon, User } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const Blog = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            // Only fetch published posts for the public page
            const { data, error } = await supabase
                .from('blogs')
                .select('*')
                .eq('status', 'Published')
                .order('date', { ascending: false });

            if (error) throw error;
            setPosts(data || []);
        } catch (error) {
            console.error('Error fetching blog posts:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="pt-24 min-h-screen bg-gray-900 pb-20">
            <div className="container mx-auto px-6 max-w-6xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12"
                >
                    <div className="inline-block px-4 py-1 rounded-full bg-padel-green/20 text-padel-green text-sm font-bold mb-4 border border-padel-green/30 uppercase tracking-widest">
                        Latest News
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-white mb-6 uppercase tracking-tighter">
                        Our <span className="text-padel-green">Blog</span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-2xl">
                        Stay updated with the latest news, coaching tips, and event coverage from the world of South African Padel.
                    </p>
                </motion.div>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="w-12 h-12 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
                    </div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-md">
                        <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">No Posts Yet</h3>
                        <p className="text-gray-400">Check back soon for the latest updates.</p>
                    </div>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {posts.map((post, index) => (
                            <motion.div
                                key={post.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className="group bg-white/5 border border-white/10 rounded-3xl overflow-hidden hover:bg-white/10 transition-all duration-300 hover:border-padel-green shadow-xl flex flex-col"
                            >
                                {/* Image or Placeholder Header */}
                                <div className="h-48 bg-black/40 relative overflow-hidden flex items-center justify-center">
                                    <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent z-10"></div>
                                    {post.image_url ? (
                                        <img
                                            src={post.image_url}
                                            alt={post.title}
                                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-padel-green/50 transform group-hover:scale-110 transition-transform duration-500 bg-gradient-to-br from-black/60 to-padel-green/10">
                                            <FileText className="w-16 h-16 opacity-50" />
                                        </div>
                                    )}
                                    {/* Category Badge */}
                                    <div className="absolute top-4 left-4 z-20">
                                        <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-black/80 text-padel-green backdrop-blur-md border border-white/10">
                                            {post.category}
                                        </span>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-6 flex-1 flex flex-col">
                                    <div className="flex items-center gap-4 text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
                                        <span className="flex items-center gap-1">
                                            <CalendarIcon className="w-3 h-3 text-padel-green" />
                                            {new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <User className="w-3 h-3 text-padel-green" />
                                            {post.author}
                                        </span>
                                    </div>

                                    <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-padel-green transition-colors line-clamp-2">
                                        {post.title}
                                    </h3>

                                    <div className="mt-auto flex items-center justify-between pt-6 border-t border-white/10">
                                        <Link
                                            to={`/blog/${post.slug || post.id}`}
                                            className="text-sm font-bold text-white group-hover:text-padel-green transition-colors flex items-center gap-2"
                                        >
                                            Read Article <span className="text-xl leading-none">→</span>
                                        </Link>
                                        <span className="flex items-center gap-1 text-xs text-gray-500 font-medium">
                                            <Eye className="w-4 h-4" />
                                            {post.views}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Blog;
