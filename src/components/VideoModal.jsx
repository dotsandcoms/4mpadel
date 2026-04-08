import React from 'react';
import { motion } from 'framer-motion';
import { X, PlayCircle } from 'lucide-react';

export const getYoutubeEmbedUrl = (url) => {
    if (!url) return null;
    
    // If it's already a full embed URL, just return it
    if (url.includes('youtube.com/embed/')) return url;
    
    let videoId = null;

    if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1].split(/[?#]/)[0];
    } else if (url.includes('youtube.com/watch')) {
        const urlParams = new URLSearchParams(new URL(url).search);
        videoId = urlParams.get('v');
    } else if (url.includes('youtube.com/live/')) {
        videoId = url.split('live/')[1].split(/[?#]/)[0];
    } else if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
        // If it looks like a raw 11-char YouTube ID
        videoId = url;
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : null;
};

const VideoModal = ({ isOpen, onClose, videoUrl, title }) => {
    if (!isOpen) return null;

    const embedUrl = getYoutubeEmbedUrl(videoUrl);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-sm shadow-2xl"
            />
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="relative w-full max-w-5xl aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl z-10"
            >
                <div className="absolute top-4 right-4 z-20">
                    <button
                        onClick={onClose}
                        className="p-2 bg-black/40 hover:bg-black/60 text-white rounded-full backdrop-blur-md transition-colors border border-white/10"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {embedUrl ? (
                    <iframe
                        src={embedUrl}
                        title={title || "YouTube video player"}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white p-8">
                        <PlayCircle className="w-16 h-16 text-padel-green/20 mb-4" />
                        <p className="text-xl font-bold">Unable to load video</p>
                        <p className="text-gray-400 mt-2 text-center">Invalid YouTube source or video ID provided.</p>
                        <button
                            onClick={() => window.open(videoUrl.includes('http') ? videoUrl : `https://youtube.com/watch?v=${videoUrl}`, '_blank')}
                            className="mt-6 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-padel-green transition-colors"
                        >
                            Open on YouTube
                        </button>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default VideoModal;
