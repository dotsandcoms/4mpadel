import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Calendar as CalendarIcon, User, Eye, FileText } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Helmet } from 'react-helmet-async';

const BlogPost = () => {
    const { slug } = useParams();
    const [post, setPost] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (slug) fetchPost();
    }, [slug]);

    const fetchPost = async () => {
        try {
            setLoading(true);

            // Increment views and fetch the post
            const { data, error } = await supabase
                .from('blogs')
                .select('*')
                .eq('slug', slug)
                .single();

            if (error) throw error;

            if (data) {
                setPost(data);

                // Fire and forget updating the views
                supabase.rpc('increment_blog_views', { blog_id: data.id })
                    .then(() => { })
                    .catch((e) => console.log('Notice: Could not increment views, ensure RPC is added later if needed.', e));
            }

        } catch (error) {
            console.error('Error fetching blog post:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="pt-32 pb-20 min-h-screen bg-gray-900 flex justify-center items-center">
                <div className="w-12 h-12 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="pt-32 min-h-screen bg-gray-900 pb-20 text-center flex flex-col items-center justify-center">
                <FileText className="w-20 h-20 text-gray-700 mb-6" />
                <h1 className="text-4xl font-bold text-white mb-4">Post Not Found</h1>
                <p className="text-gray-400 mb-8 max-w-md">The article you are looking for doesn't exist or has been removed.</p>
                <Link to="/blog" className="px-8 py-3 bg-padel-green text-black font-bold rounded-full hover:bg-white transition-colors">
                    Back to Blog
                </Link>
            </div>
        );
    }

    return (
        <div className="pt-32 pb-20 min-h-screen bg-gray-900 font-sans">
            <Helmet>
                <title>{post.title} | 4M Padel Blog</title>
                <meta name="description" content={`Read about ${post.title} on the 4M Padel Blog.`} />
            </Helmet>

            <div className="container mx-auto px-6 max-w-4xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    {/* Back Button */}
                    <Link to="/blog" className="inline-flex items-center gap-2 text-padel-green hover:text-white transition-colors font-bold mb-8 uppercase tracking-wider text-sm">
                        <ChevronLeft className="w-4 h-4" /> Back to Blog
                    </Link>

                    {/* Header */}
                    <div className="mb-10">
                        <div className="flex flex-wrap items-center gap-4 mb-6">
                            <span className="px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest bg-padel-green/20 text-padel-green border border-padel-green/30">
                                {post.category}
                            </span>
                            <div className="flex items-center gap-6 text-sm font-bold text-gray-400 uppercase tracking-widest">
                                <span className="flex items-center gap-2">
                                    <CalendarIcon className="w-4 h-4 text-padel-green" />
                                    {new Date(post.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                                <span className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-padel-green" />
                                    {post.author}
                                </span>
                            </div>
                        </div>

                        <h1 className="text-4xl md:text-6xl font-black text-white leading-tight mb-8">
                            {post.title}
                        </h1>

                        {/* Article Image */}
                        {post.image_url && (
                            <div className="w-full h-64 md:h-[500px] rounded-3xl overflow-hidden mb-12 border border-white/10 shadow-2xl relative">
                                <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 ring-1 ring-inset ring-black/10 rounded-3xl"></div>
                            </div>
                        )}

                        {/* Article Content */}
                        {/* Uses a prose class to auto-style raw HTML. Tailwind typography is usually needed, but we will write custom CSS if it's missing to ensure it looks good */}
                        <div
                            className="text-lg md:text-xl text-gray-300 leading-relaxed space-y-6 article-content"
                            dangerouslySetInnerHTML={{ __html: post.content }}
                        />
                    </div>

                    {/* Footer / Meta */}
                    <div className="border-t border-white/10 pt-8 mt-12 flex justify-between items-center text-gray-500 font-medium">
                        <div className="flex items-center gap-2">
                            <Eye className="w-5 h-5" />
                            {post.views} Views
                        </div>
                        <div className="flex gap-4">
                            {/* Simple social share placeholders */}
                            <button className="hover:text-padel-green transition-colors">Share</button>
                        </div>
                    </div>

                </motion.div>
            </div>

            {/* Inject custom styles for the article content so headers and paragraphs look great without massive typography plugins */}
            <style jsx="true">{`
                .article-content h1, 
                .article-content h2, 
                .article-content h3 {
                    color: white;
                    font-weight: 900;
                    margin-top: 2rem;
                    margin-bottom: 1rem;
                    line-height: 1.2;
                }
                .article-content h2 {
                    font-size: 2rem;
                    color: #CCFF00;
                }
                .article-content h3 {
                    font-size: 1.5rem;
                }
                .article-content p {
                    margin-bottom: 1.5rem;
                }
                .article-content a {
                    color: #CCFF00;
                    text-decoration: underline;
                }
                .article-content ul, 
                .article-content ol {
                    margin-bottom: 1.5rem;
                    padding-left: 1.5rem;
                }
                .article-content li {
                    margin-bottom: 0.5rem;
                }
                .article-content strong {
                    color: white;
                }
            `}</style>
        </div>
    );
};

export default BlogPost;
