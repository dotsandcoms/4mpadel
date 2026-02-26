import React from 'react';
import { SEOHead } from '@burkcorp/reactmath';
import Navbar from '../components/Navbar';
import TopHeader from '../components/TopHeader';
import Hero from '../components/Hero';
import FeaturedSections from '../components/FeaturedSections';
import Services from '../components/Services';
import Calendar from '../components/Calendar';
import PlayerProfiles from '../components/PlayerProfiles';
import FAQ from '../components/FAQ';
import Partners from '../components/Partners';
import dynamicsPlayer from '../assets/dynamics_player.png';
// import Link from 'react-router-dom';
import { motion } from 'framer-motion';

const Home = () => {
    return (
        <>
            <SEOHead
                title="4M Padel - Premium Indoor Padel Courts"
                description="Experience the finest indoor Padel courts. Book your court today at 4M Padel."
                keywords={["padel", "indoor courts", "sports", "premium", "odessa"]}
            />

            <Navbar />

            <main className="bg-[#0F172A] text-white pb-20">
                <TopHeader />
                <Hero />

                {/* Intro / Dynamics Section */}
                <section className="relative py-24 px-6 md:px-20 container mx-auto">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <div className="relative">
                            <motion.div
                                initial={{ opacity: 0, x: -50 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <h2 className="text-6xl md:text-9xl font-bold text-white/5 absolute -top-20 -left-10 select-none z-0">
                                    PADEL
                                </h2>
                                <h2 className="text-4xl md:text-5xl font-bold relative z-10 mb-6 font-display">
                                    Play padel - feel <br />
                                    the dynamics of a <br />
                                    <span className="text-padel-green">new tennis!</span>
                                </h2>
                                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                                    Welcome to our padel club! Modern padel tennis courts, professional equipment and a friendly atmosphere await you. Padel tennis is the perfect combination of active recreation, sport and fun for all levels of training. Join the game today!
                                </p>

                                <div className="flex items-center gap-4">
                                    <div className="flex -space-x-4">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="w-12 h-12 rounded-full bg-gray-700 border-2 border-[#0F172A]" />
                                        ))}
                                    </div>
                                    <span className="text-sm font-medium text-white">
                                        + 32 players in the last week
                                    </span>
                                </div>
                            </motion.div>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                            className="relative h-[600px] rounded-3xl overflow-hidden group"
                        >
                            <img
                                src={dynamicsPlayer}
                                alt="Padel Player Action"
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                            <div className="absolute bottom-8 left-8 right-8">
                                <div className="glass-panel p-6 rounded-2xl flex justify-between items-end">
                                    <div>
                                        <p className="text-sm text-gray-300 mb-1">Weekly Best</p>
                                        <h3 className="text-2xl font-bold">Pro Tournament</h3>
                                    </div>
                                    <button className="w-12 h-12 bg-padel-green rounded-full flex items-center justify-center text-black hover:scale-110 transition-transform">
                                        ↗
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* New 4 Featured Sections */}
                <FeaturedSections />

                {/* Services Section */}
                <Services />

                {/* Calendar */}
                <Calendar />

                {/* Player Profiles */}
                <PlayerProfiles />

                {/* FAQ */}
                <FAQ />

                {/* Partners */}
                <Partners />
            </main>
        </>
    );
};

export default Home;
