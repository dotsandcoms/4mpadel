import React from 'react';
import { motion } from 'framer-motion';
import { Play, Clock, Tag, ChevronRight, Share2, Heart } from 'lucide-react';

const videos = [
    {
        title: 'The Perfect Grip: Continental Masterclass',
        category: 'Foundations',
        duration: '12:45',
        thumbnail: '/Users/bradein/.gemini/antigravity/brain/ea660605-3d9d-41ec-922b-e2b6d1a0c0cc/video_thumbnail_1_1772098916234.png',
        views: '1.2k',
        difficulty: 'Beginner'
    },
    {
        title: 'Mastering the Bandeja: Power & Precision',
        category: 'Advanced Tactics',
        duration: '18:20',
        thumbnail: 'https://images.unsplash.com/photo-1594470117722-da435a34074a?auto=format&fit=crop&q=80&w=800',
        views: '2.5k',
        difficulty: 'Advanced'
    },
    {
        title: 'Court Positioning & Transition Play',
        category: 'Strategy',
        duration: '15:10',
        thumbnail: 'https://images.unsplash.com/photo-1626248801379-51a0748a5f96?auto=format&fit=crop&q=80&w=800',
        views: '980',
        difficulty: 'Intermediate'
    },
    {
        title: 'Defensive Glass Play: Walls are your Friends',
        category: 'Defense',
        duration: '09:30',
        thumbnail: 'https://images.unsplash.com/photo-1521412644187-c49fa0b4e6a5?auto=format&fit=crop&q=80&w=800',
        views: '1.8k',
        difficulty: 'Intermediate'
    },
    {
        title: 'Serving Strategy: Low, Fast & Deep',
        category: 'Technical',
        duration: '07:45',
        thumbnail: 'https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800',
        views: '3.2k',
        difficulty: 'Beginner'
    },
    {
        title: 'Advanced Volley Placement: Finding the Gap',
        category: 'Technical',
        duration: '22:15',
        thumbnail: 'https://images.unsplash.com/photo-1616091093714-c64882e9ab55?auto=format&fit=crop&q=80&w=800',
        views: '1.5k',
        difficulty: 'Pro'
    }
];

const VideoCard = ({ video, index }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.1 }}
        className="group bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] overflow-hidden hover:bg-white/10 transition-all duration-500"
    >
        {/* Thumbnail */}
        <div className="relative aspect-video overflow-hidden">
            <img
                src={video.thumbnail}
                alt={video.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <div className="w-16 h-16 bg-padel-green text-black rounded-full flex items-center justify-center scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 shadow-2xl">
                    <Play className="w-8 h-8 fill-current" />
                </div>
            </div>

            {/* Duration Badge */}
            <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/80 backdrop-blur-md text-white text-[10px] font-bold rounded-lg border border-white/10">
                <Clock className="w-3 h-3 inline mr-1" /> {video.duration}
            </div>

            {/* Difficulty Badge */}
            <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg ${video.difficulty === 'Beginner' ? 'bg-blue-500 text-white' :
                video.difficulty === 'Intermediate' ? 'bg-amber-500 text-black' :
                    video.difficulty === 'Advanced' ? 'bg-red-500 text-white' :
                        'bg-padel-green text-black'
                }`}>
                {video.difficulty}
            </div>
        </div>

        {/* Content */}
        <div className="p-6">
            <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black text-padel-green uppercase tracking-widest px-2 py-1 bg-padel-green/10 rounded-md">
                    {video.category}
                </span>
                <span className="text-gray-500 text-[10px] font-bold uppercase">{video.views} views</span>
            </div>

            <h3 className="text-xl font-bold text-white mb-6 group-hover:text-padel-green transition-colors leading-tight line-clamp-2">
                {video.title}
            </h3>

            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <div className="flex gap-4">
                    <button className="text-gray-500 hover:text-red-500 transition-colors">
                        <Heart className="w-5 h-5" />
                    </button>
                    <button className="text-gray-500 hover:text-white transition-colors">
                        <Share2 className="w-5 h-5" />
                    </button>
                </div>
                <button className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-1 group/btn">
                    Watch Now <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </button>
            </div>
        </div>
    </motion.div>
);

const CoachingVideos = () => {
    const categories = ['All', 'Foundations', 'Defense', 'Technical', 'Tactics', 'Mixed'];

    return (
        <div className="bg-[#0F172A] min-h-screen pt-32 pb-24 font-sans">
            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
            </div>

            <div className="container mx-auto px-6 max-w-7xl relative z-10">
                {/* Header */}
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-xs font-black uppercase tracking-widest mb-8"
                    >
                        <Play className="w-4 h-4" /> 4M Academy Library
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 uppercase"
                    >
                        Coaching <span className="text-padel-green">Videos</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-gray-400 max-w-3xl mx-auto"
                    >
                        Enhance your game with our exclusive library of training videos. From basic foundations to advanced pro tactics.
                    </motion.p>
                </div>

                {/* Filter Bar */}
                <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
                    {categories.map((cat, i) => (
                        <button
                            key={i}
                            className={`px-6 py-2 rounded-full text-xs font-bold transition-all duration-300 ${i === 0
                                ? 'bg-padel-green text-black px-8 py-3'
                                : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                {/* Videos Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {videos.map((video, index) => (
                        <VideoCard key={index} video={video} index={index} />
                    ))}
                </div>

                {/* Load More */}
                <div className="mt-20 text-center">
                    <button className="px-10 py-4 bg-white/5 border border-white/10 text-white rounded-2xl text-sm font-bold hover:bg-white/10 hover:padel-green transition-all uppercase tracking-widest">
                        Load More Content
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CoachingVideos;
