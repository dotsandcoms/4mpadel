import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, Trophy, Search, Bell, MapPin, User, LogOut, ShieldAlert, Home, Users, TrendingUp, Image, GraduationCap, Zap, Mail, ChevronUp, Calendar } from 'lucide-react';
import logo from '../assets/logo_4m_lowercase.png';
import saFlag from '../assets/Flag_of_South_Africa.svg.png';
import { supabase } from '../supabaseClient';
import { useSearch } from '../context/SearchContext';
import { usePendingPayments } from '../hooks/usePendingPayments';
import AuthModal from './AuthModal';

const Navbar = ({ isDark = false, accentColor }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMobileMenus, setExpandedMobileMenus] = useState([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [player, setPlayer] = useState(null);
  const { toggleSearch } = useSearch();
  const location = useLocation();
  const { pendingPayments } = usePendingPayments(
    sessionStorage.getItem('admin_test_login_email') || session?.user?.email,
    player?.rankedin_id
  );

  const SUPER_ADMINS = [
    'bradein@dotsandcoms.co.za',
    'brad@dotsandcoms.co.za',
    'admin@4mpadel.co.za',
    'markstillerman@gmail.com'
  ];
  const targetEmail = sessionStorage.getItem('admin_test_login_email') || session?.user?.email;
  const isSuperAdmin = targetEmail ? SUPER_ADMINS.includes(targetEmail.toLowerCase()) : false;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchPlayerData = async () => {
      // Check for admin impersonation
      const impersonationEmail = sessionStorage.getItem('admin_test_login_email');

      // Use impersonation email if it exists, otherwise use session email
      const targetEmail = impersonationEmail || session?.user?.email;

      if (!targetEmail) {
        setPlayer(null);
        return;
      }

      const { data } = await supabase
        .from('players')
        .select('id, name, email, rankedin_id, rank_label, points, active_ranking_label, region, racket_brand, home_club, image_url')
        .ilike('email', targetEmail)
        .maybeSingle();

      setPlayer(data);
    };

    fetchPlayerData();
  }, [session?.user?.email, location.pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };


  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const calculateCompleteness = (p) => {
    if (!p) return 0;
    let score = 0;
    let total = 5;
    if (p.name) score += 1;
    if (p.region) score += 1;
    if (p.racket_brand) score += 1;
    if (p.home_club) score += 1;
    if (p.image_url) score += 1;
    return Math.round((score / total) * 100);
  };

  const getLinkIcon = (name) => {
    switch (name.toLowerCase()) {
      case 'home': return <Home className="w-4 h-4 shrink-0" />;
      case 'calendar': return <Calendar className="w-4 h-4 shrink-0" />;
      case 'players': return <Users className="w-4 h-4 shrink-0" />;
      case 'rankings': return <TrendingUp className="w-4 h-4 shrink-0" />;
      case 'media': return <Image className="w-4 h-4 shrink-0" />;
      case 'academy': return <GraduationCap className="w-4 h-4 shrink-0" />;
      case 'events': return <Zap className="w-4 h-4 shrink-0" />;
      case 'contact': return <Mail className="w-4 h-4 shrink-0" />;
      default: return <Zap className="w-4 h-4 shrink-0" />;
    }
  };

  const navLinks = [
    { name: 'Home', href: '/' },
    { name: 'Calendar', href: '/calendar' },
    { name: 'Players', href: '/players' },
    { name: 'Rankings', href: '/rankings' },
    { name: 'Media', href: '/gallery' },
    {
      name: 'Academy',
      href: '#',
      dropdown: [
        { name: 'Approved Coaches', href: '/academy/coaches' },
        { name: 'Coaching Videos', href: '/academy/videos' },
        { name: 'Register', href: '/academy/register' },
      ]
    },
    {
      name: 'Events',
      href: '#',
      dropdown: [
        { name: 'All Tournaments', href: '/calendar' },
        { name: 'My Calendar', href: '/calendar?tab=my-calendar' },
        { name: 'Broll Pro Tour', href: '/tournaments/broll' },
        { name: 'Kit Kat League', href: '/tournaments/kit-kat-league' },
        { name: 'North vs South', href: '/tournaments/north-vs-south' },
      ]
    },
    { name: 'Contact', href: '/contact' },
  ];

  const visibleLinks = navLinks;

  return (
    <>
      <motion.nav
        initial={{ y: 0 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4 }}
        className={`fixed top-0 left-0 right-0 z-[999] transition-all duration-300 ${isScrolled
          ? 'py-4 glass-panel bg-black/85 backdrop-blur-xl border-b border-white/10'
          : 'py-6 bg-gradient-to-b from-black/90 to-transparent lg:bg-gradient-to-b max-lg:bg-black/90 max-lg:backdrop-blur-xl max-lg:py-4 max-lg:border-b max-lg:border-white/10'
          }`}
      >
        {sessionStorage.getItem('admin_test_login_email') && (
          <div className="bg-amber-500 text-black py-1.5 px-4 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-4">
            <span>Testing Mode: Impersonating {sessionStorage.getItem('admin_test_login_email')}</span>
            <button
              onClick={() => {
                sessionStorage.removeItem('admin_test_login_email');
                window.location.href = '/admin';
              }}
              className="bg-black text-white px-3 py-0.5 rounded-full hover:bg-white hover:text-black transition-colors"
            >
              Exit & Return to Admin
            </button>
          </div>
        )}

        <div className="container mx-auto px-6 flex items-center justify-between relative">
          <div className="flex items-center gap-4 z-50 shrink-0">
            <div className="flex items-center gap-3">
              <a href="/">
                <img src={logo} alt="4M Padel Logo" className="h-10 w-auto" style={{ filter: 'none', boxShadow: 'none' }} />
              </a>
              <img src={saFlag} alt="South Africa Flag" className="h-4 w-auto mt-0.5 object-contain" />
            </div>
            
            {session && player && (
              <div className="hidden md:flex items-center gap-2 border-l border-white/10 pl-3 ml-1 text-xs font-medium text-white/80 shrink-0">
                <div className="flex flex-col shrink-0">
                  <span className="leading-tight font-black text-xs uppercase tracking-tight whitespace-nowrap" style={{ color: accentColor || (isDark ? '#F40020' : undefined) }}>
                    {player.name}
                  </span>
                  {player.rankedin_id && (
                    <span className="text-[8px] font-bold uppercase tracking-[0.1em] leading-none opacity-40 whitespace-nowrap mt-0.5 hidden xl:block">
                      ID: {player.rankedin_id}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                  {player.rank_label && player.rank_label !== 'Unranked' && (
                    <div className="flex items-center gap-0.5 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded-full shadow-lg shadow-yellow-500/5 shrink-0 whitespace-nowrap">
                      <Trophy className="w-2.5 h-2.5 text-yellow-500 shrink-0" />
                      <span className="text-yellow-500 font-black text-[7.5px] tracking-wide whitespace-nowrap">#{player.rank_label}</span>
                    </div>
                  )}
                  {player.points !== undefined && player.points !== null && (
                    <div className="bg-[#beff00]/10 border border-[#beff00]/30 px-1.5 py-0.5 rounded-full shrink-0 shadow-lg shadow-[#beff00]/5 flex items-center justify-center whitespace-nowrap">
                      <span className="text-padel-green font-black text-[7.5px] uppercase tracking-wider whitespace-nowrap">{player.points} PTS</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 hidden lg:flex justify-center mx-4 xl:mx-8 z-40 overflow-visible">
            <div 
              className={`flex items-center gap-1.5 xl:gap-2 px-3 xl:px-5 py-1.5 xl:py-2 rounded-full transition-all duration-300 overflow-visible ${
                isScrolled 
                  ? (isDark ? 'bg-white/80 backdrop-blur-md border border-slate-200 shadow-lg' : 'bg-white/10 backdrop-blur-md border border-white/10') 
                  : (isDark ? 'bg-slate-100/50 backdrop-blur-sm border border-slate-200 hover:bg-slate-200/50' : 'bg-black/20 backdrop-blur-sm border border-white/5 hover:bg-black/40')
              }`}
            >
            {visibleLinks.map((link) => (
              <div key={link.name} className="relative group">
                <a
                  href={link.href}
                  className={`flex items-center gap-0.5 xl:gap-1 text-[10px] xl:text-[11px] 2xl:text-xs font-bold uppercase tracking-wider transition-colors py-1.5 px-2.5 rounded-full relative ${
                    location.pathname === link.href 
                      ? (isDark ? 'text-black' : 'text-padel-green') 
                      : (isDark ? '!text-slate-700 hover:text-black' : 'text-white/70 hover:text-padel-green')
                  }`}
                >
                  {location.pathname === link.href && (
                    <motion.span 
                      layoutId="activeNavTab"
                      className={`absolute inset-0 rounded-full -z-10 ${isDark ? 'bg-slate-200/80' : 'bg-white/5'}`}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  {link.name}
                  {link.dropdown && <ChevronDown className="w-3 h-3 transition-transform group-hover:rotate-180" />}
                </a>

                {link.dropdown && (
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-52 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 py-1.5 z-[60]">
                    {link.dropdown.map((subItem) => (
                      <a
                        key={subItem.name}
                        href={subItem.href}
                        className="block px-5 py-2 text-[10px] font-bold text-gray-300 hover:text-padel-green hover:bg-white/5 transition-all uppercase tracking-wider border-l-2 border-transparent hover:border-padel-green"
                      >
                        {subItem.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 xl:gap-3 z-50 shrink-0">
            <button
              onClick={toggleSearch}
              className={`p-1.5 xl:p-2 rounded-full transition-all duration-300 group hidden lg:block ${isDark ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-white/60'}`}
              title="Search (Cmd+K)"
            >
              <Search
                className={`w-4 h-4 group-hover:scale-110 transition-transform ${!isDark ? 'group-hover:text-padel-green' : ''}`}
                style={isDark ? { color: 'inherit' } : {}}
              />
            </button>

            {session && (
              <div className="relative hidden lg:block">
                <button
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  className={`p-1.5 xl:p-2 rounded-full transition-all duration-300 group relative ${isDark ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-white/60'}`}
                  title="Notifications"
                >
                  <motion.div
                    animate={(pendingPayments.length > 0 || (player && !player.region)) ? { rotate: [0, -15, 15, -15, 15, 0] } : {}}
                    transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                  >
                    <Bell className={`w-4 h-4 group-hover:scale-110 transition-transform ${!isDark ? 'group-hover:text-padel-green' : ''}`} />
                  </motion.div>
                  {(pendingPayments.length > 0 || (player && (!player.region || !player.racket_brand))) && (
                    <span className="absolute top-0 right-0 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationsOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={`absolute top-full right-0 mt-2 w-80 rounded-2xl shadow-2xl z-[60] overflow-hidden ${isDark ? 'bg-white border border-slate-200' : 'bg-black/95 backdrop-blur-xl border border-white/10'}`}
                    >
                      <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-100' : 'border-white/10'}`}>
                        <h3 className={`font-bold text-sm ${isDark ? 'text-slate-800' : 'text-white'}`}>Notifications</h3>
                        {(pendingPayments.length > 0 || (player && (!player.region || !player.racket_brand))) && (
                          <span className="bg-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                            {pendingPayments.length + (player && !player.region ? 1 : 0) + (player && !player.racket_brand ? 1 : 0)} Total
                          </span>
                        )}
                      </div>
                      <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                        {player && !player.region && (
                          <a href="/profile?edit=true" className={`block p-4 transition-colors border-b flex items-start gap-3 ${isDark ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-white/5 border-white/5'}`}>
                            <div className="mt-1 bg-padel-green/20 p-2 rounded-lg"><MapPin className="w-4 h-4 text-padel-green" /></div>
                            <div><p className={`text-sm font-bold mb-1 ${isDark ? 'text-slate-800' : 'text-white'}`}>Region Missing</p><p className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>Please select your home region.</p></div>
                          </a>
                        )}
                        {pendingPayments.map(payment => (
                            <a
                              key={payment.id}
                              href={`/calendar/${payment.slug}?register=true`}
                              className={`block p-4 transition-colors border-b last:border-0 ${isDark ? 'hover:bg-slate-50 border-slate-100' : 'hover:bg-white/5 border-white/5'}`}
                            >
                              <p className={`text-sm font-bold mb-1 ${isDark ? 'text-slate-800' : 'text-white'}`}>Payment Required</p>
                              <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-gray-400'}`}>You have a pending entry fee for <span className="font-bold" style={{ color: accentColor || (isDark ? '#F40020' : undefined) }}>{payment.name}</span>.</p>
                              <p className="text-[10px] mt-2 uppercase tracking-widest font-bold text-padel-green">Click to pay now</p>
                            </a>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="hidden lg:block">
              {session ? (
                <div className="flex items-center relative group py-2">
                  <button className="flex items-center gap-1.5 xl:gap-2 px-2.5 xl:px-3.5 py-1.5 xl:py-2 rounded-full text-xs xl:text-sm font-black transition-all duration-300 bg-white/5 border border-white/10 hover:bg-white/10 text-white cursor-pointer select-none">
                    {player?.image_url ? (
                      <img src={player.image_url} alt={player.name} className="w-5 h-5 xl:w-6 xl:h-6 rounded-full object-cover border border-white/20 shrink-0" />
                    ) : (
                      <div className="w-5 h-5 xl:w-6 xl:h-6 rounded-full bg-padel-green/20 border border-padel-green/30 flex items-center justify-center text-padel-green text-[9px] xl:text-[10px] font-black uppercase shrink-0">
                        {player?.name ? player.name.charAt(0) : 'P'}
                      </div>
                    )}
                    <span className="max-w-[70px] xl:max-w-[90px] truncate uppercase tracking-wider text-[10px] xl:text-xs">
                      {player?.name ? player.name.split(' ')[0] : 'Player'}
                    </span>
                    <ChevronDown className="w-3 h-3 xl:w-3.5 xl:h-3.5 text-white/50 group-hover:rotate-180 transition-transform duration-300" />
                  </button>

                  <div className="absolute right-0 top-full mt-1 w-56 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-right -translate-y-2 group-hover:translate-y-0 py-2 z-[100]">
                    <div className="px-4 py-2 border-b border-white/5 mb-1.5">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Signed in as</p>
                      <p className="text-[11px] font-bold text-white truncate">{player?.name || targetEmail}</p>
                      {player?.rankedin_id && (
                        <p className="text-[7.5px] font-black text-white/40 uppercase tracking-widest mt-1">ID: {player.rankedin_id}</p>
                      )}
                    </div>
                    {isSuperAdmin && (
                      <a href="/admin" target="_blank" className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-amber-500 hover:text-white hover:bg-amber-500/10 transition-colors uppercase tracking-widest">
                        <ShieldAlert className="w-3.5 h-3.5" />Admin Panel
                      </a>
                    )}
                    <a href="/profile" className="flex items-center gap-2 px-4 py-2 text-[10px] font-black text-gray-300 hover:text-padel-green hover:bg-white/5 transition-colors uppercase tracking-widest">
                      <User className="w-3.5 h-3.5" />My Profile
                    </a>
                    <div className="h-px bg-white/5 my-1 mx-3" />
                    <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2 text-[10px] font-black text-red-400 hover:text-white hover:bg-red-500/10 transition-colors uppercase tracking-widest text-left cursor-pointer">
                      <LogOut className="w-3.5 h-3.5" />Logout
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className={`px-3.5 xl:px-4 py-1.5 xl:py-2 rounded-full text-xs font-bold hover:scale-105 transition-all duration-300 text-black cursor-pointer`}
                  style={{ backgroundColor: accentColor || (isDark ? '#F40020' : '#ccff00') }}
                >
                  Login ↗
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 lg:hidden">
              <button onClick={toggleSearch} className={`p-2 rounded-full ${isDark ? 'text-slate-900' : 'text-white'}`}>
                <Search className="w-5 h-5" />
              </button>
              <button className={`p-2 transition-transform active:scale-95 ${isDark ? 'text-slate-900' : 'text-white'}`} onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X /> : <Menu />}
              </button>
            </div>
          </div>
        </div>
      </motion.nav >

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-[1000] bg-black backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 right-0 bottom-0 w-[310px] sm:w-[360px] bg-slate-950/98 backdrop-blur-2xl border-l border-white/10 z-[1001] shadow-2xl flex flex-col justify-between overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                <span className="text-[10px] font-black text-padel-green uppercase tracking-widest">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/70 active:scale-95 transition-transform hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 pt-5 pb-1">
                {session && player ? (
                  <a
                    href="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-4 bg-gradient-to-br from-white/5 to-white/[0.01] border border-white/10 hover:border-padel-green/30 hover:bg-white/10 rounded-2xl shadow-xl flex items-center gap-3 transition-all duration-300 cursor-pointer group hover:scale-[1.01] active:scale-[0.99]"
                  >
                    {player.image_url ? (
                      <img src={player.image_url} alt={player.name} className="w-12 h-12 rounded-xl object-cover border border-white/20 shadow-lg shrink-0 group-hover:border-padel-green/50 transition-colors duration-300" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-padel-green/10 border border-padel-green/30 flex items-center justify-center text-padel-green text-lg font-black uppercase shrink-0 transition-colors duration-300 group-hover:bg-padel-green/20">
                        {player.name ? player.name.charAt(0) : 'P'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-white uppercase tracking-tight truncate leading-tight group-hover:text-padel-green transition-colors duration-300">{player.name}</p>
                      {player.rankedin_id && (
                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-0.5 truncate">ID: {player.rankedin_id}</p>
                      )}
                    </div>
                  </a>
                ) : (
                  <div className="p-4 bg-gradient-to-br from-[#ccff00]/10 to-[#ccff00]/5 border border-[#ccff00]/20 rounded-2xl text-center">
                    <p className="text-xs text-gray-300 font-bold mb-2.5">Sign in to track your stats, tournaments and calendar!</p>
                    <button
                      onClick={() => { setIsMobileMenuOpen(false); setIsAuthModalOpen(true); }}
                      className="w-full py-2 bg-padel-green text-black font-black text-xs uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all"
                    >
                      Login / Register ↗
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar flex flex-col gap-1.5">
                {visibleLinks.map((link) => {
                  const isExpanded = expandedMobileMenus.includes(link.name);
                  const isActive = location.pathname === link.href;
                  return (
                    <div key={link.name} className="w-full flex flex-col">
                      <button
                        onClick={() => {
                          if (link.dropdown) {
                            setExpandedMobileMenus(prev =>
                              prev.includes(link.name) ? prev.filter(n => n !== link.name) : [...prev, link.name]
                            );
                          } else {
                            setIsMobileMenuOpen(false);
                            window.location.href = link.href;
                          }
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${
                          isActive 
                            ? 'bg-padel-green/10 border-padel-green/35 text-padel-green shadow-[0_0_15px_rgba(204,255,0,0.05)]' 
                            : 'bg-transparent border-transparent text-gray-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {getLinkIcon(link.name)}
                          <span>{link.name}</span>
                        </div>
                        {link.dropdown && (
                          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-padel-green' : 'text-gray-400'}`} />
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {link.dropdown && isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden flex flex-col pl-9 pr-4 py-1.5 gap-2 border-l border-white/5 ml-6 mt-1 mb-2 bg-white/[0.01] rounded-r-xl"
                          >
                            {link.dropdown.map((subItem) => (
                              <a
                                key={subItem.name}
                                href={subItem.href}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`block py-2 text-[10px] font-black uppercase tracking-wider transition-colors ${
                                  location.pathname === subItem.href ? 'text-padel-green' : 'text-gray-400 hover:text-white'
                                }`}
                              >
                                {subItem.name}
                              </a>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {session && player && (
                <div className="px-5 py-4 border-t border-white/5 bg-white/[0.01]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Profile Completeness</span>
                    <span className="text-[10px] font-black text-padel-green">{calculateCompleteness(player)}%</span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-padel-green h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(204,255,0,0.5)]" 
                      style={{ width: `${calculateCompleteness(player)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="p-5 border-t border-white/5 bg-slate-950 flex flex-col gap-2">
                {session && (
                  <>
                    {isSuperAdmin && (
                      <a href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-black rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 active:scale-95 transition-all">
                        <ShieldAlert className="w-4 h-4" />Admin Panel
                      </a>
                    )}
                    <a href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="w-full py-2.5 bg-white/5 border border-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white/10 active:scale-95 transition-all">
                      <User className="w-4 h-4 text-padel-green" />My Profile
                    </a>
                    <button onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }} className="w-full py-2.5 bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:border-transparent active:scale-95 transition-all cursor-pointer">
                      <LogOut className="w-4 h-4" />Logout
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};

export default Navbar;
