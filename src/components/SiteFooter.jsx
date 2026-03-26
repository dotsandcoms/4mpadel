import React from 'react';
import { Instagram, Twitter, Facebook, MapPin, Clock, Phone, Youtube } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '../supabaseClient';

const SiteFooter = () => {
    const [links, setLinks] = React.useState({
        instagram: '#',
        facebook: '#',
        youtube: '#',
        whatsapp: '#',
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
                            <div className="flex items-start gap-3 text-gray-400 text-sm justify-center md:justify-start">
                                <MapPin size={18} className="text-padel-green mt-0.5" />
                                <span>
                                    Commerce Square, building 2, 39 Rivonia Rd,<br />
                                    Sandhurst, JHB, South Africa
                                </span>
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
                        {links.whatsapp && links.whatsapp !== '#' && (
                            <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-padel-green transition-colors" title="WhatsApp Community">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
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
