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
import { Instagram } from 'lucide-react';
import InstagramFeed from '../components/InstagramFeed';
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

                {/* ═══════════════ INSTAGRAM FEED ═══════════════════════════════════════════ */}
                <section className="py-12 md:py-24 px-4 md:px-6 container mx-auto">
                    <div className="max-w-7xl mx-auto text-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            className="flex flex-col items-center"
                        >
                            <div className="inline-flex items-center justify-center p-4 rounded-full bg-padel-green/10 mb-6">
                                <Instagram className="w-8 h-8 text-padel-green" />
                            </div>
                            <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4 text-white">
                                Follow Us on Instagram
                            </h2>
                            <p className="text-gray-400 text-sm md:text-lg font-medium mb-10 md:mb-16 max-w-2xl mx-auto">
                                Catch up on the latest highlights, tournaments, and community moments from 4M Padel.
                            </p>

                            <div className="w-full mb-10 md:mb-12">
                                <InstagramFeed handle="4m_padel" limit={9} />
                            </div>

                            <motion.a
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                href="https://www.instagram.com/4m_padel/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-3 px-8 py-4 bg-padel-green text-black rounded-full font-black text-[10px] md:text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(190,255,0,0.3)] hover:shadow-[0_0_30px_rgba(190,255,0,0.5)] transition-all"
                            >
                                <Instagram className="w-4 h-4 md:w-5 md:h-5" />
                                @4m_padel
                            </motion.a>
                        </motion.div>
                    </div>
                </section>

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

                {/* Calendar */}
                <Calendar />

                {/* FAQ */}
                <FAQ />

                {/* Partners */}
                <Partners />
            </main>
        </>
    );
};

export default Home;
