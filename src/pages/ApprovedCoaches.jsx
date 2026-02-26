import React from 'react';
import { motion } from 'framer-motion';
import { Award, Mail, Phone, MapPin, Star, ShieldCheck } from 'lucide-react';

const coaches = [
    {
        name: 'Carlos Mendez',
        level: '4M Head Coach',
        cert: 'International Padel Federation (FIP) Level 3',
        bio: 'With over 15 years of experience in Spain and South Africa, Carlos specializes in advanced tactical play and professional athlete development.',
        image: '/Users/bradein/.gemini/antigravity/brain/ea660605-3d9d-41ec-922b-e2b6d1a0c0cc/coach_1_1772098869822.png',
        specialties: ['Technical Analysis', 'Tactical Positioning', 'Pro Development'],
        stats: { students: '500+', rank: 'Top 10 Player' }
    },
    {
        name: 'Sarah Jenkins',
        level: 'Senior Academy Coach',
        cert: '4M Certified Elite Coach',
        bio: 'Sarah focuses on junior development and intermediate ladies clinics. Her coaching philosophy centers on building a strong technical foundation.',
        image: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=800', // Fallback for now
        specialties: ['Junior Foundations', 'Ladies Clinics', 'Mental Game'],
        stats: { students: '320+', experience: '8 Years' }
    },
    {
        name: 'Marco Rossi',
        level: 'Academy Instructor',
        cert: '4M Level 2 Instructor',
        bio: 'Marco brings high energy to the court. He is known for his intensive cardio padel sessions and group clinics for beginners.',
        image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800', // Fallback for now
        specialties: ['Cardio Padel', 'Beginner Basics', 'Drill Sessions'],
        stats: { students: '200+', energy: 'Infinite' }
    }
];

const CoachCard = ({ coach, index }) => (
    <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: index * 0.1 }}
        className="group relative bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden hover:bg-white/10 transition-all duration-500"
    >
        {/* Image Container */}
        <div className="relative h-80 overflow-hidden">
            <img
                src={coach.image}
                alt={coach.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A] via-transparent to-transparent opacity-60" />

            {/* Level Badge */}
            <div className="absolute top-6 left-6 px-4 py-2 bg-padel-green text-black text-xs font-black uppercase tracking-widest rounded-full shadow-lg">
                {coach.level}
            </div>
        </div>

        {/* Content */}
        <div className="p-8">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-2xl font-black text-white mb-1 uppercase tracking-tight">{coach.name}</h3>
                    <p className="text-padel-green text-sm font-bold flex items-center gap-1">
                        <ShieldCheck className="w-4 h-4" /> {coach.cert}
                    </p>
                </div>
            </div>

            <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-3">
                {coach.bio}
            </p>

            {/* Specialties */}
            <div className="flex flex-wrap gap-2 mb-8">
                {coach.specialties.map((spec, i) => (
                    <span key={i} className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                        {spec}
                    </span>
                ))}
            </div>

            {/* Buttons */}
            <div className="grid grid-cols-2 gap-4">
                <button className="flex items-center justify-center gap-2 py-3 bg-padel-green text-black rounded-2xl text-sm font-bold hover:bg-white transition-colors">
                    <Mail className="w-4 h-4" /> Book
                </button>
                <button className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 text-white rounded-2xl text-sm font-bold hover:bg-white/10 transition-colors">
                    <Star className="w-4 h-4 text-padel-green" /> Profile
                </button>
            </div>
        </div>
    </motion.div>
);

const ApprovedCoaches = () => {
    return (
        <div className="bg-[#0F172A] min-h-screen pt-32 pb-24 font-sans">
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {coaches.map((coach, index) => (
                        <CoachCard key={index} coach={coach} index={index} />
                    ))}
                </div>

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
                    <button className="px-10 py-5 bg-black text-white rounded-2xl text-lg font-black hover:scale-105 transition-transform shadow-2xl relative z-10 uppercase tracking-widest">
                        Apply Now
                    </button>
                </motion.div>
            </div>
        </div>
    );
};

export default ApprovedCoaches;
