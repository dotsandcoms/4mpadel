import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// eslint-disable-next-line no-unused-vars
import { motion } from 'framer-motion';
import { Home, Calendar, Trophy, Image, User } from 'lucide-react';

const MobileBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
      <div className="relative w-full max-w-[390px] bg-slate-950/40 backdrop-blur-xl border border-white/10 rounded-2xl p-1.5 flex items-center justify-around shadow-[0_15px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.15)] ring-1 ring-black/20">
        
        {/* Subtle glass reflection highlight across the top half of the bar */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-2xl pointer-events-none" />

        {navItems.map((item) => {
          const isActive = getIsActive(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.name}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl flex-1 cursor-pointer select-none active:scale-95 transition-transform outline-none group"
            >
              {/* Liquid Active Bubble Background */}
              {isActive && (
                <motion.div
                  layoutId="liquid-pill"
                  className="absolute inset-0 bg-[#CCFF00] rounded-xl shadow-[0_6px_15px_rgba(204,255,0,0.3)] -z-10"
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
                  scale: [1, 1.12, 1],
                  filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))'
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
                  isActive ? 'text-black font-extrabold' : 'text-gray-400 group-hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </motion.div>

              {/* Label - visible on active, or subtle slide in */}
              <motion.span
                layout
                className={`text-[8px] font-black uppercase tracking-wider mt-0.5 z-10 transition-colors duration-300 ${
                  isActive ? 'text-black' : 'text-gray-400/80 group-hover:text-white'
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
