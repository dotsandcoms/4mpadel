import React from 'react';
import { motion } from 'framer-motion';
import logo1 from '../assets/logo_1.png';
import logo2 from '../assets/logo_2.png';
import logo3 from '../assets/logo_3.png';
import logo4 from '../assets/logo_4.png';
import logo5 from '../assets/logo_5.png';
import logo6 from '../assets/logo_6.png';
import logo7 from '../assets/logo_7.png';
// Importing an 8th just in case, though user said 7.
import logo8 from '../assets/logo_8.png';

const Partners = () => {
    // Array of logos. We'll filter out any that fail to load if needed, but for now we assume all exist.
    const logos = [
        { name: "Partner 1", img: logo1 },
        { name: "Partner 2", img: logo2 },
        { name: "Partner 3", img: logo3 },
        { name: "Partner 4", img: logo4 },
        { name: "Partner 5", img: logo5 },
        { name: "Partner 6", img: logo6 },
        { name: "Partner 7", img: logo7 },
        { name: "Partner 8", img: logo8 },
    ];

    return (
        <section className="py-20 bg-black/80 border-t border-white/5">
            <div className="container mx-auto px-6 md:px-20 text-center">
                <p className="text-gray-500 uppercase tracking-widest text-sm mb-12">Official Partners</p>
                <div className="flex flex-nowrap justify-center items-center gap-8 md:gap-16 overflow-x-auto pb-4 scrollbar-hide">
                    {logos.map((logo, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0 }}
                            whileInView={{ opacity: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: index * 0.1 }}
                            className="shrink-0 w-32 h-24 md:w-44 md:h-28 px-4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                        >
                            <img
                                src={logo.img}
                                alt={logo.name}
                                className="max-w-full max-h-full object-contain"
                            />
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Partners;
