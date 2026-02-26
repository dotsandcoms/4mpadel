import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, TrendingUp, Star, ChevronDown, CheckCircle2 } from 'lucide-react';

const RankingExplanation = () => (
  <div className="grid md:grid-cols-3 gap-6 mb-20 relative z-10">
    {[
      {
        icon: <Target className="w-8 h-8 text-padel-green" />,
        title: 'Play Tournaments',
        desc: 'Compete in SAPA sanctioned events across various tiers, from Bronze up to Major.',
      },
      {
        icon: <Trophy className="w-8 h-8 text-padel-green" />,
        title: 'Earn Points',
        desc: 'Your performance dictates your points. Higher tier events offer significantly larger rewards.',
      },
      {
        icon: <TrendingUp className="w-8 h-8 text-padel-green" />,
        title: 'Climb the Ranks',
        desc: 'Only your Best 8 tournaments count towards your official national ranking. (Cat 3 & 4 proportionate where applicable)',
      }
    ].map((step, idx) => (
      <motion.div
        key={idx}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 * idx }}
        className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-colors group"
      >
        <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-padel-green/20 transition-all">
          {step.icon}
        </div>
        <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
        <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
      </motion.div>
    ))}
  </div>
);

const TierCard = ({ tier }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      className={`border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md transition-all duration-300 relative group
            ${isOpen ? 'bg-white/10 shadow-2xl shadow-black/50' : 'bg-white/5 hover:bg-white/10'}`}
    >
      {/* Glowing background gradient based on tier color */}
      <div className={`absolute top-0 right-0 w-64 h-64 ${tier.bgGradient} opacity-20 blur-[100px] rounded-full pointer-events-none group-hover:opacity-40 transition-opacity`} />

      {/* Header / Clickable area */}
      <div
        className="p-6 md:p-8 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-6">
          <div className={`w-16 h-16 rounded-2xl ${tier.bgIcon} flex items-center justify-center shadow-lg flex-shrink-0`}>
            <Star className={`w-8 h-8 ${tier.iconColor}`} />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-wider mb-1">
              {tier.type} <span className="text-gray-500 font-medium">Tier</span>
            </h2>
            <div className="flex items-center gap-4 text-sm font-medium">
              <span className="text-padel-green flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Up to {tier.maxPoints} pts
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-auto">
          <span className="text-sm font-bold text-gray-500 uppercase tracking-widest hidden md:block">
            {isOpen ? 'Close details' : 'View breakdown'}
          </span>
          <button className={`w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center transition-transform duration-300 ${isOpen ? 'rotate-180 bg-white/20' : ''}`}>
            <ChevronDown className="w-6 h-6 text-white" />
          </button>
        </div>
      </div>

      {/* Expandable Table Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 bg-black/40"
          >
            <div className="p-6 md:p-8 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 w-24">Cat</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Winner</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Finals</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Semis</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">Quarters</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right">R16</th>
                    <th className="py-4 px-4 text-xs uppercase tracking-widest font-bold text-gray-400 border-b border-white/10 text-right pr-8">R32</th>
                  </tr>
                </thead>
                <tbody>
                  {tier.rows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-4 px-4 border-b border-white/5">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${row.cat === '1' ? tier.bgIcon + ' ' + tier.iconColor : 'bg-white/10 text-gray-300'}`}>
                          {row.cat}
                        </span>
                      </td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-black text-white text-lg' : 'font-medium text-gray-400'}`}>{row.winner}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.finals}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.semis}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.quarters}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.r16}</td>
                      <td className={`py-4 px-4 text-right border-b border-white/5 pr-8 ${row.bold ? 'font-bold text-gray-200' : 'text-gray-400'}`}>{row.r32}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Rankings = () => {
  const rankingData = [
    {
      type: 'MAJOR',
      maxPoints: '2,000',
      bgGradient: 'bg-red-500',
      bgIcon: 'bg-red-500/20',
      iconColor: 'text-red-500',
      rows: [
        { cat: '1', winner: '2,000', finals: '1,200', semis: '720', quarters: '360', r16: '180', r32: '90', bold: true },
        { cat: '2', winner: '800', finals: '480', semis: '240', quarters: '120', r16: '60', r32: '30', bold: false }
      ]
    },
    {
      type: 'S GOLD',
      maxPoints: '1,500',
      bgGradient: 'bg-amber-600',
      bgIcon: 'bg-amber-600/20',
      iconColor: 'text-amber-500',
      rows: [
        { cat: '1', winner: '1,500', finals: '900', semis: '540', quarters: '270', r16: '135', r32: '68', bold: true },
        { cat: '2', winner: '600', finals: '360', semis: '216', quarters: '130', r16: '78', r32: '47', bold: false }
      ]
    },
    {
      type: 'GOLD',
      maxPoints: '1,000',
      bgGradient: 'bg-yellow-500',
      bgIcon: 'bg-yellow-500/20',
      iconColor: 'text-yellow-400',
      rows: [
        { cat: '1', winner: '1,000', finals: '600', semis: '360', quarters: '180', r16: '90', r32: '45', bold: true },
        { cat: '2', winner: '400', finals: '240', semis: '144', quarters: '72', r16: '36', r32: '18', bold: false }
      ]
    },
    {
      type: 'SILVER',
      maxPoints: '600',
      bgGradient: 'bg-gray-400',
      bgIcon: 'bg-gray-400/20',
      iconColor: 'text-gray-300',
      rows: [
        { cat: '1', winner: '600', finals: '360', semis: '180', quarters: '90', r16: '45', r32: '22', bold: true },
        { cat: '2', winner: '240', finals: '144', semis: '86', quarters: '43', r16: '22', r32: '11', bold: false }
      ]
    },
    {
      type: 'BRONZE',
      maxPoints: '300',
      bgGradient: 'bg-orange-800',
      bgIcon: 'bg-orange-800/20',
      iconColor: 'text-orange-700',
      rows: [
        { cat: '1', winner: '300', finals: '180', semis: '90', quarters: '45', r16: '25', r32: '14', bold: true },
        { cat: '2', winner: '120', finals: '72', semis: '43', quarters: '22', r16: '11', r32: '5', bold: false }
      ]
    }
  ];

  return (
    <div className="bg-[#0F172A] min-h-screen pt-32 pb-24 font-sans selection:bg-padel-green selection:text-black">
      {/* Background elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-padel-green/10 blur-[150px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[150px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-[0.03]" />
      </div>

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        {/* Hero Header */}
        <div className="text-center mb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-padel-green text-sm font-bold uppercase tracking-widest mb-8"
          >
            <span className="w-2 h-2 rounded-full bg-padel-green animate-pulse" />
            Live Standings
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-6 uppercase"
          >
            How the <span className="text-padel-green">Rankings</span> Work
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto"
          >
            The SAPA Tour points breakdown for 2026. Master the tier system, compete in the right categories, and build your national profile.
          </motion.p>
        </div>

        {/* Info Cards */}
        <RankingExplanation />

        {/* Points Breakdown Header */}
        <div className="mb-10 text-center md:text-left flex flex-col md:flex-row md:items-end justify-between border-b border-white/10 pb-6 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Points Breakdown</h2>
            <p className="text-gray-400">Expand each tier to see detailed point structures by category (Cat 1 and Cat 2).</p>
          </div>
        </div>

        {/* Expandable Tiers List */}
        <div className="space-y-6">
          {rankingData.map((tier) => (
            <TierCard key={tier.type} tier={tier} />
          ))}
        </div>

      </div>
    </div>
  );
};

export default Rankings;
