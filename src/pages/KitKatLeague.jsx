import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navbar from '../components/Navbar';
import { Trophy, Calendar, Users, MapPin, ChevronRight, Search, Activity, Swords, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import kitkatLogo from '../assets/kitkat_logo.png';
import sapaLogo from '../assets/sapa-logo.svg';
const KitKatLeague = () => {
    const [activeTab, setActiveTab] = useState('standings');
    const [playerSearch, setPlayerSearch] = useState('');

    // --- MOCK DATA ---
    const kitkatRed = '#D41B2C';

    const teamsData = [
        { id: 1, name: 'Atholl Aces', short: 'ATH', captain: 'Warren Kuhn', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54b09a94af4c02884956a_Atholl_Aces_logo-removebg-preview.png" alt="Atholl Aces" className="w-[80%] h-[80%] object-contain" />, color: 'from-slate-100 to-white', border: 'border-slate-200', text: 'text-slate-800' },
        { id: 2, name: 'Brooklyn Bulls', short: 'BRK', captain: 'Luan Krige', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69c15bd74d8842d49b6e3138_69b82ae370117be1208331f4_1%20Background%20Removed.png" alt="Brooklyn Bulls" className="w-[80%] h-[80%] object-contain" />, color: 'from-amber-50 to-white', border: 'border-amber-200', text: 'text-amber-900' },
        { id: 3, name: 'Centurion Cobras', short: 'CEN', captain: 'Adam Van Harte', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54bd298c58b1f696a6e9a_Centurion_Cobras-removebg-preview.png" alt="Centurion Cobras" className="w-[80%] h-[80%] object-contain" />, color: 'from-emerald-50 to-white', border: 'border-emerald-200', text: 'text-emerald-900' },
        { id: 4, name: 'Hyde Park Falcons', short: 'HYD', captain: 'Richard Ashforth', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54ba2a0c4023c604ff56a_Hyde_Park_Falcons-removebg-preview.png" alt="Hyde Park Falcons" className="w-[80%] h-[80%] object-contain" />, color: 'from-sky-50 to-white', border: 'border-sky-200', text: 'text-sky-900' },
        { id: 5, name: 'Melrose Mavericks', short: 'MEL', captain: 'Chevaan Davids', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54bae98c58b1f696a4edc_Melrose_Mavericks-removebg-preview.png" alt="Melrose Mavericks" className="w-[80%] h-[80%] object-contain" />, color: 'from-purple-50 to-white', border: 'border-purple-200', text: 'text-purple-900' },
        { id: 6, name: 'Menlyn Sharks', short: 'MEN', captain: 'Zaidy Patel', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54b926c9d03a0f10fd583_Menlyn_Sharks-removebg-preview.png" alt="Menlyn Sharks" className="w-[80%] h-[80%] object-contain" />, color: 'from-blue-50 to-white', border: 'border-blue-200', text: 'text-blue-900' },
        { id: 7, name: 'Sandton Stallions', short: 'SAN', captain: 'Tremayne Mitchell', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54bc698c58b1f696a6693_Sandton_Stallions-removebg-preview.png" alt="Sandton Stallions" className="w-[80%] h-[80%] object-contain" />, color: 'from-orange-50 to-white', border: 'border-orange-200', text: 'text-orange-900' },
        { id: 8, name: 'Waterfall Wolves', short: 'WAT', captain: 'Jason Blakey-Milner', logo: <img src="https://cdn.prod.website-files.com/69b6a6d1000a9da16f9d86ec/69d54bb99d1abc9ebacedafb_Waterfall_Wolves-removebg-preview.png" alt="Waterfall Wolves" className="w-[80%] h-[80%] object-contain" />, color: 'from-stone-100 to-white', border: 'border-stone-200', text: 'text-stone-800' },
    ];

    const standingsData = [
        { rank: 1, team: teamsData[0], played: 14, won: 11, lost: 3, points: 33, streak: ['W', 'W', 'W', 'L', 'W'] },
        { rank: 2, team: teamsData[3], played: 14, won: 10, lost: 4, points: 30, streak: ['W', 'L', 'W', 'W', 'W'] },
        { rank: 3, team: teamsData[1], played: 14, won: 9, lost: 5, points: 27, streak: ['L', 'W', 'W', 'L', 'W'] },
        { rank: 4, team: teamsData[7], played: 14, won: 8, lost: 6, points: 24, streak: ['W', 'L', 'L', 'W', 'L'] },
        { rank: 5, team: teamsData[6], played: 14, won: 7, lost: 7, points: 21, streak: ['L', 'L', 'W', 'W', 'L'] },
        { rank: 6, team: teamsData[2], played: 14, won: 5, lost: 9, points: 15, streak: ['L', 'W', 'L', 'L', 'L'] },
        { rank: 7, team: teamsData[5], played: 14, won: 4, lost: 10, points: 12, streak: ['L', 'L', 'L', 'W', 'L'] },
        { rank: 8, team: teamsData[4], played: 14, won: 2, lost: 12, points: 6, streak: ['L', 'L', 'L', 'L', 'L'] },
    ];

    const fixturesData = [
        { id: 1, date: 'June 2nd, 2026', time: '18:00', team1: teamsData[0], team2: teamsData[5], venue: 'Center Court', status: 'upcoming' },
        { id: 2, date: 'June 2nd, 2026', time: '19:30', team1: teamsData[6], team2: teamsData[7], venue: 'Court 2', status: 'upcoming' },
        { id: 3, date: 'June 3rd, 2026', time: '18:00', team1: teamsData[2], team2: teamsData[4], venue: 'Center Court', status: 'upcoming' },
        { id: 4, date: 'June 3rd, 2026', time: '19:30', team1: teamsData[1], team2: teamsData[3], venue: 'Court 3', status: 'upcoming' },
    ];

    // RAW PLAYER DATA FROM kitkatpadel.com
    const rawPlayers = [
        { "name": "Zaidy Patel", "team": "Menlyn Sharks" },
        { "name": "Pierre Le grange", "team": "Menlyn Sharks" },
        { "name": "Jason Hewitt", "team": "Menlyn Sharks" },
        { "name": "Jamey Sutherland", "team": "Menlyn Sharks" },
        { "name": "Aidan Carrazedo", "team": "Menlyn Sharks" },
        { "name": "Dillon van der Haer", "team": "Menlyn Sharks" },
        { "name": "Kenan Staphorst", "team": "Menlyn Sharks" },
        { "name": "Warren Kuhn", "team": "Atholl Aces" },
        { "name": "Farhaan Sayanvala", "team": "Atholl Aces" },
        { "name": "Steven Loock", "team": "Atholl Aces" },
        { "name": "Riyaadh Motani", "team": "Atholl Aces" },
        { "name": "Shaun Brookes", "team": "Atholl Aces" },
        { "name": "Dillan Parau", "team": "Atholl Aces" },
        { "name": "Luan Krige", "team": "Brooklyn Bulls" },
        { "name": "Charl Vos", "team": "Brooklyn Bulls" },
        { "name": "Keagan Rooy", "team": "Brooklyn Bulls" },
        { "name": "Paul Anderson", "team": "Brooklyn Bulls" },
        { "name": "Dudley Smith", "team": "Brooklyn Bulls" },
        { "name": "Nicholas Keevy", "team": "Brooklyn Bulls" },
        { "name": "Gary Pilz", "team": "Brooklyn Bulls" },
        { "name": "Cristiano Da Costa", "team": "Brooklyn Bulls" },
        { "name": "Shuaib Hassen", "team": "Brooklyn Bulls" },
        { "name": "Richard Ashforth", "team": "Hyde Park Falcons" },
        { "name": "Shaun Leagas", "team": "Hyde Park Falcons" },
        { "name": "Yasser Assamo", "team": "Hyde Park Falcons" },
        { "name": "Kyle Olivier", "team": "Hyde Park Falcons" },
        { "name": "Justin Brivik", "team": "Hyde Park Falcons" },
        { "name": "Mohammed Mather", "team": "Hyde Park Falcons" },
        { "name": "Derek Alexander", "team": "Hyde Park Falcons" },
        { "name": "Eras Labuschagne", "team": "Hyde Park Falcons" },
        { "name": "Hamza Peer", "team": "Hyde Park Falcons" },
        { "name": "Jonathan Boynton-Lee", "team": "Hyde Park Falcons" },
        { "name": "Chevaan Davids", "team": "Melrose Mavericks" },
        { "name": "Joel Van Rensburg", "team": "Melrose Mavericks" },
        { "name": "Juan-Louis Van Antwerpen", "team": "Melrose Mavericks" },
        { "name": "Gustav Hefer", "team": "Melrose Mavericks" },
        { "name": "Zaid Hassim", "team": "Melrose Mavericks" },
        { "name": "Sameer Mohamed", "team": "Melrose Mavericks" },
        { "name": "Muhammed Arabi", "team": "Melrose Mavericks" },
        { "name": "Mondrean Hattingh", "team": "Melrose Mavericks" },
        { "name": "Ludwig Gostmann", "team": "Melrose Mavericks" },
        { "name": "Dimitri Sayegh", "team": "Melrose Mavericks" },
        { "name": "Isa Choonara", "team": "Melrose Mavericks" },
        { "name": "Tremayne Mitchell", "team": "Sandton Stallions" },
        { "name": "Joshua Van Rensburg", "team": "Sandton Stallions" },
        { "name": "Tiaan Erasmus", "team": "Sandton Stallions" },
        { "name": "Brendon Peters", "team": "Sandton Stallions" },
        { "name": "Ben Jugmohan", "team": "Sandton Stallions" },
        { "name": "Arek Michniewicz", "team": "Sandton Stallions" },
        { "name": "Lineshen Moodley", "team": "Sandton Stallions" },
        { "name": "Jason Blakey-Milner", "team": "Waterfall Wolves" },
        { "name": "Joshua Heath", "team": "Waterfall Wolves" },
        { "name": "David Allardice", "team": "Waterfall Wolves" },
        { "name": "Jarryd Sauer", "team": "Waterfall Wolves" },
        { "name": "Lee Aronson", "team": "Waterfall Wolves" },
        { "name": "Arushen Govender", "team": "Waterfall Wolves" },
        { "name": "James Sweeney", "team": "Waterfall Wolves" },
        { "name": "Adam Van Harte", "team": "Centurion Cobras" },
        { "name": "Egmond Van heerden", "team": "Centurion Cobras" },
        { "name": "Dean Nortier", "team": "Centurion Cobras" },
        { "name": "Nikhil Joshi", "team": "Centurion Cobras" },
        { "name": "Dylan Carneiro", "team": "Centurion Cobras" },
        { "name": "HP Luus", "team": "Centurion Cobras" },
        { "name": "Jason Raw", "team": "Centurion Cobras" },
        { "name": "Sajid Abdulla", "team": "Centurion Cobras" },
        { "name": "Ayaaz Omar", "team": "Centurion Cobras" }
    ];

    const playersWithDetails = useMemo(() => {
        return rawPlayers.map(player => {
            const teamObj = teamsData.find(t => t.name === player.team) || teamsData[0];
            return {
                ...player,
                teamData: teamObj
            };
        });
    }, []);

    const filteredPlayers = useMemo(() => {
        if (!playerSearch) return playersWithDetails;
        return playersWithDetails.filter(p =>
            p.name.toLowerCase().includes(playerSearch.toLowerCase()) ||
            p.team.toLowerCase().includes(playerSearch.toLowerCase())
        );
    }, [playerSearch, playersWithDetails]);

    const groupedPlayers = useMemo(() => {
        const groups = {};
        teamsData.forEach(team => {
            const teamPlayers = filteredPlayers.filter(p => p.team === team.name);
            if (teamPlayers.length > 0) {
                groups[team.id] = {
                    team,
                    players: teamPlayers.sort((a, b) => a.name.localeCompare(b.name))
                };
            }
        });
        return Object.values(groups);
    }, [filteredPlayers]);

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
    };

    const floatVariants = {
        animate: { y: [-5, 5, -5], transition: { duration: 4, repeat: Infinity, ease: "easeInOut" } }
    };

    // COMPONENTS
    const Podium = ({ topTeams }) => (
        <div className="flex justify-center items-end h-[250px] sm:h-[350px] md:h-[400px] mb-12 sm:mb-16 gap-2 sm:gap-4 md:gap-6 pt-4 sm:pt-10">
            {/* 2nd Place */}
            <motion.div
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="w-1/3 max-w-[160px] flex flex-col items-center relative"
            >
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center text-3xl md:text-5xl mb-2 sm:mb-4 border-2 sm:border-4 border-slate-300 shadow-xl z-10">
                    {topTeams[1].team.logo}
                </div>
                <div className="text-center mb-2 sm:mb-4 min-h-[30px] sm:min-h-[40px]">
                    <p className="font-bold text-slate-800 text-[10px] sm:text-xs md:text-sm tracking-widest uppercase truncate w-20 sm:w-24 md:w-full">{topTeams[1].team.short}</p>
                    <p className="text-slate-500 font-black text-sm sm:text-lg md:text-xl">{topTeams[1].points} <span className="text-[10px] sm:text-xs text-slate-400">pts</span></p>
                </div>
                <div className="w-full h-[80px] sm:h-[120px] md:h-[160px] bg-slate-100 rounded-t-xl sm:rounded-t-2xl border-x-2 border-t-2 border-slate-200 relative overflow-hidden flex justify-center pt-2 sm:pt-4 shadow-inner">
                    <span className="text-2xl sm:text-4xl font-black text-slate-300">2</span>
                </div>
            </motion.div>

            {/* 1st Place */}
            <motion.div
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
                className="w-1/3 max-w-[180px] flex flex-col items-center relative z-20"
            >
                <div className="absolute -top-4 sm:-top-6 text-amber-400 animate-pulse drop-shadow-md">
                    <Trophy className="w-6 h-6 sm:w-10 sm:h-10" />
                </div>
                <motion.div variants={floatVariants} animate="animate" className="w-16 h-16 sm:w-20 sm:h-20 md:w-28 md:h-28 bg-white rounded-full flex items-center justify-center text-4xl md:text-6xl mb-2 sm:mb-4 border-2 sm:border-4 border-amber-400 shadow-[0_5px_15px_rgba(251,191,36,0.3)] sm:shadow-[0_10px_30px_rgba(251,191,36,0.3)] z-10">
                    {topTeams[0].team.logo}
                </motion.div>
                <div className="text-center mb-2 sm:mb-4 min-h-[30px] sm:min-h-[40px]">
                    <p className="font-black text-slate-900 text-[11px] sm:text-sm md:text-base tracking-widest uppercase truncate w-24 sm:w-28 md:w-full">{topTeams[0].team.short}</p>
                    <p className="text-[#D41B2C] font-black text-base sm:text-xl md:text-2xl">{topTeams[0].points} <span className="text-[10px] sm:text-xs text-slate-400">pts</span></p>
                </div>
                <div className="w-full h-[120px] sm:h-[160px] md:h-[220px] bg-gradient-to-t from-slate-50 to-white rounded-t-xl sm:rounded-t-2xl border-x-2 border-t-2 border-amber-200 relative overflow-hidden flex justify-center pt-2 sm:pt-4 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                    <span className="text-3xl sm:text-5xl font-black text-amber-200">1</span>
                </div>
            </motion.div>

            {/* 3rd Place */}
            <motion.div
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="w-1/3 max-w-[160px] flex flex-col items-center relative"
            >
                <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-24 md:h-24 bg-white rounded-full flex items-center justify-center text-3xl md:text-5xl mb-2 sm:mb-4 border-2 sm:border-4 border-orange-300 shadow-xl z-10">
                    {topTeams[2].team.logo}
                </div>
                <div className="text-center mb-2 sm:mb-4 min-h-[30px] sm:min-h-[40px]">
                    <p className="font-bold text-slate-800 text-[10px] sm:text-xs md:text-sm tracking-widest uppercase truncate w-20 sm:w-24 md:w-full">{topTeams[2].team.short}</p>
                    <p className="text-orange-400 font-black text-sm sm:text-lg md:text-xl">{topTeams[2].points} <span className="text-[10px] sm:text-xs text-slate-400">pts</span></p>
                </div>
                <div className="w-full h-[60px] sm:h-[90px] md:h-[120px] bg-slate-50 rounded-t-xl sm:rounded-t-2xl border-x-2 border-t-2 border-orange-100 relative overflow-hidden flex justify-center pt-2 sm:pt-4 shadow-inner">
                    <span className="text-2xl sm:text-4xl font-black text-orange-200">3</span>
                </div>
            </motion.div>
        </div>
    );

    return (
        <div className="bg-[#FAF9F6] min-h-screen text-slate-900 font-sans selection:bg-[#D41B2C] selection:text-white">
            <Navbar isDark={true} />

            {/* ENHANCED DYNAMIC BACKGROUND */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#FAFAFA]">
                {/* Diagonal Slash Texture */}
                <div className="absolute top-0 left-0 w-full h-full opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #slate-900 0, #slate-900 1px, transparent 1px, transparent 24px)' }}></div>

                {/* Animated Glowing Orbs */}
                <motion.div
                    animate={{ x: [0, 50, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] bg-[#D41B2C]/10 blur-[130px] rounded-full"
                />
                <motion.div
                    animate={{ x: [0, -40, 0], y: [0, 50, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                    className="absolute top-[30%] -left-[10%] w-[50%] h-[50%] bg-orange-500/5 blur-[120px] rounded-full"
                />
                <motion.div
                    animate={{ x: [0, 30, 0], y: [0, -60, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                    className="absolute -bottom-[10%] right-[10%] w-[70%] h-[70%] bg-[#D41B2C]/5 blur-[150px] rounded-full"
                />

                {/* Subtle geometric overlay texture */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.5] mix-blend-multiply" />

                {/* Gradient fade to ensure contrast near bottom content */}
                <div className="absolute bottom-0 left-0 w-full h-[40vh] bg-gradient-to-t from-[#FAFAFA] to-transparent" />
            </div>

            <main className="relative z-10 pt-24 md:pt-32 pb-20 container mx-auto px-4 sm:px-6 max-w-7xl">

                {/* HERO SECTION */}
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                    className="text-center mb-16 md:mb-24"
                >
                    <motion.div
                        variants={itemVariants}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 text-[#D41B2C] text-xs md:text-sm font-black uppercase tracking-[0.2em] mb-6 shadow-sm bg-white"
                    >
                        <span className="w-2 h-2 rounded-full bg-[#D41B2C] animate-pulse" />
                        Official Live Platform
                    </motion.div>

                    <motion.div variants={itemVariants} className="flex justify-center mb-6">
                        <img
                            src={kitkatLogo}
                            alt="Kit Kat Elite Padel League"
                            className="w-[280px] sm:w-[400px] md:w-[480px] h-auto object-contain drop-shadow-2xl"
                        />
                        <h1 className="sr-only">Kit Kat Elite Padel League</h1>
                    </motion.div>

                    <motion.p
                        variants={itemVariants}
                        className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-8 font-bold tracking-wide"
                    >
                        Padel action. Unmatched energy. Every match.
                    </motion.p>

                    <motion.div
                        variants={itemVariants}
                        className="flex items-center justify-center gap-4 mb-10 opacity-80 hover:opacity-100 transition-opacity"
                    >
                        <p className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] text-right">In affiliation with</p>
                        <div className="w-px h-8 bg-slate-300"></div>
                        <div className="flex items-center gap-2">
                            <img src={sapaLogo} alt="SAPA" className="h-6 md:h-8 object-contain" />
                            <span className="text-slate-800 font-medium text-xs md:text-sm uppercase tracking-widest mt-1">SAPA Premier League</span>
                        </div>
                    </motion.div>
                </motion.div>

                {/* NAVIGATION TABS */}
                <div className="flex justify-center mb-20 md:mb-28 relative z-50">
                    <div className="flex w-full md:w-auto bg-white/60 backdrop-blur-xl p-1.5 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 mx-auto max-w-[95vw] md:max-w-fit">
                        {[
                            { id: 'standings', label: 'Standings', icon: Trophy },
                            { id: 'fixtures', label: 'Fixtures', icon: Swords },
                            { id: 'teams', label: 'Teams', icon: Users }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`relative flex-1 md:flex-none px-2 sm:px-8 py-3 rounded-full font-black text-[9px] xs:text-[10px] sm:text-xs tracking-[0.1em] sm:tracking-[0.15em] uppercase transition-all duration-300 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 ${activeTab === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                                    }`}
                            >
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="kitKatTab"
                                        className="absolute inset-0 bg-[#D41B2C] rounded-full shadow-md shadow-[#D41B2C]/20"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <tab.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 relative z-10 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`} />
                                <span className="relative z-10">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* CONTENT AREA */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                        {/* ================= STANDINGS TAB ================= */}
                        {activeTab === 'standings' && (
                            <div className="space-y-8">
                                <Podium topTeams={standingsData.slice(0, 3)} />

                                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl shadow-slate-200/50">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[500px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-[#D41B2C] font-black uppercase tracking-widest text-[10px] sm:text-xs">Pos</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-500 font-black uppercase tracking-widest text-[10px] sm:text-xs">Team</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-500 font-black uppercase tracking-widest text-[10px] sm:text-xs text-center">Pld</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-500 font-black uppercase tracking-widest text-[10px] sm:text-xs text-center">W</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-500 font-black uppercase tracking-widest text-[10px] sm:text-xs text-center">L</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-900 font-black uppercase tracking-widest text-[10px] sm:text-xs text-center">Pts</th>
                                                    <th className="py-3 px-3 sm:py-4 sm:px-6 text-slate-500 font-black uppercase tracking-widest text-[10px] sm:text-xs text-center">Form</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {standingsData.map((row, index) => (
                                                    <motion.tr
                                                        initial={{ opacity: 0, x: -20 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        transition={{ delay: index * 0.05 }}
                                                        key={row.team.id}
                                                        className={`group hover:bg-slate-50 transition-colors ${index < 3 ? 'bg-slate-50/50' : ''}`}
                                                    >
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold">
                                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${index === 0 ? 'bg-amber-100 text-amber-600 border border-amber-200' :
                                                                index === 1 ? 'bg-slate-100 text-slate-600 border border-slate-200' :
                                                                    index === 2 ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'text-slate-400'
                                                                }`}>
                                                                {row.rank}
                                                            </span>
                                                        </td>
                                                        <td className="py-4 px-6">
                                                            <div className="flex items-center gap-2 sm:gap-3">
                                                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br ${row.team.color} border ${row.team.border} flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform shrink-0`}>
                                                                    {row.team.logo}
                                                                </div>
                                                                <div>
                                                                    <p className="text-slate-900 font-bold text-xs sm:text-sm md:text-base uppercase tracking-wide">{row.team.name}</p>
                                                                    <p className="text-slate-400 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest hidden xs:block">{row.team.captain}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center text-slate-500 font-medium text-xs sm:text-base">{row.played}</td>
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center text-padel-green font-bold text-xs sm:text-base">{row.won}</td>
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center text-[#D41B2C] font-bold text-xs sm:text-base">{row.lost}</td>
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center">
                                                            <span className="text-lg sm:text-xl font-black text-slate-900">{row.points}</span>
                                                        </td>
                                                        <td className="py-3 px-3 sm:py-4 sm:px-6 text-center">
                                                            <div className="flex gap-0.5 sm:gap-1 justify-center">
                                                                {row.streak.map((result, i) => (
                                                                    <span key={i} className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black ${result === 'W' ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-50 text-[#D41B2C] border border-red-100'
                                                                        }`}>
                                                                        {result}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </motion.tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ================= FIXTURES TAB ================= */}
                        {activeTab === 'fixtures' && (
                            <div className="max-w-4xl mx-auto space-y-6">
                                {/* Week selector mockup */}
                                <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 mb-8 shadow-sm">
                                    <button className="text-slate-400 hover:text-slate-900 p-2 bg-slate-50 rounded-xl transition-colors"><ChevronRight className="rotate-180" /></button>
                                    <div className="text-center">
                                        <p className="text-[#D41B2C] font-black text-xs uppercase tracking-[0.2em]">Matchweek 7</p>
                                        <p className="text-slate-900 font-bold">June 2026</p>
                                    </div>
                                    <button className="text-slate-400 hover:text-slate-900 p-2 bg-slate-50 rounded-xl transition-colors"><ChevronRight /></button>
                                </div>

                                {fixturesData.map((fixture, i) => (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        key={fixture.id}
                                        className="relative bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 hover:border-[#D41B2C]/30 hover:shadow-xl hover:shadow-[#D41B2C]/5 transition-all group overflow-hidden"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#D41B2C]/5 blur-[50px] group-hover:bg-[#D41B2C]/10 transition-colors pointer-events-none" />

                                        {/* Date/Venue Header */}
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs font-bold uppercase tracking-widest text-slate-500">
                                                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#D41B2C]" /> {fixture.date}</span>
                                                <span className="hidden sm:inline text-slate-300">•</span>
                                                <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-[#D41B2C]" /> {fixture.time}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase tracking-widest bg-slate-50 py-1.5 px-3 rounded-lg border border-slate-100">
                                                <MapPin className="w-3.5 h-3.5" />
                                                {fixture.venue}
                                            </div>
                                        </div>

                                        {/* VS Setup */}
                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
                                            {/* Team 1 */}
                                            <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left w-full">
                                                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-white border ${fixture.team1.border} flex items-center justify-center text-4xl shadow-md mb-2 sm:mb-4 bg-gradient-to-br ${fixture.team1.color}`}>
                                                    {fixture.team1.logo}
                                                </div>
                                                <h4 className={`text-lg sm:text-2xl font-black ${fixture.team1.text} uppercase tracking-tight`}>{fixture.team1.name}</h4>
                                                <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase mt-0 sm:mt-1">{fixture.team1.short}</p>
                                            </div>

                                            {/* VS Badge */}
                                            <div className="shrink-0 relative z-20 my-4 sm:my-0">
                                                <div className="absolute inset-0 bg-[#D41B2C] blur-md opacity-20 group-hover:opacity-40 transition-opacity" />
                                                <div className="w-12 h-12 bg-white border-2 border-[#D41B2C] rounded-full flex items-center justify-center relative shadow-sm">
                                                    <span className="text-[#D41B2C] font-black text-sm italic">VS</span>
                                                </div>
                                            </div>

                                            {/* Team 2 */}
                                            <div className="flex-1 flex flex-col items-center sm:items-end text-center sm:text-right w-full">
                                                <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-white border ${fixture.team2.border} flex items-center justify-center text-4xl shadow-md mb-2 sm:mb-4 bg-gradient-to-br ${fixture.team2.color}`}>
                                                    {fixture.team2.logo}
                                                </div>
                                                <h4 className={`text-lg sm:text-2xl font-black ${fixture.team2.text} uppercase tracking-tight`}>{fixture.team2.name}</h4>
                                                <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase mt-0 sm:mt-1">{fixture.team2.short}</p>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* ================= TEAMS & PLAYERS TAB ================= */}
                        {activeTab === 'teams' && (
                            <div className="space-y-12">
                                {/* Team Quick Select Logos */}
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-wrap justify-center gap-3 sm:gap-4 md:gap-6 mb-8"
                                >
                                    {teamsData.map((team, idx) => (
                                        <motion.div
                                            key={team.id}
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="group relative cursor-default"
                                            title={team.name}
                                        >
                                            <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-white border ${team.border} flex items-center justify-center p-2 shadow-sm bg-gradient-to-br ${team.color} transition-all duration-300 group-hover:scale-110 group-hover:shadow-md`}>
                                                <div className="w-full h-full flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                                                    {team.logo}
                                                </div>
                                            </div>
                                            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                <div className="bg-slate-900 text-white text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded whitespace-nowrap">
                                                    {team.short}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </motion.div>

                                <div className="max-w-md mx-auto">
                                    <div className="relative">
                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                        <input
                                            type="text"
                                            placeholder="Search by player or team..."
                                            value={playerSearch}
                                            onChange={(e) => setPlayerSearch(e.target.value)}
                                            className="w-full bg-white border border-slate-200 shadow-sm rounded-2xl py-4 pl-12 pr-4 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#D41B2C] focus:ring-1 focus:ring-[#D41B2C] transition-all"
                                        />
                                    </div>
                                </div>

                                {groupedPlayers.length === 0 ? (
                                    <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm">
                                        <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No players found matching "{playerSearch}"</p>
                                    </div>
                                ) : (
                                    <div className="space-y-12">
                                        {groupedPlayers.map((group, groupIdx) => (
                                            <motion.div
                                                key={group.team.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: groupIdx * 0.1 }}
                                                className="space-y-6"
                                            >
                                                {/* Team Header Bar */}
                                                <div className="flex items-center gap-4 group">
                                                    <div className={`w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-white border ${group.team.border} flex items-center justify-center text-2xl md:text-3xl shadow-sm bg-gradient-to-br ${group.team.color}`}>
                                                        {group.team.logo}
                                                    </div>
                                                    <div>
                                                        <h3 className={`${group.team.text} font-black text-lg md:text-2xl uppercase tracking-tight`}>{group.team.name}</h3>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest">Captain: {group.team.captain}</p>
                                                            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                            <p className="text-slate-400 text-[10px] md:text-xs font-bold uppercase tracking-widest">{group.players.length} Players</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                    {group.players.map((player, i) => (
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ delay: (groupIdx * 0.1) + (i % 10) * 0.03 }}
                                                            key={player.name}
                                                            className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex items-center gap-4 group cursor-default"
                                                        >
                                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${player.teamData.color} border ${player.teamData.border} flex items-center justify-center shrink-0 shadow-sm`}>
                                                                <span className="text-lg group-hover:scale-110 transition-transform">{player.teamData.logo}</span>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <h4 className="text-slate-900 font-bold text-sm truncate">{player.name}</h4>
                                                                <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest truncate mt-0.5">{player.teamData.short}</p>
                                                            </div>
                                                            {player.teamData.captain === player.name && (
                                                                <div className="ml-auto bg-[#D41B2C]/10 text-[#D41B2C] text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded">
                                                                    CAP
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* OFFICIAL LEAGUE SPONSORS */}
                <motion.section
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="mt-20 sm:mt-28 pt-10 border-t border-slate-200"
                >
                    <div className="text-center mb-10">
                        <h3 className="text-xs md:text-sm font-black text-slate-400 uppercase tracking-widest">Official League Sponsors</h3>
                    </div>

                    <div className="flex flex-wrap justify-center items-center gap-12 sm:gap-20 opacity-70 hover:opacity-100 transition-opacity duration-300 mix-blend-multiply">
                        {/* Coca-Cola */}
                        <img src="/images/coca-cola.svg" alt="Coca-Cola" className="h-12 sm:h-20 object-contain grayscale hover:grayscale-0 transition-all duration-300" />

                        {/* Slow Mag */}
                        <img src="/images/slow-mag.png" alt="Slow Mag" className="h-12 sm:h-20 object-contain grayscale hover:grayscale-0 transition-all duration-300" />

                        {/* Steri Stumpie */}
                        <img src="/images/steri-stumpie.png" alt="Steri Stumpie" className="h-16 sm:h-24 object-contain grayscale hover:grayscale-0 transition-all duration-300" />

                        {/* Babolat */}
                        <img src="/images/babolat.png" alt="Babolat" className="h-12 sm:h-20 object-contain grayscale hover:grayscale-0 transition-all duration-300" />
                    </div>
                </motion.section>

            </main>
            {/* FULL WIDTH SPONSOR SECTION */}
            <section className="bg-[#D41B2C] text-white py-20 sm:py-32 relative overflow-hidden border-t-8 border-red-800">
                {/* Graphic Pattern */}
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay"></div>
                <div className="absolute -top-64 -right-64 w-[500px] h-[500px] rounded-full bg-red-600/50 blur-[100px] pointer-events-none"></div>
                <div className="absolute -bottom-64 -left-64 w-[500px] h-[500px] rounded-full bg-red-800/50 blur-[100px] pointer-events-none"></div>

                <div className="container mx-auto px-4 sm:px-6 max-w-5xl relative z-10 text-center flex flex-col items-center">

                    <div className="mb-10 sm:mb-14">
                        <img
                            src="/images/kitkat-group-logo.png"
                            alt="Kit Kat Cash And Carry"
                            className="w-[280px] sm:w-[380px] md:w-[480px] h-auto object-contain mx-auto shadow-2xl rounded-lg"
                        />
                    </div>

                    <p className="text-white/95 text-base sm:text-lg md:text-xl leading-relaxed mb-6 font-medium max-w-3xl drop-shadow-sm">
                        Kit Kat Cash & Carry stands as a prominent force within the FMCG retail landscape, recognized for its commitment to quality, value, and customer satisfaction. As one of the leading brands in the industry, Kit Kat embodies reliability and consistency.
                    </p>
                    <p className="text-white/80 text-sm sm:text-base leading-relaxed mb-12 max-w-3xl">
                        Our brand reflects a promise to deliver exceptional service, competitive pricing, and a comprehensive range of products tailored for both individual shoppers and bulk buyers. We remain a dependable partner in everyday retail and wholesale needs.
                    </p>

                    <a
                        href="https://kitkatgroup.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-3 bg-white !text-red-700 px-8 sm:px-12 py-4 sm:py-5 rounded-full font-black uppercase tracking-widest text-[10px] sm:text-xs hover:scale-105 hover:bg-slate-50 hover:!text-red-800 transition-all shadow-xl group border border-transparent"
                    >
                        Visit KitKatGroup.com
                        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                    </a>
                </div>
            </section>
        </div>
    );
};

export default KitKatLeague;
