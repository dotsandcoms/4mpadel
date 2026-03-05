import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Award, Mail, Phone, MapPin, Star, ShieldCheck, Instagram, Youtube, UserX, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

const CoachCard = ({ coach, index }) => {
    // We create a dummy "specialties" array from bio or location to simulate tags for now
    const specialties = [coach.coaching_location];

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden hover:bg-white/10 transition-all duration-500 flex flex-col h-full"
        >
            {/* Image Container */}
            <div className="relative h-80 overflow-hidden shrink-0">
                {coach.profile_pic_url ? (
                    <img
                        src={coach.profile_pic_url}
                        alt={coach.full_name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-black/50 text-gray-500">
                        <UserX size={48} className="mb-2" />
                        <span className="text-sm font-bold uppercase">No Image</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-transparent opacity-60" />

                {/* Level Badge (Mocked for now) */}
                <div className="absolute top-6 left-6 px-4 py-2 bg-padel-green text-black text-xs font-black uppercase tracking-widest rounded-full shadow-lg">
                    4M Approved
                </div>
            </div>

            {/* Content */}
            <div className="p-8 flex flex-col flex-grow">
                <div className="mb-4">
                    <h3 className="text-2xl font-black text-white mb-1 uppercase tracking-tight">{coach.full_name}</h3>
                    <p className="text-padel-green text-sm font-bold flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> Certified Instructor
                    </p>
                    <p className="text-gray-400 text-sm mt-1 flex items-center gap-1">
                        <MapPin className="w-4 h-4" /> {coach.coaching_location}
                    </p>
                </div>

                <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">
                    {coach.bio}
                </p>

                <div className="mt-auto">
                    {/* Social Links as tags */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {coach.instagram_link && (
                            <a href={coach.instagram_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-wider hover:bg-white/10 transition-colors">
                                <Instagram size={12} className="text-pink-500" /> Instagram
                            </a>
                        )}
                        {coach.youtube_link && (
                            <a href={coach.youtube_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-wider hover:bg-white/10 transition-colors">
                                <Youtube size={12} className="text-red-500" /> YouTube
                            </a>
                        )}
                    </div>

                    {/* Buttons */}
                    <div className="grid grid-cols-2 gap-4">
                        <a href={`mailto:${coach.email}`} className="flex items-center justify-center gap-2 py-3 bg-padel-green font-bold hover:bg-white transition-colors !text-black rounded-2xl text-sm">
                            <Mail className="w-4 h-4" color="black" /> <span className="!text-black">Contact</span>
                        </a>
                        <a href={`tel:${coach.contact_number}`} className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-sm font-bold hover:bg-white/10 transition-colors">
                            <Phone className="w-4 h-4 text-padel-green" /> Call
                        </a>
                    </div>
                </div>
            </div>
        </motion.div>
    )
};

const ApprovedCoaches = () => {
    const [coaches, setCoaches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCoaches = async () => {
            try {
                console.log('[ApprovedCoaches] Fetching approved coaches...');
                const { data, error } = await supabase
                    .from('coach_applications')
                    .select('*')
                    .eq('status', 'approved');

                if (error) {
                    console.error('[ApprovedCoaches] Error fetching coaches:', error);
                    throw error;
                }

                console.log(`[ApprovedCoaches] Successfully fetched ${data?.length || 0} approved coaches.`);
                if (data && data.length > 0) {
                    console.log('[ApprovedCoaches] Coach IDs:', data.map(c => c.id));
                }

                setCoaches(data || []);
            } catch (error) {
                console.error('[ApprovedCoaches] Unexpected error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchCoaches();
    }, []);

    return (
        <div className="bg-[#0F172A] min-h-screen pt-32 pb-12 font-sans">
            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <div className="container mx-auto px-6 max-w-7xl relative z-10">
                {/* Header */}
                <div className="text-center mb-20">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-xs font-black uppercase tracking-widest mb-8"
                    >
                        <Award className="w-4 h-4" /> Elite Padel Training
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 uppercase"
                    >
                        Approved <span className="text-padel-green">Coaches</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-xl text-gray-400 max-w-3xl mx-auto"
                    >
                        Train with the best in the country. Our certified coaches are vetted by 4M to ensure the highest quality of instruction across South Africa.
                    </motion.p>
                </div>

                {/* Coaches Grid */}
                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="w-12 h-12 text-padel-green animate-spin" />
                    </div>
                ) : coaches.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
                        <UserX className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">No Coaches Found</h3>
                        <p className="text-gray-400">There are currently no approved coaches to display.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {coaches.map((coach, index) => (
                            <CoachCard key={coach.id} coach={coach} index={index} />
                        ))}
                    </div>
                )}

                {/* Call to Action */}
                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="mt-32 p-12 bg-gradient-to-r from-padel-green to-blue-600 rounded-[3rem] text-center relative overflow-hidden group"
                >
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
                    <h2 className="text-4xl font-black text-black mb-6 uppercase tracking-tight relative z-10">Want to become an Approved Coach?</h2>
                    <p className="text-black/80 text-lg font-bold mb-10 max-w-2xl mx-auto relative z-10">
                        Join our network of elite instructors and get certified by the 4M Padel Association.
                    </p>
                    <Link to="/academy/register" className="inline-block px-10 py-5 bg-black text-white rounded-2xl text-lg font-black hover:scale-105 transition-transform shadow-2xl relative z-10 uppercase tracking-widest">
                        Apply Now
                    </Link>
                </motion.div>
            </div>
        </div>
    );
};

export default ApprovedCoaches;
