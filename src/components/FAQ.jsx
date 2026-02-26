import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const FAQ = () => {
    const [activeIndex, setActiveIndex] = useState(null);

    const questions = [
        {
            q: "How do I register for SAPA events?",
            a: "Registration is done via the 4M Padel platform. You'll need a valid SA ID or passport and an active player profile."
        },
        {
            q: "Where are the main tournaments held?",
            a: "Major slams rotate between Johannesburg (Wanderers), Cape Town (Camps Bay), and Durban (Westville)."
        },
        {
            q: "How does the ranking system work?",
            a: "Points are awarded based on tournament tier (Grand Slam, Major, Regional) and final position. Rankings update weekly on Tuesdays."
        },
        {
            q: "Can international players compete?",
            a: "Yes, international players are welcome to compete in Open categories. Contact admin@4mpadel.co.za for licensing."
        }
    ];

    return (
        <section className="py-24 bg-black/50">
            <div className="container mx-auto px-6 md:px-20 max-w-4xl">
                <h2 className="text-4xl font-bold text-white mb-12 text-center">Frequently Asked Questions</h2>

                <div className="space-y-4">
                    {questions.map((item, index) => (
                        <div key={index} className="border-b border-white/10">
                            <button
                                onClick={() => setActiveIndex(activeIndex === index ? null : index)}
                                className="w-full py-6 flex justify-between items-center text-left hover:text-padel-green transition-colors"
                            >
                                <span className="text-xl font-medium text-white">{item.q}</span>
                                <span className="text-padel-green">
                                    {activeIndex === index ? <Minus /> : <Plus />}
                                </span>
                            </button>
                            <AnimatePresence>
                                {activeIndex === index && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <p className="text-gray-400 pb-6 leading-relaxed">
                                            {item.a}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default FAQ;
