import React from 'react';
import { motion } from 'framer-motion';
import { User, Trophy, Calendar, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const Services = () => {
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
            icon: <div className="text-xs font-black px-1 border-2 border-current rounded-sm leading-none flex items-center justify-center h-5">6:3</div>,
            title: "Fixtures & Results",
            description: "Follow draws, fixtures, match scores and tournament results as events unfold.",
            linkText: "Follow results",
            linkUrl: "/calendar?tab=past"
        }
    ];

    return (
        <section id="platform" className="py-24 bg-[#0B1120] relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-padel-green/5 blur-[100px] rounded-full translate-x-1/2 -translate-y-1/2" />

            <div className="container mx-auto px-6 md:px-20 relative z-10 max-w-5xl">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="text-padel-green font-black tracking-widest uppercase text-[10px] mb-4 block">Platform</span>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">Your Home of Padel</h2>
                    <p className="text-gray-400 max-w-2xl mx-auto text-sm md:text-base leading-relaxed">
                        4M Padel brings players, organisers, clubs and federations together in one connected platform — with player profiles, rankings, events, fixtures and results all in one place.
                    </p>
                </motion.div>

                <div className="grid grid-cols-2 gap-3 md:gap-6">
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-[#151B2B] border border-white/5 p-4 sm:p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] hover:bg-[#1A2133] hover:border-white/10 transition-colors group flex flex-col"
                        >
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-padel-green/10 border border-padel-green/20 rounded-lg md:rounded-xl flex items-center justify-center text-padel-green mb-4 md:mb-6 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(204,255,0,0.1)]">
                                {service.icon}
                            </div>
                            <h3 className="text-sm sm:text-base md:text-xl font-bold text-white mb-2 md:mb-3 tracking-tight leading-tight">{service.title}</h3>
                            <p className="text-gray-400 text-[10px] sm:text-xs md:text-sm leading-relaxed mb-4 md:mb-8 flex-grow pr-0 md:pr-12 line-clamp-3 md:line-clamp-none">{service.description}</p>
                            
                            <Link to={service.linkUrl} className="inline-flex items-center gap-1.5 md:gap-2 text-padel-green font-bold text-[10px] md:text-sm group/link hover:text-white transition-colors mt-auto">
                                {service.linkText}
                                <ArrowRight className="w-3 h-3 md:w-4 md:h-4 group-hover/link:translate-x-1 transition-transform" />
                            </Link>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
