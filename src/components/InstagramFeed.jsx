import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { Instagram, Heart, MessageCircle, Share2, Play, ChevronLeft, ChevronRight, ExternalLink, Volume2, VolumeX } from 'lucide-react';

const PROXY_BASE = 'https://uzglrpbixubfijvjbtgz.supabase.co/functions/v1/sync-instagram?proxyUrl=';
const proxify = (url) => url ? `${PROXY_BASE}${encodeURIComponent(url)}` : null;

/**
 * InstagramFeed — Self-hosted Instagram feed component.
 *
 * Reads cached posts from Supabase `instagram_posts` table.
 * Supports IMAGE, VIDEO, and CAROUSEL_ALBUM media types.
 *
 * @param {string}  handle      - Instagram handle to display (matches instagram_feeds.instagram_handle)
 * @param {number}  limit       - Max posts to show (default 9)
 * @param {string}  accentColor - Optional accent colour for the header (default: Instagram gradient)
 * @param {boolean} showHeader  - Show the "Follow the Action" header (default: false — use your own)
 */
const InstagramFeed = ({ handle, limit = 9, accentColor, showHeader = false }) => {
    const [posts, setPosts] = useState([]);
    const [feedInfo, setFeedInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [expandedPost, setExpandedPost] = useState(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        const fetchPosts = async () => {
            setLoading(true);
            try {
                // Fetch feed info
                const { data: feed } = await supabase
                    .from('instagram_feeds')
                    .select('*')
                    .eq('instagram_handle', handle)
                    .maybeSingle();

                if (feed) setFeedInfo(feed);

                // Fetch posts
                const { data: postsData, error } = await supabase
                    .from('instagram_posts')
                    .select('*')
                    .eq('feed_id', feed?.id)
                    .eq('is_visible', true)
                    .order('timestamp', { ascending: false })
                    .limit(limit);

                if (error) throw error;
                setPosts(postsData || []);
            } catch (err) {
                console.error('InstagramFeed error:', err);
            } finally {
                setLoading(false);
            }
        };

        if (handle) fetchPosts();
    }, [handle, limit]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const truncateCaption = (caption, maxLen = 80) => {
        if (!caption) return '';
        if (caption.length <= maxLen) return caption;
        return caption.substring(0, maxLen).trim() + '...';
    };

    const scrollContainer = (direction) => {
        if (!scrollRef.current) return;
        const scrollAmount = 340;
        scrollRef.current.scrollBy({
            left: direction === 'left' ? -scrollAmount : scrollAmount,
            behavior: 'smooth'
        });
    };

    if (loading) {
        return (
            <div className="w-full">
                <div className="flex gap-4 overflow-hidden pb-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex-none w-[300px] sm:w-[320px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
                            <div className="flex items-center gap-3 p-4 border-b border-gray-50">
                                <div className="w-9 h-9 rounded-full bg-gray-200" />
                                <div className="flex-1">
                                    <div className="w-24 h-3 bg-gray-200 rounded mb-1.5" />
                                    <div className="w-16 h-2.5 bg-gray-100 rounded" />
                                </div>
                            </div>
                            <div className="aspect-square bg-gray-100" />
                            <div className="p-4">
                                <div className="w-full h-3 bg-gray-100 rounded mb-2" />
                                <div className="w-2/3 h-3 bg-gray-100 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="w-full text-center py-12">
                <Instagram className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-400 text-sm font-medium">No posts yet. Connect your Instagram to start syncing.</p>
            </div>
        );
    }

    return (
        <>
            <div className="w-full relative group/feed">
                {/* Scroll Arrows (desktop) */}
                <button
                    onClick={() => scrollContainer('left')}
                    className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 items-center justify-center text-gray-600 hover:text-black hover:shadow-xl transition-all opacity-0 group-hover/feed:opacity-100"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                    onClick={() => scrollContainer('right')}
                    className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white shadow-lg border border-gray-100 items-center justify-center text-gray-600 hover:text-black hover:shadow-xl transition-all opacity-0 group-hover/feed:opacity-100"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>

                {/* Posts Carousel */}
                <div
                    ref={scrollRef}
                    className="flex gap-4 overflow-x-auto pb-3 snap-x snap-mandatory hide-scrollbar scroll-smooth"
                >
                    {posts.map((post, idx) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            feedInfo={feedInfo}
                            formatDate={formatDate}
                            truncateCaption={truncateCaption}
                            onExpand={() => setExpandedPost(post)}
                            index={idx}
                        />
                    ))}
                </div>
            </div>

            {/* Expanded Post Modal */}
            <AnimatePresence>
                {expandedPost && (
                    <PostModal
                        post={expandedPost}
                        feedInfo={feedInfo}
                        formatDate={formatDate}
                        onClose={() => setExpandedPost(null)}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

// ── Individual Post Card ──────────────────────────────────────────────────────

const PostCard = ({ post, feedInfo, formatDate, truncateCaption, onExpand, index }) => {
    const [carouselIdx, setCarouselIdx] = useState(0);
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);

    const isVideo = post.media_type === 'VIDEO';
    const isCarousel = post.media_type === 'CAROUSEL_ALBUM';
    const children = post.children || [];

    const handleVideoToggle = (e) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play();
            setIsPlaying(true);
        }
    };

    const handleMuteToggle = (e) => {
        e.stopPropagation();
        if (!videoRef.current) return;
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const getCarouselMedia = () => {
        if (!isCarousel || children.length === 0) return null;
        return children[carouselIdx];
    };

    const currentCarouselItem = getCarouselMedia();

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex-none w-[280px] sm:w-[310px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden snap-start group hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
        >
            {/* Header: Profile + Date + IG Icon */}
            <div className="flex items-center justify-between p-3.5 border-b border-gray-50">
                <div className="flex items-center gap-2.5 min-w-0">
                    {feedInfo?.profile_picture_url ? (
                        <img
                            src={proxify(feedInfo.profile_picture_url)}
                            alt={feedInfo.instagram_handle}
                            className="w-8 h-8 rounded-full object-cover border border-gray-100"
                            referrerPolicy="no-referrer"
                        />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                            <Instagram className="w-4 h-4 text-white" />
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 truncate leading-tight">
                            @{feedInfo?.instagram_handle || 'instagram'}
                        </p>
                        <p className="text-[11px] text-gray-400 font-medium leading-tight">
                            {formatDate(post.timestamp)}
                        </p>
                    </div>
                </div>
                <a
                    href={post.permalink || feedInfo?.profile_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-gray-300 hover:text-pink-500 transition-colors shrink-0"
                >
                    <Instagram className="w-5 h-5" />
                </a>
            </div>

            {/* Caption Preview (above media, like Elfsight style) */}
            {post.caption && (
                <div className="px-3.5 py-2.5 border-b border-gray-50">
                    <p className="text-[12.5px] text-gray-600 leading-snug line-clamp-3">
                        {post.caption.split('\n')[0]}
                    </p>
                    {post.caption.length > 80 && (
                        <button
                            onClick={onExpand}
                            className="text-[11px] text-blue-500 font-semibold mt-0.5 hover:text-blue-600"
                        >
                            Read more
                        </button>
                    )}
                </div>
            )}

            {/* Media Area */}
            <div
                className="relative aspect-square bg-gray-50 cursor-pointer overflow-hidden"
                onClick={isVideo ? handleVideoToggle : onExpand}
            >
                {isVideo ? (
                    <>
                        <video
                            ref={videoRef}
                            src={proxify(post.media_url)}
                            poster={proxify(post.thumbnail_url) || undefined}
                            muted={isMuted}
                            playsInline
                            loop
                            preload="metadata"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                        />
                        {/* Play overlay */}
                        {!isPlaying && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg backdrop-blur-sm">
                                    <Play className="w-6 h-6 text-gray-900 ml-0.5" fill="currentColor" />
                                </div>
                            </div>
                        )}
                        {/* Video type badge */}
                        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
                            <Play className="w-3 h-3 text-white" fill="white" />
                        </div>
                        {/* Mute toggle (when playing) */}
                        {isPlaying && (
                            <button
                                onClick={handleMuteToggle}
                                className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                            >
                                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            </button>
                        )}
                    </>
                ) : isCarousel ? (
                    <>
                        {currentCarouselItem?.media_type === 'VIDEO' ? (
                            <video
                                src={proxify(currentCarouselItem.media_url)}
                                muted
                                playsInline
                                loop
                                preload="metadata"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                            />
                        ) : (
                            <img
                                src={proxify(currentCarouselItem?.media_url || post.media_url)}
                                alt=""
                                className="w-full h-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                            />
                        )}
                        {/* Carousel indicator badge */}
                        <div className="absolute top-3 right-3 bg-black/50 backdrop-blur-sm rounded-lg px-2 py-1">
                            <div className="flex items-center gap-1">
                                <div className="grid grid-cols-2 gap-[2px]">
                                    <div className="w-1.5 h-1.5 rounded-[1px] bg-white" />
                                    <div className="w-1.5 h-1.5 rounded-[1px] bg-white/60" />
                                    <div className="w-1.5 h-1.5 rounded-[1px] bg-white/60" />
                                    <div className="w-1.5 h-1.5 rounded-[1px] bg-white/40" />
                                </div>
                            </div>
                        </div>
                        {/* Carousel dots */}
                        {children.length > 1 && (
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                                {children.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={(e) => { e.stopPropagation(); setCarouselIdx(i); }}
                                        className={`rounded-full transition-all ${i === carouselIdx
                                            ? 'w-2 h-2 bg-white shadow-md'
                                            : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/70'
                                            }`}
                                    />
                                ))}
                            </div>
                        )}
                        {/* Carousel arrows */}
                        {children.length > 1 && (
                            <>
                                {carouselIdx > 0 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCarouselIdx(prev => prev - 1); }}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white transition-colors"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                )}
                                {carouselIdx < children.length - 1 && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCarouselIdx(prev => prev + 1); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-700 hover:bg-white transition-colors"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <img
                        src={proxify(post.media_url)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                    />
                )}
            </div>

            {/* Footer: Engagement */}
            <div className="flex items-center justify-between px-3.5 py-3 mt-auto">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Heart className="w-4 h-4" />
                        {post.like_count > 0 && (
                            <span className="text-[12px] font-semibold">{post.like_count}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <MessageCircle className="w-4 h-4" />
                        {post.comments_count > 0 && (
                            <span className="text-[12px] font-semibold">{post.comments_count}</span>
                        )}
                    </div>
                </div>
                <a
                    href={post.permalink || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Share2 className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">Share</span>
                </a>
            </div>
        </motion.div>
    );
};

// ── Expanded Post Modal ───────────────────────────────────────────────────────

const PostModal = ({ post, feedInfo, formatDate, onClose }) => {
    const videoRef = useRef(null);
    const [carouselIdx, setCarouselIdx] = useState(0);
    const [isMuted, setIsMuted] = useState(true);

    const isVideo = post.media_type === 'VIDEO';
    const isCarousel = post.media_type === 'CAROUSEL_ALBUM';
    const children = post.children || [];
    const currentChild = isCarousel && children.length > 0 ? children[carouselIdx] : null;

    // Close on escape
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-3xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col md:flex-row shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Media Side */}
                <div className="relative w-full md:w-1/2 aspect-square bg-black flex-shrink-0">
                    {isVideo ? (
                        <>
                            <video
                                ref={videoRef}
                                src={proxify(post.media_url)}
                                poster={proxify(post.thumbnail_url) || undefined}
                                muted={isMuted}
                                playsInline
                                autoPlay
                                loop
                                className="w-full h-full object-contain"
                                referrerPolicy="no-referrer"
                            />
                            <button
                                onClick={() => {
                                    if (videoRef.current) {
                                        videoRef.current.muted = !isMuted;
                                        setIsMuted(!isMuted);
                                    }
                                }}
                                className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                            >
                                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                            </button>
                        </>
                    ) : isCarousel && currentChild ? (
                        <>
                            {currentChild.media_type === 'VIDEO' ? (
                                <video
                                    src={proxify(currentChild.media_url)}
                                    muted
                                    playsInline
                                    autoPlay
                                    loop
                                    className="w-full h-full object-contain"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <img src={proxify(currentChild.media_url || post.media_url)} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            )}
                            {children.length > 1 && (
                                <>
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                                        {children.map((_, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setCarouselIdx(i)}
                                                className={`rounded-full transition-all ${i === carouselIdx ? 'w-2.5 h-2.5 bg-white' : 'w-2 h-2 bg-white/50'}`}
                                            />
                                        ))}
                                    </div>
                                    {carouselIdx > 0 && (
                                        <button onClick={() => setCarouselIdx(p => p - 1)} className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                                            <ChevronLeft className="w-5 h-5 text-gray-700" />
                                        </button>
                                    )}
                                    {carouselIdx < children.length - 1 && (
                                        <button onClick={() => setCarouselIdx(p => p + 1)} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 shadow-lg flex items-center justify-center">
                                            <ChevronRight className="w-5 h-5 text-gray-700" />
                                        </button>
                                    )}
                                </>
                            )}
                        </>
                    ) : (
                        <img src={proxify(post.media_url)} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                    )}
                </div>

                {/* Details Side */}
                <div className="w-full md:w-1/2 flex flex-col min-h-0">
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-gray-100">
                        <div className="flex items-center gap-3">
                            {feedInfo?.profile_picture_url ? (
                                <img src={proxify(feedInfo.profile_picture_url)} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-100" referrerPolicy="no-referrer" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                                    <Instagram className="w-5 h-5 text-white" />
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-bold text-gray-900">@{feedInfo?.instagram_handle || 'instagram'}</p>
                                <p className="text-xs text-gray-400">{formatDate(post.timestamp)}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                        >
                            <span className="text-gray-500 text-lg leading-none">&times;</span>
                        </button>
                    </div>

                    {/* Caption */}
                    <div className="flex-1 overflow-y-auto p-5">
                        {post.caption && (
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">
                                {post.caption}
                            </p>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t border-gray-100 p-5 flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="flex items-center gap-1.5 text-gray-500">
                                <Heart className="w-5 h-5" />
                                <span className="text-sm font-semibold">{post.like_count || 0}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-gray-500">
                                <MessageCircle className="w-5 h-5" />
                                <span className="text-sm font-semibold">{post.comments_count || 0}</span>
                            </div>
                        </div>
                        <a
                            href={post.permalink || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 text-white text-xs font-bold hover:shadow-lg transition-all"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View on Instagram
                        </a>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default InstagramFeed;
