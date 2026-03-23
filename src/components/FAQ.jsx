import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const FAQ = () => {
    const [activeIndex, setActiveIndex] = useState(null);

    const questions = [
        {
            q: "What is 4M Padel?",
            a: "4M Padel is the central online platform for padel in South Africa — bringing together tournaments, rankings, players, and all SAPA-sanctioned events in one place."
        },
        {
            q: "How do I enter a SAPA tournament?",
            a: "Create a player profile on Rankedin (free or Pro), then enter your chosen event and category via Rankedin. You must also create a player profile on the 4M Padel website and purchase your SAPA license on your profile page."
        },
        {
            q: "Do I need a player profile?",
            a: "Yes. You need a Rankedin profile to enter tournaments, and a 4M Padel profile to manage your license and player information."
        },
        {
            q: "Do I need a SAPA license to play?",
            a: "Yes. A valid SAPA license is required to compete in most sanctioned events and to earn official ranking points."
        },
        {
            q: "How do rankings work?",
            a: "Players earn points based on their performance in SAPA-sanctioned tournaments. The better your result, the more points you earn."
        },
        {
            q: "How many results count towards my ranking?",
            a: "Your best 8 results count towards your official SAPA ranking. Rankings operate on a rolling 12-month period, meaning points expire after 12 months and must be replaced by new results."
        },
        {
            q: "What are the different tournament tiers?",
            a: "Tournaments are divided into tiers — Major, Super Gold, Gold, Silver, and Bronze — with higher tiers offering more ranking points and stronger competition."
        },
        {
            q: "What is the Broll Pro Tour?",
            a: "The Broll Pro Tour is a series of premium men’s pro events. Players earn separate Broll ranking points, with the top player at the end of the season winning a significant cash prize."
        },
        {
            q: "Do Broll Tour events count towards SAPA rankings?",
            a: "Yes. Broll Pro Tour events count towards both the Broll leaderboard and official SAPA rankings."
        },
        {
            q: "Where can I see my ranking and results?",
            a: "You can view your ranking in the rankings section of the website, where you can also search and track other players."
        },
        {
            q: "Can international players compete in SAPA events?",
            a: "Yes. International players are welcome to compete, except in specific events that may be restricted to South African players."
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
