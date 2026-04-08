import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, Trophy, Search } from 'lucide-react';
import logo from '../assets/logo_4m_lowercase.png';
import saFlag from '../assets/Flag_of_South_Africa.svg.png';
import { supabase } from '../supabaseClient';
import { useSearch } from '../context/SearchContext';
import AuthModal from './AuthModal';

const Navbar = ({ isDark = false }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [expandedMobileMenus, setExpandedMobileMenus] = useState([]);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [player, setPlayer] = useState(null);
  const { toggleSearch } = useSearch();
  const location = useLocation();

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
        .select('name, rankedin_id, rank_label, points')
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
      name: 'Tournaments',
      href: '#',
      dropdown: [
        { name: 'All Tournaments', href: '/calendar' },
        { name: 'Broll Pro Tour', href: '/tournaments/broll' },
        { name: 'Kit Kat League', href: '/tournaments/kit-kat-league' },
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
          ? 'py-4 glass-panel bg-black/80 backdrop-blur-xl border-b border-white/10'
          : 'py-6 bg-gradient-to-b from-black/80 to-transparent md:bg-gradient-to-b max-md:bg-black/80 max-md:backdrop-blur-xl max-md:py-4 max-md:border-b max-md:border-white/10'
          }`}
      >
        {/* Impersonation Banner */}
        {sessionStorage.getItem('admin_test_login_email') && (
          <div className="bg-amber-500 text-black py-1.5 px-4 text-center text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-4">
            <span>Testing Mode: Impersonating {sessionStorage.getItem('admin_test_login_email')}</span>
            <button
              onClick={() => {
                sessionStorage.removeItem('admin_test_login_email');
                window.location.reload();
              }}
              className="bg-black text-white px-3 py-0.5 rounded-full hover:bg-white hover:text-black transition-colors"
            >
              Exit & Return to Admin
            </button>
          </div>
        )}
        <div className="container mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-4">
            {!isMobileMenuOpen && (
              <>
                <img src={logo} alt="4M Padel Logo" className="h-12 w-auto" style={{ filter: 'none', boxShadow: 'none' }} />
                <img src={saFlag} alt="South Africa Flag" className="h-5 w-auto mt-0.5 object-contain" />
              </>
            )}
            {session && player && (
              <div className={`${isMobileMenuOpen ? 'flex' : 'hidden sm:flex'} items-center gap-3 sm:gap-4 ml-0 sm:ml-3 text-xs font-medium ${isDark ? 'text-slate-600' : 'text-white/80'}`}>
                <div className="flex flex-col">
                  <span className={`leading-tight font-black text-xs sm:text-sm uppercase tracking-tighter ${isDark ? 'text-[#F40020]' : 'text-padel-green'}`}>{player.name}</span>
                  {player.rankedin_id && (
                    <span className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.1em] leading-none mt-1 opacity-40`}>
                      ID: {player.rankedin_id}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 border-l border-white/10 pl-3 sm:pl-4 ml-0.5 sm:ml-1">
                  {player.rank_label && player.rank_label !== 'Unranked' && (
                    <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full shadow-lg shadow-yellow-500/5">
                      <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-500" />
                      <span className="text-yellow-500 font-black text-[10px] sm:text-[11px]">#{player.rank_label}</span>
                    </div>
                  )}
                  {player.points !== undefined && (
                    <div className="bg-padel-green/10 border border-padel-green/20 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full">
                      <span className="text-padel-green font-black text-[9px] sm:text-[10px] uppercase tracking-wider">{player.points} PTS</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Links */}
          <div className={`hidden md:flex items-center gap-6 px-8 py-3 rounded-full transition-all duration-300 z-50 overflow-visible ${isScrolled ? (isDark ? 'bg-white/80 backdrop-blur-md border border-slate-200 shadow-lg' : 'bg-white/10 backdrop-blur-md border border-white/10') : (isDark ? 'bg-slate-100/50 backdrop-blur-sm border border-slate-200 hover:bg-slate-200/50' : 'bg-black/20 backdrop-blur-sm border border-white/5 hover:bg-black/40')}`}>
            {visibleLinks.map((link) => (
              <div key={link.name} className="relative group">
                <a
                  href={link.href}
                  className={`flex items-center gap-1 text-sm font-medium transition-colors py-2 ${isDark ? '!text-slate-700 hover:!text-[#F40020]' : 'text-white/80 hover:text-padel-green'}`}
                >
                  {link.name}
                  {link.dropdown && <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />}
                </a>

                {/* Dropdown Menu */}
                {link.dropdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0 py-2 z-[60]">
                    {link.dropdown.map((subItem) => (
                      <a
                        key={subItem.name}
                        href={subItem.href}
                        className="block px-6 py-2.5 text-xs font-medium text-gray-300 hover:text-padel-green hover:bg-white/5 transition-all uppercase tracking-widest border-l-2 border-transparent hover:border-padel-green"
                      >
                        {subItem.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Desktop Search Trigger */}
            <button
              onClick={toggleSearch}
              className={`p-2 rounded-full transition-all duration-300 group ${isDark ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-white/10 text-white/60'}`}
              title="Search (Cmd+K)"
            >
              <Search className={`w-4 h-4 group-hover:scale-110 transition-transform ${isDark ? 'group-hover:text-[#F40020]' : 'group-hover:text-padel-green'}`} />
            </button>

            {session ? (
              <div className="flex items-center gap-4 ml-2">
                <a href="/profile" className={`text-sm font-bold transition-colors py-2 ${isDark ? '!text-slate-900 hover:!text-[#F40020]' : 'text-white hover:text-padel-green'}`}>
                  Profile
                </a>
                <button
                  onClick={handleLogout}
                  className="bg-red-500/20 text-red-400 px-5 py-2 rounded-full text-sm font-bold hover:bg-red-500 hover:text-white transition-all duration-300">
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className={`px-5 py-2 mt-0 ml-2 rounded-full text-sm font-bold hover:scale-105 transition-all duration-300 ${isDark ? 'bg-[#F40020] text-white hover:bg-[#960f24]' : 'bg-padel-green text-black hover:bg-white'}`}>
                Login / Register ↗
              </button>
            )}
          </div>

          {/* Mobile Search & Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={toggleSearch}
              className={`p-2 rounded-full ${isDark ? 'text-slate-900' : 'text-white'}`}
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              className={`p-2 ${isDark ? 'text-slate-900' : 'text-white'}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </motion.nav >

      {/* Mobile Menu Overlay */}
      < AnimatePresence >
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center gap-5 overflow-y-auto pt-32 pb-20"
          >
            {visibleLinks.map((link, index) => (
              <div key={link.name} className="flex flex-col items-center w-full">
                <motion.a
                  href={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  onClick={(e) => {
                    if (link.dropdown) {
                      e.preventDefault();
                      setExpandedMobileMenus(prev =>
                        prev.includes(link.name) ? prev.filter(n => n !== link.name) : [...prev, link.name]
                      );
                    } else {
                      setIsMobileMenuOpen(false);
                    }
                  }}
                  className="flex items-center gap-2 text-xl font-bold text-white hover:text-padel-green px-4 py-2"
                >
                  {link.name}
                  {link.dropdown && (
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedMobileMenus.includes(link.name) ? 'rotate-180' : ''}`} />
                  )}
                </motion.a>
                <AnimatePresence>
                  {link.dropdown && expandedMobileMenus.includes(link.name) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex flex-col items-center gap-3 overflow-hidden w-full bg-white/5 py-2 my-1"
                    >
                      {link.dropdown.map((subItem) => (
                        <a
                          key={subItem.name}
                          href={subItem.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className="text-lg font-medium text-gray-400 hover:text-white transition-colors"
                        >
                          {subItem.name}
                        </a>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {session ? (
              <>
                <motion.a
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  href="/profile"
                  className="bg-transparent border-2 border-padel-green text-padel-green px-6 py-3 rounded-full text-lg font-bold mt-2"
                >
                  My Profile
                </motion.a>
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                  className="text-red-400 text-base font-bold mt-1"
                >
                  Logout
                </motion.button>
              </>
            ) : (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={() => { setIsMobileMenuOpen(false); setIsAuthModalOpen(true); }}
                className="bg-padel-green text-black px-6 py-3 rounded-full text-lg font-bold mt-2"
              >
                Login / Register
              </motion.button>
            )}
          </motion.div>
        )
        }
      </AnimatePresence >
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
};

export default Navbar;
