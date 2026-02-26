import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User, MapPin, Calendar, Trophy } from 'lucide-react';

const fixtures = [
    { id: 1, date: "7 FEB", event: "Padel Odyssey Finals", city: "JHB", venue: "KCC", type: "Gold", confirmed: true },
    { id: 4, date: "21 MAR", event: "Kings of the Court", city: "JHB", venue: "TBC", type: "Gold", confirmed: false },
    { id: 'M1', date: "28 MAR", event: "JHB Major 1", city: "JHB", venue: "KCC/NetSet", type: "Major", confirmed: true },
    { id: 'M2', date: "18 APR", event: "CT Major 2", city: "CT", venue: "R&B CT", type: "Major", confirmed: true },
    { id: 7, date: "2 MAY", event: "Vaal Open", city: "VAAL", venue: "10by20", type: "Gold", confirmed: true },
    { id: 'K1', date: "9 MAY", event: "Chiquita Cup", city: "JHB", venue: "KCC?", type: "Affiliated", confirmed: true },
    { id: 8, date: "23 MAY", event: "Arturf", city: "CT", venue: "Arturf", type: "Gold", confirmed: true },
    { id: 9, date: "30 MAY", event: "Virgin Padel Gold", city: "PTA", venue: "Groenkloof", type: "Gold", confirmed: true },
];

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
};

const Fixtures = () => {
    const [imageError, setImageError] = useState(false);



    return (
        <section className="py-24 bg-[#0F172A] border-t border-white/5 relative overflow-hidden">
            {/* Background Elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-[var(--sa-blue)] rounded-full blur-[120px] opacity-10" />
                <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-[var(--sa-green)] rounded-full blur-[120px] opacity-5" />
            </div>

            <div className="container mx-auto px-6 md:px-20 relative z-10">
                <div className="flex flex-col md:flex-row gap-16">
                    {/* Upcoming Fixtures */}
                    <div className="flex-1">
                        <div className="mb-8">
                            <span className="font-heading text-xs font-bold tracking-[0.2em] text-[var(--sa-yellow)] uppercase mb-2 block">
                                2025 Season
                            </span>
                            <h3 className="text-3xl font-bold text-white">Upcoming Fixtures</h3>
                        </div>

                        <motion.div
                            variants={container}
                            initial="hidden"
                            whileInView="show"
                            viewport={{ once: true, margin: "-50px" }}
                            className="grid grid-cols-1 lg:grid-cols-2 gap-4"
                        >
                            {fixtures.map((fixture) => (
                                <motion.div
                                    key={fixture.id}
                                    variants={item}
                                    className="group relative overflow-hidden rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-2xl hover:shadow-[var(--sa-blue)]/20"
                                >
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />

                                    <div className="p-3 flex items-stretch h-20">
                                        {/* Date Block */}
                                        <div className="w-16 flex-shrink-0 bg-black/20 rounded-lg flex flex-col items-center justify-center border border-white/5 group-hover:border-[var(--sa-yellow)]/50 transition-colors duration-300">
                                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-none mb-1">
                                                {fixture.date.split(' ')[1]}
                                            </span>
                                            <span className="text-lg font-bold text-white font-heading leading-none">
                                                {fixture.date.split(' ')[0]}
                                            </span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-grow flex items-center justify-between px-4">
                                            <div className="flex flex-col">
                                                <h3 className="text-white font-bold text-sm tracking-wide group-hover:text-[var(--sa-yellow)] transition-colors duration-300 line-clamp-1">
                                                    {fixture.event}
                                                </h3>
                                                <div className="flex items-center gap-3 text-[10px] font-medium text-white/50 uppercase tracking-wider mt-1">
                                                    <div className="flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {fixture.city}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {fixture.venue}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="hidden sm:flex flex-col items-end gap-2 ml-2">
                                                <span className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest border ${fixture.type === 'Major'
                                                    ? 'bg-[var(--sa-yellow)]/10 text-[var(--sa-yellow)] border-[var(--sa-yellow)]/20'
                                                    : 'bg-[var(--sa-green)]/10 text-[var(--sa-green)] border-[var(--sa-green)]/20'
                                                    }`}>
                                                    {fixture.type}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>

                        <div className="mt-8 text-center md:text-left">
                            <button className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/10 hover:scale-105 transition-all duration-300">
                                View Full Calendar
                            </button>
                        </div>

                        {/* League Standings - New Section to fill space */}
                        <div className="mt-12 pt-8 border-t border-white/5">
                            <div className="flex items-center justify-between mb-6">
                                <h4 className="text-xl font-bold text-white">League Standings</h4>
                                <span className="text-xs text-gray-400 uppercase tracking-wider">Div 1</span>
                            </div>
                            <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                                            <th className="py-3 px-4 font-semibold">Team</th>
                                            <th className="py-3 px-4 font-semibold text-center">P</th>
                                            <th className="py-3 px-4 font-semibold text-center">W</th>
                                            <th className="py-3 px-4 font-semibold text-center">Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {[
                                            { team: "Le Grange / Ashforth", p: 12, w: 10, pts: 34 },
                                            { team: "Van Antwerpen / Van Heerden", p: 12, w: 9, pts: 31 },
                                            { team: "Smith / Jones", p: 11, w: 8, pts: 28 },
                                            { team: "Davids / Deutschmann", p: 10, w: 7, pts: 25 },
                                        ].map((row, i) => (
                                            <tr key={i} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="py-3 px-4 font-medium text-white">
                                                    <div className="flex items-center gap-3">
                                                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-padel-green text-black' : 'bg-white/10 text-gray-400'}`}>
                                                            {i + 1}
                                                        </span>
                                                        {row.team}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-center text-gray-400">{row.p}</td>
                                                <td className="py-3 px-4 text-center text-gray-400">{row.w}</td>
                                                <td className="py-3 px-4 text-center font-bold text-padel-green">{row.pts}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Recent Results & Weekly Highlight */}
                    <div className="md:w-1/3 space-y-12">
                        {/* Results List */}
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-2xl font-bold text-white">Recent Results</h3>
                                <a
                                    href="https://www.rankedin.com/en/tournament/63194/padel-odyssey-summer-finals/results"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-white/10 hover:text-padel-green transition-all"
                                >
                                    See More
                                </a>
                            </div>

                            <div className="space-y-3 mb-10">
                                {/* Rank 1 */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative overflow-hidden flex items-center gap-4">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--sa-yellow)]"></div>
                                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/10 rounded-full font-bold text-white text-sm">1</div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-white font-semibold text-sm truncate flex items-center gap-2">
                                                <span className="text-lg">🇿🇦</span> Richard Ashforth
                                            </span>
                                            <span className="text-xs text-padel-green font-mono">19.25</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-semibold text-sm truncate flex items-center gap-2">
                                                <span className="text-lg">🇿🇦</span> Luan Krige
                                            </span>
                                            <span className="text-xs text-padel-green font-mono">19.47</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block flex-shrink-0 text-center pl-3 border-l border-white/10">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider">SAPA</div>
                                        <div className="text-base font-bold text-white">1000</div>
                                    </div>
                                    <div className="absolute right-12 top-1/2 -translate-y-1/2 text-[var(--sa-yellow)] opacity-10 pointer-events-none">
                                        <Trophy size={32} />
                                    </div>
                                </div>

                                {/* Rank 2 */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative overflow-hidden flex items-center gap-4">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gray-400"></div>
                                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/10 rounded-full font-bold text-white text-sm">2</div>
                                    <div className="flex-grow min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-white font-semibold text-sm truncate flex items-center gap-2">
                                                <span className="text-lg">🇿🇦</span> Tremayne Mitchell
                                            </span>
                                            <span className="text-xs text-padel-green font-mono">18.73</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-semibold text-sm truncate flex items-center gap-2">
                                                <span className="text-lg">🇿🇦</span> Aidan Carrazedo
                                            </span>
                                            <span className="text-xs text-padel-green font-mono">18.73</span>
                                        </div>
                                    </div>
                                    <div className="hidden sm:block flex-shrink-0 text-center pl-3 border-l border-white/10">
                                        <div className="text-[9px] text-gray-400 uppercase tracking-wider">SAPA</div>
                                        <div className="text-base font-bold text-white">600</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Highest Skill Jump Blocks */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <h3 className="text-lg font-bold text-white">Highest Skill Jump</h3>
                                <span className="text-[10px] bg-padel-green text-black font-bold px-2 py-0.5 rounded uppercase">Match Results</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Block 1 */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-3 relative group hover:bg-white/10 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-white">
                                                <span>🇿🇦</span> T. Mitchell <span className="text-padel-green ml-1">+2.18</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-white">
                                                <span>🇿🇦</span> A. Carrazedo <span className="text-padel-green ml-1">+2.18</span>
                                            </div>
                                        </div>
                                        <div className="text-xl font-bold text-white bg-white/10 w-8 h-8 rounded flex items-center justify-center">1</div>
                                    </div>
                                    <div className="h-px w-full bg-white/10 my-2"></div>
                                    <div className="flex justify-between items-end opacity-60">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-300">
                                                <span>🇿🇦</span> M. Stillerman
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-300">
                                                <span>🇿🇦</span> P. Le Grange
                                            </div>
                                        </div>
                                        <div className="text-lg font-bold text-gray-400 px-2">0</div>
                                    </div>
                                </div>

                                {/* Block 2 */}
                                <div className="bg-white/5 border border-white/10 rounded-xl p-3 relative group hover:bg-white/10 transition-colors">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-white">
                                                <span>🇿🇦</span> J. Van Rensburg <span className="text-padel-green ml-1">+1.97</span>
                                            </div>
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-white">
                                                <span>🇿🇦</span> Y. Assamo <span className="text-padel-green ml-1">+0.78</span>
                                            </div>
                                        </div>
                                        <div className="text-xl font-bold text-white bg-white/10 w-8 h-8 rounded flex items-center justify-center">6</div>
                                    </div>
                                    <div className="h-px w-full bg-white/10 my-2"></div>
                                    <div className="flex justify-between items-end opacity-60">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 text-[10px] text-gray-300">
                                                <span>🇿🇦</span> D. Allardice
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-300">
                                                <span>🇿🇦</span> J. Sauer
                                            </div>
                                        </div>
                                        <div className="text-lg font-bold text-gray-400 px-2">3</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Weekly Highest Jump */}
                        <div className="bg-gradient-to-b from-[#1E293B] to-[#0F172A] border border-white/10 rounded-3xl p-8 text-center relative overflow-hidden group">
                            {/* Decorative background element */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-padel-green shadow-[0_0_20px_rgba(163,230,53,0.5)]" />
                            <div className="absolute -top-10 -right-10 w-32 h-32 bg-padel-green/10 rounded-full blur-3xl group-hover:bg-padel-green/20 transition-all duration-700" />

                            <h3 className="text-white font-bold text-xl mb-6 flex items-center justify-center gap-2">
                                <span className="text-padel-green">Weekly</span> Highest Jump
                            </h3>

                            <div className="relative inline-block mb-4 group-hover:scale-105 transition-transform duration-500">
                                <div className="w-24 h-24 rounded-full p-1 bg-gradient-to-br from-padel-green to-transparent mx-auto">
                                    <div className="w-full h-full rounded-full overflow-hidden border-2 border-[#0F172A] bg-[#1E293B] flex items-center justify-center">
                                        <User size={48} className="text-gray-400" />
                                    </div>
                                </div>
                                <div className="absolute bottom-0 right-0 bg-black text-white text-xs px-2 py-0.5 rounded border border-white/20">
                                    🇿🇦
                                </div>
                            </div>

                            <div className="mb-4">
                                <h4 className="text-white font-bold text-lg">Richard Ashforth</h4>
                                <p className="text-gray-400 text-xs uppercase tracking-widest">SAPA Ranked</p>
                            </div>

                            <div className="flex items-center justify-center gap-2 mb-8 bg-white/5 py-3 rounded-xl border border-white/5">
                                <span className="text-4xl font-black text-white">0</span>
                                <div className="flex flex-col items-center">
                                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[10px] border-b-padel-green" />
                                    <span className="text-[10px] text-padel-green font-bold uppercase">Rank #1</span>
                                </div>
                            </div>

                            <div className="flex justify-between items-end border-t border-white/10 pt-6">
                                <div className="text-left">
                                    <p className="text-3xl font-bold text-white">1</p>
                                    <p className="text-gray-500 text-[10px] font-bold uppercase tracking-wider">Current Rank</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-bold text-white flex items-center justify-end gap-2">
                                        <span className="text-padel-green">10</span>
                                        <span className="text-gray-600 text-xl">/</span>
                                        <span className="text-red-400">1</span>
                                    </p>
                                    <div className="flex justify-end gap-3 text-gray-500 text-[10px] font-bold uppercase tracking-wider">
                                        <span>W</span>
                                        <span>L</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Fixtures;
