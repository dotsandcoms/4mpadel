import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Trophy, Calendar, ArrowRight, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import padelBg from '../assets/padel_bg.png';
import AuthModal from './AuthModal';

const Services = () => {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const services = [
        {
            icon: <User className="w-5 h-5" />,
            title: "Player Profiles",
            description: "Create your own padel profile and track your rankings, events, results and playing history.",
            linkText: "View profiles",
            linkUrl: "/players"
        },
        {
            icon: <Trophy className="w-5 h-5" />,
            title: "National Rankings",
            description: "Follow official ranking tables, points movement and performance across divisions.",
            linkText: "See rankings",
            linkUrl: "/rankings"
        },
        {
            icon: <Calendar className="w-5 h-5" />,
            title: "Tournament Calendar",
            description: "Browse upcoming tournaments, divisions, venues, entry details and important dates.",
            linkText: "Browse events",
            linkUrl: "/calendar"
        },
        {
            icon: <div className="text-[10px] font-black border border-current px-1.5 py-0.5 rounded leading-none flex items-center justify-center">6:3</div>,
            title: "Fixtures & Results",
            description: "Follow draws, fixtures, match scores and tournament results as events unfold.",
            linkText: "Follow results",
            linkUrl: "/calendar?tab=past"
        }
    ];

    return (
        <section id="platform" className="relative py-12 md:py-16 px-4 md:px-8 lg:px-16 mx-auto overflow-hidden bg-[#0A0F1C]">
            {/* Background image on the right */}
            <div className="absolute top-0 right-0 w-[85%] sm:w-[50%] md:w-[45%] lg:w-[40%] h-[350px] md:h-full z-0 overflow-hidden opacity-90 md:opacity-100 pointer-events-none">
                {/* Fade left edge - wider on mobile to ensure text legibility */}
                <div className="absolute inset-y-0 left-0 w-[60%] md:w-32 bg-gradient-to-r from-[#0A0F1C] via-[#0A0F1C]/90 to-transparent z-10" />
                {/* Fade bottom edge */}
                <div className="absolute inset-x-0 bottom-0 h-40 md:h-0 bg-gradient-to-t from-[#0A0F1C] via-[#0A0F1C]/80 to-transparent z-10 md:hidden" />
                
                <img 
                    src={padelBg} 
                    alt="4M Padel Court" 
                    className="w-full h-full object-cover object-left md:object-center"
                />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="max-w-xl mb-12 md:mb-16"
                >
                    <h4 className="text-padel-green font-bold text-[11px] sm:text-[13px] tracking-widest uppercase mb-4 sm:mb-6">The Platform</h4>
                    <h2 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black font-display text-white mb-2 leading-tight tracking-tight">
                        Your Home<br/>
                        <span className="text-padel-green">of Padel.</span>
                    </h2>
                    <div className="w-12 h-1 bg-padel-green my-6 sm:my-8"></div>
                    <p className="text-gray-400 text-base sm:text-lg leading-relaxed">
                        4M Padel connects players, organisers, clubs and federations in one powerful platform — with everything you need to play, compete and grow the game.
                    </p>
                </motion.div>

                <div className="grid grid-cols-2 gap-3 sm:gap-6 max-w-3xl mb-12 md:mb-16">
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-[#111827] rounded-2xl md:rounded-3xl p-4 sm:p-6 md:p-8 border border-white/5 hover:border-padel-green/30 transition-colors group shadow-2xl flex flex-col"
                        >
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl border border-padel-green/20 bg-padel-green/5 flex items-center justify-center mb-4 md:mb-6 group-hover:scale-110 transition-transform">
                                <div className="text-padel-green flex items-center justify-center">
                                    {service.icon}
                                </div>
                            </div>
                            <h3 className="text-sm md:text-lg lg:text-xl font-bold text-white mb-2 md:mb-3 leading-tight">{service.title}</h3>
                            <p className="text-gray-400 mb-4 md:mb-6 text-[10px] sm:text-xs md:text-sm leading-relaxed flex-grow">{service.description}</p>
                            
                            <Link to={service.linkUrl} className="inline-flex items-center gap-1 md:gap-2 text-padel-green text-[10px] md:text-sm font-bold hover:gap-2 md:hover:gap-3 transition-all mt-auto">
                                {service.linkText} <ArrowRight className="w-3 h-3 md:w-4 md:h-4" />
                            </Link>
                        </motion.div>
                    ))}
                </div>

                {/* Bottom CTA Banner */}
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="bg-[#111827] rounded-2xl p-4 sm:p-5 border border-white/5 flex flex-row items-center justify-between gap-4 relative overflow-hidden max-w-3xl shadow-2xl"
                >
                    <div className="absolute top-0 right-0 w-48 h-48 bg-padel-green/20 blur-[50px] pointer-events-none rounded-full translate-x-1/4 -translate-y-1/4" />
                    
                    <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                        <div className="text-padel-green shrink-0">
                            <Users className="w-6 h-6 sm:w-8 sm:h-8" />
                        </div>
                        <div>
                            <h4 className="text-white font-bold text-xs sm:text-base mb-0.5">Join the growing padel community.</h4>
                            <p className="text-gray-400 text-[10px] sm:text-sm">Compete. Connect. Grow the game.</p>
                        </div>
                    </div>
                    <div className="relative z-10 shrink-0">
                        <button onClick={() => setIsAuthModalOpen(true)} className="flex items-center justify-center bg-padel-green !text-black font-black px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs uppercase tracking-tight hover:bg-white transition-colors">
                            Get Started <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-1 sm:ml-1.5" />
                        </button>
                    </div>
                </motion.div>
            </div>

            <AuthModal 
                isOpen={isAuthModalOpen} 
                onClose={() => setIsAuthModalOpen(false)} 
                initialTab="register" 
            />
        </section>
    );
};

export default Services;
