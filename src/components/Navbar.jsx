import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import logo from '../assets/logo_4m.png';
import saFlag from '../assets/Flag_of_South_Africa.svg.png';
import { supabase } from '../supabaseClient';
import AuthModal from './AuthModal';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [session, setSession] = useState(null);

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

  const handleLogout = async () => {
    await supabase.auth.signOut();
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
    {
      name: 'Academy',
      href: '#',
      dropdown: [
        { name: 'Approved Coaches', href: '/academy/coaches' },
        { name: 'Coaching Videos', href: '/academy/videos' },
      ]
    },
    {
      name: 'Tournaments',
      href: '#',
      dropdown: [
        { name: 'Broll Pro Tour', href: '/tournaments/broll' },
        { name: 'Ladies Tour', href: '/tournaments/ladies' },
        { name: 'Juniors', href: '/tournaments/juniors' },
        { name: 'All Tournaments', href: '/tournaments/all' },
        { name: 'Mens 40 +', href: '/tournaments/mens40' },
      ]
    },
    { name: 'Blog', href: '/blog' },
  ];

  return (
    <>
      <motion.nav
        initial={{ y: 0 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4 }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'py-4 glass-panel bg-black/80 backdrop-blur-xl border-b border-white/10' : 'py-6 bg-gradient-to-b from-black/80 to-transparent'
          }`}
      >
        <div className="container mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          {/* Logo */}
          <div className="flex items-center gap-4">
            <img src={logo} alt="4M Padel Logo" className="h-12 w-auto" />
            <img src={saFlag} alt="South Africa Flag" className="h-5 w-auto rounded-sm mt-0.5 object-contain" />
          </div>

          {/* Desktop Links */}
          <div className={`hidden md:flex items-center gap-8 px-8 py-3 rounded-full transition-all duration-300 ${isScrolled ? 'bg-white/10 backdrop-blur-md border border-white/10' : 'bg-transparent'}`}>
            {navLinks.map((link) => (
              <div key={link.name} className="relative group">
                <a
                  href={link.href}
                  className="flex items-center gap-1 text-sm font-medium text-white/80 hover:text-padel-green transition-colors py-2"
                >
                  {link.name}
                  {link.dropdown && <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />}
                </a>

                {/* Dropdown Menu */}
                {link.dropdown && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-black/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform origin-top-left -translate-y-2 group-hover:translate-y-0 py-2">
                    {link.dropdown.map((subItem) => (
                      <a
                        key={subItem.name}
                        href={subItem.href}
                        className="block px-4 py-2 text-sm text-gray-300 hover:text-padel-green hover:bg-white/5 transition-colors"
                      >
                        {subItem.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {session ? (
              <div className="flex items-center gap-4 ml-2">
                <a href="/profile" className="text-sm font-bold text-white hover:text-padel-green transition-colors py-2">
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
                className="bg-padel-green text-black px-5 py-2 mt-0 ml-2 rounded-full text-sm font-bold hover:bg-white hover:scale-105 transition-all duration-300">
                Register ↗
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden text-white p-2"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
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
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center gap-8"
          >
            {navLinks.map((link, index) => (
              <div key={link.name} className="flex flex-col items-center">
                <motion.a
                  href={link.href}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index }}
                  onClick={!link.dropdown ? () => setIsMobileMenuOpen(false) : undefined}
                  className="flex items-center gap-2 text-3xl font-bold text-white hover:text-padel-green"
                >
                  {link.name}
                  {link.dropdown && <ChevronDown className="w-6 h-6" />}
                </motion.a>
                {link.dropdown && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    transition={{ delay: 0.1 * index + 0.1 }}
                    className="flex flex-col items-center mt-4 gap-4"
                  >
                    {link.dropdown.map((subItem) => (
                      <a
                        key={subItem.name}
                        href={subItem.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="text-xl font-medium text-gray-400 hover:text-white transition-colors"
                      >
                        {subItem.name}
                      </a>
                    ))}
                  </motion.div>
                )}
              </div>
            ))}
            {session ? (
              <>
                <motion.a
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  href="/profile"
                  className="bg-transparent border-2 border-padel-green text-padel-green px-8 py-4 rounded-full text-xl font-bold mt-4"
                >
                  My Profile
                </motion.a>
                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                  className="text-red-400 text-lg font-bold mt-2"
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
                className="bg-padel-green text-black px-8 py-4 rounded-full text-xl font-bold mt-4"
              >
                Register
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
