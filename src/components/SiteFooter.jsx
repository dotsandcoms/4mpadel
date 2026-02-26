import React from 'react';
import { Instagram, Twitter, Facebook, MapPin, Clock, Phone } from 'lucide-react';
import { motion } from 'framer-motion';

const SiteFooter = () => {
    return (
        <div className="w-full">
            {/* Big Text Banner */}
            <section className="py-14 md:py-20 bg-padel-green text-black overflow-hidden relative z-20">
                <div className="flex whitespace-nowrap">
                    <motion.div
                        animate={{ x: [0, -1000] }}
                        transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                        className="flex gap-8"
                    >
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <h2 key={i} className="text-5xl md:text-8xl font-black uppercase tracking-tighter">
                                4M Padel • Active Life •
                            </h2>
                        ))}
                    </motion.div>
                </div>
            </section>

            <footer className="py-16 px-6 md:px-20 border-t border-white/10 bg-black text-center relative z-20">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center mb-10 gap-8">
                    <div className="flex flex-col items-center md:items-start text-center md:text-left">
                        <span className="text-4xl font-bold tracking-tighter text-white mb-4">
                            4M <span className="text-padel-green">Padel</span>
                        </span>

                        <div className="space-y-3 mt-2">
                            <div className="flex items-center gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <MapPin size={18} className="text-padel-green" />
                                <span>Wanderers Club, Illovo</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <Clock size={18} className="text-padel-green" />
                                <span>Mon-Sun 06:00 - 23:00</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <Phone size={18} className="text-padel-green" />
                                <span>+27 12 345 6789</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-white/80">
                        <a href="/" className="hover:text-padel-green transition-colors">Home</a>
                        <a href="/calendar" className="hover:text-padel-green transition-colors">Calendar</a>
                        <a href="/players" className="hover:text-padel-green transition-colors">Players</a>
                        <a href="/rankings" className="hover:text-padel-green transition-colors">Rankings</a>
                    </div>

                    <div className="flex gap-6 text-gray-400">
                        <a href="#" className="hover:text-padel-green transition-colors">
                            <Instagram size={24} />
                        </a>
                        <a href="#" className="hover:text-padel-green transition-colors">
                            <Twitter size={24} />
                        </a>
                        <a href="#" className="hover:text-padel-green transition-colors">
                            <Facebook size={24} />
                        </a>
                    </div>
                </div>
                <p className="text-gray-600 text-sm">© 2026 4M Padel. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default SiteFooter;
