import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Home, Calendar, Trophy, Image, User } from 'lucide-react';
import { requiresAuth } from '../utils/routeAccess';

const MobileBottomNav = ({ session, authLoading, onRestrictedNav }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleNavClick = (path) => {
    if (requiresAuth(path) && authLoading) return;
    if (!session && requiresAuth(path)) {
      onRestrictedNav?.();
      return;
    }
    navigate(path);
  };

  // Define our 5 core navigation items
  const navItems = [
    { name: 'Home', path: '/', icon: Home },
    { name: 'Calendar', path: '/calendar', icon: Calendar },
    { name: 'Rankings', path: '/rankings', icon: Trophy },
    { name: 'Media', path: '/gallery', icon: Image },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  // Helper to determine if a route is active
  const getIsActive = (path) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  // Skip rendering on admin routes
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/reports')) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[999] md:hidden flex justify-center">
      {/* iOS Liquid Glass Container */}
      <div className="relative w-full max-w-[390px] bg-slate-950/90 backdrop-blur-xl border border-white/5 rounded-2xl p-1 flex items-center justify-around shadow-[0_10px_30px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-black/20">
        
        {/* Subtle glass reflection highlight across the top half of the bar */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent rounded-t-2xl pointer-events-none" />

        {navItems.map((item) => {
          const isActive = getIsActive(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.name}
              onClick={() => handleNavClick(item.path)}
              className="relative flex flex-col items-center justify-center py-1.5 px-1 rounded-xl flex-1 cursor-pointer select-none active:scale-95 transition-transform outline-none group"
            >
              <div className="relative flex flex-col items-center justify-center">
                {/* Liquid Active Bubble Background (only around icon now) */}
                {isActive && (
                  <motion.div
                    layoutId="liquid-pill"
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-[#CCFF00]/15 rounded-full -z-10"
                    transition={{
                      type: 'spring',
                      stiffness: 380,
                      damping: 26,
                      mass: 0.8
                    }}
                  />
                )}

                {/* Icon Container with Micro-animation on Active */}
                <motion.div
                  animate={isActive ? { 
                    y: -1,
                    scale: [1, 1.1, 1],
                    filter: 'drop-shadow(0 2px 6px rgba(204,255,0,0.3))'
                  } : { 
                    y: 0, 
                    scale: 1 
                  }}
                  transition={{ 
                    type: 'spring', 
                    stiffness: 400, 
                    damping: 15 
                  }}
                  className={`relative z-10 transition-colors duration-300 ${
                    isActive ? 'text-[#CCFF00]' : 'text-gray-500 group-hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </motion.div>
              </div>

              {/* Label - visible on active, or subtle slide in */}
              <motion.span
                layout
                className={`text-[9px] font-medium tracking-wide mt-1 z-10 transition-colors duration-300 ${
                  isActive ? 'text-[#CCFF00]' : 'text-gray-500 group-hover:text-gray-300'
                }`}
              >
                {item.name}
              </motion.span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MobileBottomNav;
