import React from 'react';
import { Instagram, Twitter, Facebook, MapPin, Clock, Phone, Youtube } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';

const SiteFooter = () => {
    const [links, setLinks] = React.useState({
        instagram: '#',
        facebook: '#',
        youtube: '#',
        website: '#'
    });

    React.useEffect(() => {
        const fetchLinks = async () => {
            const { data } = await supabase.from('settings').select('key, value');
            if (data) {
                const linksObj = {};
                data.forEach(item => {
                    linksObj[item.key] = item.value;
                });
                setLinks(prev => ({ ...prev, ...linksObj }));
            }
        };
        fetchLinks();
    }, []);
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
                                4M Padel • For The Players •
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
                                <span>Commerce Square, building 2, 39 Rivonia Rd, Sandhurst, JHB, South Africa</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <Clock size={18} className="text-padel-green" />
                                <span>Mon-Sun 09:00 - 18:00</span>
                            </div>
                            <div className="flex items-center gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <Phone size={18} className="text-padel-green" />
                                <span>083 790 9091</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap justify-center gap-6 text-sm font-medium text-white/80">
                        <a href="/" className="hover:text-padel-green transition-colors">Home</a>
                        <a href="/calendar" className="hover:text-padel-green transition-colors">Calendar</a>
                        <a href="/players" className="hover:text-padel-green transition-colors">Players</a>
                        <a href="/rankings" className="hover:text-padel-green transition-colors">Rankings</a>
                        <a href="/gallery" className="hover:text-padel-green transition-colors">Gallery</a>
                        <a href="/contact" className="hover:text-padel-green transition-colors">Contact Us</a>
                    </div>

                    <div className="flex gap-6 text-gray-400">
                        {links.instagram !== '#' && (
                            <a href={links.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-padel-green transition-colors">
                                <Instagram size={24} />
                            </a>
                        )}
                        {links.facebook !== '#' && (
                            <a href={links.facebook} target="_blank" rel="noopener noreferrer" className="hover:text-padel-green transition-colors">
                                <Facebook size={24} />
                            </a>
                        )}
                        {links.youtube !== '#' && (
                            <a href={links.youtube} target="_blank" rel="noopener noreferrer" className="hover:text-padel-green transition-colors">
                                <Youtube size={24} />
                            </a>
                        )}
                    </div>
                </div>
                <p className="text-gray-600 text-sm">© 2026 4M Padel. All rights reserved.</p>
            </footer>
        </div>
    );
};

export default SiteFooter;
