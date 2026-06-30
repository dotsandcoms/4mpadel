import React, { useState, useEffect } from 'react';
import { SEOHead } from '@burkcorp/reactmath';
import Hero from '../components/Hero';
import FeaturedSections from '../components/FeaturedSections';
import Services from '../components/Services';
import Calendar from '../components/Calendar';
import FAQ from '../components/FAQ';
import Partners from '../components/Partners';
import UpcomingEventsWidget from '../components/UpcomingEventsWidget';
import dynamicsPlayer from '../assets/augustin.jpeg';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';

const Home = () => {
    const [session, setSession] = useState(null);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
        return () => subscription.unsubscribe();
    }, []);

    return (
        <>
            <SEOHead
                title="4M Padel - For the Players"
                description="Your central hub for tournaments, rankings, players, and everything happening in the sport nationwide"
                keywords={["padel", "indoor courts", "sports", "premium", "4M Padel", "South Africa", "rankedin", "SAPA", "Padel South Africa", "Padel Rankings", "Padel Tournaments", "Padel Players", "Padel SA"]}
            />

            <main className="bg-[#0F172A] text-white">
                <Hero />

                {/* Upcoming Events Widget — visible only when logged in */}
                <UpcomingEventsWidget session={session} />

                <FeaturedSections />

                {/* Intro / Dynamics Section */}
                <section className="relative py-24 px-6 md:px-20 container mx-auto hidden md:block">
                    <div className="grid md:grid-cols-2 gap-16 items-center">
                        <div className="relative">
                            <motion.div
                                initial={{ opacity: 0, x: -50 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8 }}
                            >
                                <h2 className="text-6xl md:text-9xl font-bold text-white/5 absolute -top-20 -left-10 select-none z-0">
                                    4M PADEL
                                </h2>
                                <h2 className="text-5xl md:text-4xl font-black font-display relative z-10 mb-6 tracking-tighter uppercase leading-[0.9]">
                                    Play Padel - Experience the energy of the <span className="bg-gradient-to-r from-padel-green to-[#beff00] bg-clip-text text-transparent">fastest-growing</span> sport. <br />
                                </h2>
                                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                                    Welcome to 4M Padel - The home of padel in South Africa.
                                </p>
                                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                                    Your central hub for tournaments, rankings, players, and everything happening in the sport
                                    nationwide</p>
                                <p className="text-gray-400 text-lg leading-relaxed mb-8">
                                    Discover events, follow the rankings, and connect with the growing padel community.</p>
                                <p className="text-gray-400 text-2xl leading-relaxed mb-8">
                                    <span className="text-padel-green">Join the game today!</span>
                                </p>
                            </motion.div>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.8 }}
                            className="hidden md:block relative h-[600px] rounded-3xl overflow-hidden group"
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
                                        <p className="text-sm text-gray-300 mb-1">Player Spotlight</p>
                                        <h3 className="text-2xl font-bold">Agustin Tapia</h3>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </section>

                {/* Services Section */}
                <Services />

                {/* FAQ */}
                <FAQ />

                {/* Partners */}
                <Partners />
            </main>
        </>
    );
};

export default Home;
