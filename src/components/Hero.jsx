import React from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import heroBg from '../assets/hero_bg.png';

const Hero = () => {
    const { scrollY } = useScroll();
    const yBackend = useTransform(scrollY, [0, 500], [0, 150]);
    const opacityText = useTransform(scrollY, [0, 300], [1, 0]);

    return (
        <div className="relative w-full px-4 md:px-6 pb-6 bg-black">
            <div className="relative h-[85vh] w-full overflow-hidden rounded-[2rem] border border-white/10">
                {/* Parallax Background */}
                <motion.div
                    style={{ y: yBackend }}
                    animate={{ scale: [1.1, 1.15] }}
                    transition={{
                        duration: 20,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "linear"
                    }}
                    className="absolute inset-0 z-0"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-black/80 z-10" />
                    <img
                        src={heroBg}
                        alt="Premium Padel Court"
                        className="w-full h-full object-cover"
                    />
                </motion.div>

                {/* Hero Content */}
                <motion.div
                    style={{ opacity: opacityText }}
                    className="relative z-20 h-full flex flex-col justify-center px-6 md:px-20 container mx-auto"
                >
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="text-padel-green font-bold tracking-widest uppercase mb-2 text-sm md:text-base"
                    >
                        The Home of 4M Padel
                    </motion.p>

                    <div className="overflow-hidden">
                        <motion.h1
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                            className="text-5xl md:text-7xl lg:text-8xl font-bold text-white leading-none mb-4 max-w-4xl"
                        >
                            FOR THE PLAYERS<br />
                            <span className="text-padel-green text-2xl md:text-3xl block mt-2">Calendar • Tournaments • Players •  Leaderboard •  Training</span>

                        </motion.h1>
                    </div>

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8, duration: 0.8 }}
                        className="text-gray-300 text-lg md:text-xl max-w-xl mb-8 leading-relaxed"
                    >
                        The Official Platform for SAPA events, calendar & rankings in South Africa
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1, duration: 0.8 }}
                        className="flex flex-col sm:flex-row gap-4"
                    >
                        <button className="group relative px-8 py-4 bg-padel-green rounded-full font-bold text-black overflow-hidden hover:scale-105 transition-transform duration-300">
                            <span className="relative z-10 flex items-center gap-2">
                                View Services
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform">
                                    <path d="M1 11L11 1M11 1H1M11 1V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                        </button>

                        <button className="group px-8 py-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full font-bold text-white hover:bg-white/20 transition-colors">
                            What is Padel? ↗
                        </button>
                    </motion.div>
                </motion.div>
            </div >
        </div >
    );
};

export default Hero;
