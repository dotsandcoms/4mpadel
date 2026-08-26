import React from 'react';
import { motion as Motion } from 'framer-motion';
import { X, PlayCircle, ExternalLink } from 'lucide-react';
import { getYoutubeEmbedUrl, getYoutubeWatchUrl } from '../utils/youtube';

const VideoModal = ({ isOpen, onClose, videoUrl, title }) => {
    if (!isOpen) return null;

    const embedUrl = getYoutubeEmbedUrl(videoUrl);
    const watchUrl = getYoutubeWatchUrl(videoUrl);

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 md:p-8">
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/90 backdrop-blur-sm shadow-2xl"
            />
            <Motion.div
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
                    <>
                        <iframe
                            src={embedUrl}
                            title={title || "YouTube video player"}
                            className="w-full h-full border-0"
                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allowFullScreen
                        />
                        {watchUrl && (
                            <a
                                href={watchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute bottom-4 left-4 z-20 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:bg-black/90"
                            >
                                Open on YouTube
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        )}
                    </>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white p-8">
                        <PlayCircle className="w-16 h-16 text-padel-green/20 mb-4" />
                        <p className="text-xl font-bold">Unable to load video</p>
                        <p className="text-gray-400 mt-2 text-center">Invalid YouTube source or video ID provided.</p>
                        {watchUrl && (
                            <a
                                href={watchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-6 px-6 py-2 bg-white text-black font-bold rounded-full hover:bg-padel-green transition-colors"
                            >
                                Open on YouTube
                            </a>
                        )}
                    </div>
                )}
            </Motion.div>
        </div>
    );
};

export default VideoModal;
