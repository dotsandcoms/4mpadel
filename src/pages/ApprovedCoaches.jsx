import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Mail, Phone, MapPin, Star, ShieldCheck, Instagram, Youtube, UserX, Loader2, ExternalLink, Search, X, ChevronDown, Filter } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { Link, useSearchParams } from 'react-router-dom';
import CoachProfileModal from '../components/CoachProfileModal';

const CoachCard = ({ coach, index, onSelect }) => {
    // We create a dummy "specialties" array from bio or location to simulate tags for now
    const specialties = [coach.coaching_location];

    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => onSelect(coach)}
            className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden hover:bg-white/10 transition-all duration-500 flex flex-col h-full cursor-pointer"
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
                        <MapPin className="w-4 h-4" /> 
                        {coach.city && `${coach.city}${coach.coaching_location ? ', ' : ''}`}
                        {coach.coaching_location}
                    </p>
                </div>

                <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">
                    {coach.bio}
                </p>

                <div className="mt-auto">
                    {/* Social Links as tags */}
                    <div className="flex flex-wrap gap-2 mb-8">
                        {coach.website_link && (
                            <a href={coach.website_link} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-wider hover:bg-white/10 transition-colors">
                                <ExternalLink size={12} className="text-blue-400" /> Website
                            </a>
                        )}
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
    const [searchTerm, setSearchTerm] = useState('');
    const [cityFilter, setCityFilter] = useState('All');
    const [genderFilter, setGenderFilter] = useState('All');
    const [selectedCoach, setSelectedCoach] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
 
    // Get unique cities from coaches
    const cities = ['All', ...new Set(coaches.map(coach => coach.city).filter(Boolean))];
 
    const filteredCoaches = coaches.filter(coach => {
        const matchesSearch = coach.full_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             coach.bio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             coach.coaching_location?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCity = cityFilter === 'All' || coach.city === cityFilter;
        const matchesGender = genderFilter === 'All' || coach.gender === genderFilter;
        return matchesSearch && matchesCity && matchesGender;
    });

    const handleSelectCoach = (coach) => {
        setSelectedCoach(coach);
        if (coach) {
            setSearchParams({ id: coach.id });
        } else {
            setSearchParams({});
        }
    };
 
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
                setCoaches(data || []);

                // Handle deep-linking from URL (?id=...)
                const coachId = searchParams.get('id');
                if (coachId && data) {
                    const linkedCoach = data.find(c => c.id.toString() === coachId);
                    if (linkedCoach) setSelectedCoach(linkedCoach);
                }
            } catch (error) {
                console.error('[ApprovedCoaches] Unexpected error:', error);
            } finally {
                setLoading(false);
            }
        };
 
        fetchCoaches();
    }, [searchParams]);

    return (
        <div className="bg-[#0F172A] min-h-screen pb-12 font-sans relative">
            {/* Background elements */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
            </div>

            <main className="relative z-10 pb-20 w-full max-w-[1440px] mx-auto px-4 xl:px-8">
                {/* Unified Header */}
                <section className="relative z-20 flex flex-col justify-start pt-6 md:pt-28 lg:pt-32 pb-4 md:pb-12">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-padel-green/20 text-padel-green bg-padel-green/5 text-[10px] md:text-[11px] font-bold uppercase tracking-widest mb-6 max-w-fit">
                        <Award className="w-3 h-3" />
                        <span>Elite Padel Training</span>
                    </div>

                    <div className="overflow-hidden mb-6">
                        <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[110px] xl:text-[130px] font-bold text-white leading-[1.1] md:leading-[0.9] tracking-tighter max-w-[100vw] font-display whitespace-nowrap lg:whitespace-normal">
                            APPROVED <span className="text-transparent bg-clip-text bg-gradient-to-r from-padel-green to-[#beff00]">COACHES</span>
                        </h1>
                    </div>

                    <p className="text-gray-200 text-sm md:text-lg lg:text-xl max-w-4xl mb-2 leading-relaxed font-light whitespace-normal tracking-tight sm:tracking-normal">
                        <strong className="text-white font-medium">Train with the best in the country. Our certified coaches are vetted by 4M to ensure the highest quality of instruction across South Africa.</strong>
                    </p>
                </section>

                {/* Search & Command Deck */}
                {!loading && coaches.length > 0 && (
                    <section className="w-full pt-0 md:pt-0 mt-0 md:-mt-12 relative z-20 mb-12">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#0a0f1d]/80 border border-white/10 backdrop-blur-2xl p-3 md:p-4 rounded-2xl md:rounded-3xl flex gap-3 items-center shadow-2xl max-w-4xl mx-auto"
                        >
                            {/* Search Input Container */}
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 md:w-5 md:h-5 pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Search coaches by name, bio, or club..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-white/5 border border-white/10 rounded-xl md:rounded-2xl py-3 md:py-3.5 pl-10 md:pl-12 pr-4 text-[16px] md:text-base text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all placeholder-gray-500"
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>
                            
                            {/* Filters Button */}
                            <button
                                onClick={() => setShowFilters(true)}
                                className="relative flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-3.5 text-white transition-all font-semibold text-sm md:text-base shrink-0 group"
                            >
                                <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-white transition-colors" />
                                <span className="hidden sm:block">Filters</span>
                                {((cityFilter !== 'All') || (genderFilter !== 'All')) && (
                                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 md:w-5 md:h-5 bg-padel-green text-black font-black text-[10px] md:text-xs rounded-full flex items-center justify-center shadow-lg">
                                        {(cityFilter !== 'All' ? 1 : 0) + (genderFilter !== 'All' ? 1 : 0)}
                                    </span>
                                )}
                            </button>
                        </motion.div>
                    </section>
                )}

                {/* Filters Drawer/Bottom Sheet */}
                <AnimatePresence>
                    {showFilters && (
                        <>
                            {/* Backdrop */}
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowFilters(false)}
                                className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
                            />

                            {/* Drawer */}
                            <motion.div
                                initial={{ y: '100%' }}
                                animate={{ y: 0 }}
                                exit={{ y: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed bottom-0 left-0 right-0 z-[1001] bg-[#0a0f1d] border-t border-white/10 rounded-t-3xl p-6 pb-28 md:pb-6 shadow-2xl flex flex-col gap-6 max-h-[85vh] overflow-y-auto md:max-w-md md:left-1/2 md:-translate-x-1/2 md:bottom-4 md:border md:rounded-3xl"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xl font-bold text-white">Filters</h3>
                                    <button onClick={() => setShowFilters(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* City Filter */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-300">City</label>
                                        <div className="relative">
                                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                            <select
                                                value={cityFilter}
                                                onChange={(e) => setCityFilter(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                            >
                                                {cities.map(city => (
                                                    <option key={city} value={city} className="bg-[#0a0f1d]">{city === 'All' ? 'All Cities' : city}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gender Filter */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-gray-300">Gender</label>
                                        <div className="relative">
                                            <Award className="absolute left-4 top-1/2 -translate-y-1/2 text-padel-green w-4 h-4 pointer-events-none" />
                                            <select
                                                value={genderFilter}
                                                onChange={(e) => setGenderFilter(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-12 pr-10 text-white appearance-none cursor-pointer focus:outline-none focus:border-padel-green transition-colors font-semibold text-sm"
                                            >
                                                <option value="All" className="bg-[#0a0f1d]">All Genders</option>
                                                <option value="Male" className="bg-[#0a0f1d]">Male</option>
                                                <option value="Female" className="bg-[#0a0f1d]">Female</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        onClick={() => {
                                            setCityFilter('All');
                                            setGenderFilter('All');
                                        }}
                                        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold py-3.5 rounded-xl transition-colors text-sm"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        onClick={() => setShowFilters(false)}
                                        className="flex-1 bg-padel-green hover:bg-[#beff00] text-black font-bold py-3.5 rounded-xl transition-colors text-sm"
                                    >
                                        Show Results
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                {/* Coaches Grid */}
                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <Loader2 className="w-12 h-12 text-padel-green animate-spin" />
                    </div>
                ) : filteredCoaches.length === 0 ? (
                    <div className="text-center py-20 bg-white/5 rounded-3xl border border-white/10">
                        <UserX className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-white mb-2">
                            {searchTerm || cityFilter !== 'All' ? 'No Matching Coaches' : 'No Coaches Found'}
                        </h3>
                        <p className="text-gray-400">
                            {searchTerm || cityFilter !== 'All' 
                                ? 'Try adjusting your search or filter to find what you are looking for.' 
                                : 'There are currently no approved coaches to display.'}
                        </p>
                        {(searchTerm || cityFilter !== 'All' || genderFilter !== 'All') && (
                            <button 
                                onClick={() => { setSearchTerm(''); setCityFilter('All'); setGenderFilter('All'); }}
                                className="mt-6 text-padel-green font-bold hover:underline"
                            >
                                Clear all filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {filteredCoaches.map((coach, index) => (
                            <CoachCard key={coach.id} coach={coach} index={index} onSelect={handleSelectCoach} />
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

            </main>

            {/* Coach Details Modal */}
            <CoachProfileModal 
                app={selectedCoach} 
                onClose={() => handleSelectCoach(null)} 
                isAdmin={false}
            />
        </div>
    );
};

export default ApprovedCoaches;
