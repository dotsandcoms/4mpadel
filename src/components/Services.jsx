import React from 'react';
import { motion } from 'framer-motion';
import { Target, Users, Zap, Trophy } from 'lucide-react';

const Services = () => {
    const services = [
        {
            icon: <Target className="w-8 h-8" />,
            title: "SAPA Accredited Coaching",
            description: "Train with certified South African Padel Association coaches to refine your technique."
        },
        {
            icon: <Users className="w-8 h-8" />,
            title: "Club Development",
            description: "Supporting clubs across Western Cape and Gauteng with infrastructure and management."
        },
        {
            icon: <Zap className="w-8 h-8" />,
            title: "High Performance",
            description: "Dedicated programs for top-ranked SA players preparing for international competition."
        },
        {
            icon: <Trophy className="w-8 h-8" />,
            title: "National Tournaments",
            description: "Official SAPA rankings events held monthly in major cities nationwide."
        }
    ];

    return (
        <section id="services" className="py-24 bg-black/50 relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-padel-green/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />

            <div className="container mx-auto px-6 md:px-20 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-center mb-16"
                >
                    <span className="text-padel-green font-bold tracking-widest uppercase text-sm">Services</span>
                    <h2 className="text-4xl md:text-5xl font-bold text-white mt-4">Elevate Your Game</h2>
                </motion.div>

                <div className="grid md:grid-cols-4 gap-6">
                    {services.map((service, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="bg-white/5 backdrop-blur-sm border border-white/10 p-8 rounded-2xl hover:bg-white/10 transition-colors group cursor-pointer"
                        >
                            <div className="w-16 h-16 bg-padel-green/10 rounded-xl flex items-center justify-center text-padel-green mb-6 group-hover:scale-110 transition-transform">
                                {service.icon}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{service.title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed">{service.description}</p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Services;
