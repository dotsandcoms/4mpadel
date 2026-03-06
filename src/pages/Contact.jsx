import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MapPin, Send, Instagram, Facebook, Youtube, MessageSquare } from 'lucide-react';
import { supabase } from '../supabaseClient';
import AuthModal from '../components/AuthModal';
import SiteFooter from '../components/SiteFooter';

const Contact = () => {
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        subject: '',
        message: ''
    });
    const [socialLinks, setSocialLinks] = useState({
        instagram: '#',
        facebook: '#',
        youtube: '#'
    });

    useEffect(() => {
        const fetchSocials = async () => {
            const { data } = await supabase.from('settings').select('key, value');
            if (data) {
                const links = {};
                data.forEach(item => {
                    links[item.key] = item.value;
                });
                setSocialLinks(prev => ({ ...prev, ...links }));
            }
        };
        fetchSocials();
    }, []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        setIsSubmitting(false);
        setSubmitted(true);
        setFormData({ name: '', email: '', subject: '', message: '' });
    };

    return (
        <div className="pt-20 min-h-screen bg-[#0F172A] text-white">
            {/* Hero Section */}
            <section className="relative h-[40vh] min-h-[400px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 z-0">
                    <img
                        src="/src/assets/contact_hero_bg.png"
                        alt="Contact Hero"
                        className="w-full h-full object-cover opacity-40 scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-[#0F172A]/80 via-transparent to-[#0F172A]" />
                </div>

                <div className="container mx-auto px-6 relative z-10 text-center">
                    <motion.span
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-padel-green font-black tracking-[0.2em] uppercase text-sm mb-4 block"
                    >
                        Get In Touch
                    </motion.span>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase"
                    >
                        Contact <span className="text-padel-green">Us</span>
                    </motion.h1>
                </div>
            </section>

            <section className="py-20 -mt-20 relative z-20">
                <div className="container mx-auto px-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 bg-black/40 backdrop-blur-xl border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">

                        {/* Contact Info Sidebar */}
                        <div className="lg:col-span-5 p-8 md:p-12 bg-gradient-to-br from-[#1E293B] to-[#0F172A] border-r border-white/5">
                            <h2 className="text-3xl font-black uppercase tracking-tight mb-8">Connect with <span className="text-padel-green text-shadow-glow">4M</span></h2>

                            <div className="space-y-8">
                                <div className="flex gap-6 items-start group">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-padel-green group-hover:bg-padel-green/10 transition-all">
                                        <Mail className="w-5 h-5 text-padel-green" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-gray-500 tracking-widest mb-1">Email Us</p>
                                        <a href="mailto:info@4mpadel.com" className="text-xl font-bold hover:text-padel-green transition-colors underline decoration-padel-green/30 underline-offset-4">info@4mpadel.com</a>
                                    </div>
                                </div>

                                <div className="flex gap-6 items-start group">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-padel-green group-hover:bg-padel-green/10 transition-all">
                                        <Phone className="w-5 h-5 text-padel-green" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-gray-500 tracking-widest mb-1">Call Us</p>
                                        <a href="tel:+27123456789" className="text-xl font-bold hover:text-padel-green transition-colors">+27 12 345 6789</a>
                                    </div>
                                </div>

                                <div className="flex gap-6 items-start group">
                                    <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-padel-green group-hover:bg-padel-green/10 transition-all">
                                        <MapPin className="w-5 h-5 text-padel-green" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase font-black text-gray-500 tracking-widest mb-1">Location</p>
                                        <p className="text-xl font-bold">Johannesburg, South Africa</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-16 pt-12 border-t border-white/5">
                                <p className="text-xs font-black uppercase tracking-widest text-gray-500 mb-6">Follow our journey</p>
                                <div className="flex gap-4">
                                    {socialLinks.instagram !== '#' && (
                                        <a href={socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-padel-green hover:text-black hover:border-padel-green transition-all transform hover:-translate-y-1">
                                            <Instagram className="w-4 h-4" />
                                        </a>
                                    )}
                                    {socialLinks.facebook !== '#' && (
                                        <a href={socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-padel-green hover:text-black hover:border-padel-green transition-all transform hover:-translate-y-1">
                                            <Facebook className="w-4 h-4" />
                                        </a>
                                    )}
                                    {socialLinks.youtube !== '#' && (
                                        <a href={socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 hover:bg-padel-green hover:text-black hover:border-padel-green transition-all transform hover:-translate-y-1">
                                            <Youtube className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Contact Form */}
                        <div className="lg:col-span-7 p-8 md:p-12 bg-black/20">
                            {submitted ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="h-full flex flex-col items-center justify-center text-center py-20"
                                >
                                    <div className="w-20 h-20 rounded-full bg-padel-green/10 flex items-center justify-center mb-6 border border-padel-green/20">
                                        <Send className="w-10 h-10 text-padel-green" />
                                    </div>
                                    <h3 className="text-3xl font-black uppercase mb-4">Message Sent!</h3>
                                    <p className="text-gray-400 mb-8 max-w-sm">Thank you for reaching out. A developer or management member from 4M Padel will get back to you shortly.</p>
                                    <button
                                        onClick={() => setSubmitted(false)}
                                        className="text-padel-green font-bold uppercase tracking-widest text-sm hover:underline"
                                    >
                                        Send another message
                                    </button>
                                </motion.div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest ml-1">Your Name</label>
                                            <input
                                                required
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleChange}
                                                placeholder="John Doe"
                                                className="w-full bg-[#0F172A]/50 border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 transition-all font-medium placeholder:text-gray-700"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest ml-1">Email Address</label>
                                            <input
                                                required
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleChange}
                                                placeholder="john@example.com"
                                                className="w-full bg-[#0F172A]/50 border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 transition-all font-medium placeholder:text-gray-700"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest ml-1">Subject</label>
                                        <input
                                            required
                                            type="text"
                                            name="subject"
                                            value={formData.subject}
                                            onChange={handleChange}
                                            placeholder="Tournament Inquiry"
                                            className="w-full bg-[#0F172A]/50 border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 transition-all font-medium placeholder:text-gray-700"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] uppercase font-black text-gray-500 tracking-widest ml-1">Message</label>
                                        <textarea
                                            required
                                            name="message"
                                            value={formData.message}
                                            onChange={handleChange}
                                            rows="5"
                                            placeholder="Tell us what's on your mind..."
                                            className="w-full bg-[#0F172A]/50 border border-white/5 rounded-2xl px-6 py-4 focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green/20 transition-all font-medium placeholder:text-gray-700 resize-none"
                                        ></textarea>
                                    </div>

                                    <button
                                        disabled={isSubmitting}
                                        type="submit"
                                        className="w-full bg-padel-green text-black font-black uppercase tracking-[0.2em] py-5 rounded-2xl hover:bg-white transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 shadow-xl shadow-padel-green/10"
                                    >
                                        {isSubmitting ? (
                                            <span className="animate-pulse">Processing...</span>
                                        ) : (
                                            <>Send Message <Send className="w-4 h-4" /></>
                                        )}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Map or Secondary CTA Section */}
            <section className="py-32">
                <div className="container mx-auto px-6 text-center">
                    <h2 className="text-4xl md:text-5xl font-black italic uppercase mb-6 tracking-tighter">Ready to <span className="text-padel-green">Play?</span></h2>
                    <p className="text-gray-400 mb-12 max-w-xl mx-auto font-medium">Register on Rankedin and follow 4M Padel to start booking courts and entering tournaments today.</p>
                    <div className="flex flex-wrap justify-center gap-6">
                        <button
                            onClick={() => setIsAuthModalOpen(true)}
                            className="bg-white/5 border border-white/10 px-10 py-4 rounded-full font-bold hover:bg-white/10 transition-all uppercase tracking-widest text-sm text-white"
                        >
                            Register Now
                        </button>
                        <a href="/calendar" className="bg-padel-green !text-black font-black px-10 py-4 rounded-full hover:bg-white transition-all uppercase tracking-widest text-sm shadow-lg shadow-padel-green/20 border border-padel-green inline-flex items-center justify-center">View Tournaments</a>
                    </div>
                </div>
            </section>
            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </div>
    );
};

export default Contact;
