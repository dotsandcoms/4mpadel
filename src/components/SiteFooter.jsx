import React from 'react';
import { Instagram, Facebook, MapPin, Clock, Phone, Youtube, Shield, Smartphone, ArrowUpRight } from 'lucide-react';
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
        <div className="w-full bg-black overflow-hidden">
            {/* Big Text Banner */}
            <section className="py-4 md:py-6 bg-padel-green text-black overflow-hidden relative z-20">
                <div className="flex whitespace-nowrap">
                    <motion.div
                        animate={{ x: [0, -1000] }}
                        transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
                        className="flex gap-8"
                    >
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <h2 key={i} className="text-xl md:text-3xl font-black uppercase tracking-tighter">
                                4M Padel • For The Players •
                            </h2>
                        ))}
                    </motion.div>
                </div>
            </section>

            <footer className="relative bg-[#070913] border-t border-white/5 px-6 py-10 md:py-12 z-20">
                <div className="container mx-auto max-w-6xl">
                                     {/* Main Row */}
                    <div className="flex flex-col items-center text-center gap-4 pb-8 border-b border-white/5">
                        
                        {/* Brand logo & details */}
                        <span className="text-2xl font-black tracking-tighter text-white uppercase">
                            4M <span className="text-padel-green">Padel</span>
                        </span>
                        
                        <div className="flex flex-col items-center gap-2 text-xs text-gray-400 font-semibold max-w-xl">
                            <span className="flex items-center justify-center gap-1.5 text-center leading-relaxed">
                                <MapPin size={12} className="text-padel-green shrink-0" /> 
                                Commerce Square, building 2, 39 Rivonia Rd, Sandhurst, JHB, South Africa
                            </span>
                            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
                                <span className="flex items-center gap-1.5"><Clock size={12} className="text-padel-green" /> Mon-Sun 09:00-18:00</span>
                                 <span className="flex items-center gap-1.5"><Phone size={12} className="text-padel-green" /> 083 790 9091</span>
                            </div>
                        </div>
                    </div>
                    {/* Bottom Row */}
                    <div className="pt-6 flex flex-col items-center gap-4">
                        
                        {/* Social Circle Links - Compact style (rendered unconditionally) */}
                        <div className="flex gap-4">
                            <a href={links.instagram || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:border-padel-green text-white hover:text-padel-green transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 shadow-lg shadow-black/20">
                                <Instagram size={18} />
                            </a>
                            <a href={links.facebook || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:border-padel-green text-white hover:text-padel-green transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 shadow-lg shadow-black/20">
                                <Facebook size={18} />
                            </a>
                            <a href={links.youtube || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:border-padel-green text-white hover:text-padel-green transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 shadow-lg shadow-black/20">
                                <Youtube size={18} />
                            </a>
                            <a href={links.whatsapp || '#'} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:border-padel-green text-white hover:text-padel-green transition-all duration-300 flex items-center justify-center hover:scale-105 active:scale-95 shadow-lg shadow-black/20" title="WhatsApp Community">
                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                            </a>
                        </div>

                        {/* Legal Badge & Copyright */}
                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-black uppercase tracking-widest">
                            <Shield size={11} className="text-padel-green/80" />
                            <span>© 2026 4M Padel • SAPA Certified</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default SiteFooter;
