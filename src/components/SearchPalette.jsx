import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  X, 
  Users, 
  Calendar, 
  BookOpen, 
  ArrowRight, 
  Command,
  ChevronRight,
  User,
  Star
} from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

const SearchPalette = () => {
  const { isOpen, closeSearch } = useSearch();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({
    players: [],
    events: [],
    blogs: [],
    navigation: []
  });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const staticNav = [
    { name: 'Home', href: '/', icon: ArrowRight, category: 'Site' },
    { name: 'Calendar', href: '/calendar', icon: Calendar, category: 'Site' },
    { name: 'Players', href: '/players', icon: Users, category: 'Site' },
    { name: 'Rankings', href: '/rankings', icon: Star, category: 'Site' },
    { name: 'Blog', href: '/blog', icon: BookOpen, category: 'Site' },
    { name: 'Contact', href: '/contact', icon: ArrowRight, category: 'Site' },
  ];

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults({ players: [], events: [], blogs: [], navigation: [] });
    }
  }, [isOpen]);

  useEffect(() => {
    const searchData = async () => {
      if (query.length < 2) {
        setResults({ 
          players: [], 
          events: [], 
          blogs: [], 
          navigation: staticNav.filter(item => 
            item.name.toLowerCase().includes(query.toLowerCase())
          ) 
        });
        return;
      }

      setLoading(true);
      try {
        const [playersRes, eventsRes, blogsRes] = await Promise.all([
          supabase.from('players').select('name, rankedin_id, id, image_url').ilike('name', `%${query}%`).limit(5),
          supabase.from('calendar').select('event_name, venue, slug, image_url').ilike('event_name', `%${query}%`).limit(5),
          supabase.from('blogs').select('title, slug, category, image_url').ilike('title', `%${query}%`).limit(5)
        ]);

        setResults({
          players: playersRes.data || [],
          events: (eventsRes.data || []).map(e => ({ ...e, name: e.event_name, subtitle: e.venue })),
          blogs: (blogsRes.data || []).map(b => ({ ...b, name: b.title, subtitle: b.category })),
          navigation: staticNav.filter(item => 
            item.name.toLowerCase().includes(query.toLowerCase())
          )
        });
      } catch (error) {
        console.error('Search error:', error);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(searchData, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const allResults = [
    ...results.navigation.map(item => ({ ...item, type: 'nav' })),
    ...results.players.map(item => ({ ...item, type: 'player' })),
    ...results.events.map(item => ({ ...item, type: 'event' })),
    ...results.blogs.map(item => ({ ...item, type: 'blog' }))
  ];

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => (prev + 1) % allResults.length);
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => (prev - 1 + allResults.length) % allResults.length);
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      handleSelect(allResults[selectedIndex]);
    }
  };

  const handleSelect = (item) => {
    closeSearch();
    if (item.type === 'nav') navigate(item.href);
    if (item.type === 'player') navigate(`/players?id=${item.id}`);
    if (item.type === 'event') navigate(`/calendar/${item.slug}`);
    if (item.type === 'blog') navigate(`/blog/${item.slug}`);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[1000] flex items-start justify-center pt-20 px-4 sm:pt-32"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={closeSearch} />
        
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -20 }}
          className="relative w-full max-w-2xl bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input Area */}
          <div className="flex items-center px-4 py-4 border-b border-white/10 bg-white/5">
            <Search className="w-5 h-5 text-[#CCFF00]/60 mr-3" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search players, events, rankings..."
              className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder-gray-500 font-sans"
            />
            <div className="flex items-center gap-2">
              <span className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-gray-500 bg-white/5 uppercase font-medium">
                <Command className="w-3 h-3" /> K
              </span>
              <button 
                onClick={closeSearch}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-[#CCFF00]" />
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar">
            {loading && query.length > 1 ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-400">
                <div className="w-6 h-6 border-2 border-[#CCFF00] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium animate-pulse text-[#CCFF00]/80">Searching everything...</span>
              </div>
            ) : allResults.length > 0 ? (
              <div className="space-y-4 py-2">
                {/* Navigation Results */}
                {results.navigation.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Quick Links</div>
                    {results.navigation.map((item, idx) => (
                      <ResultItem 
                        key={item.href} 
                        item={item} 
                        active={selectedIndex === idx}
                        onClick={() => handleSelect(item)}
                      />
                    ))}
                  </div>
                )}

                {/* Player Results */}
                {results.players.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Players</div>
                    {results.players.map((item, idx) => (
                      <ResultItem 
                        key={item.rankedin_id} 
                        item={{ ...item, name: item.name, icon: User, type: 'player' }} 
                        active={selectedIndex === results.navigation.length + idx}
                        onClick={() => handleSelect({ ...item, type: 'player' })}
                      />
                    ))}
                  </div>
                )}

                {/* Event Results */}
                {results.events.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Tournaments</div>
                    {results.events.map((item, idx) => (
                      <ResultItem 
                        key={item.slug} 
                        item={{ ...item, name: item.name, subtitle: item.location, icon: Calendar, type: 'event' }} 
                        active={selectedIndex === results.navigation.length + results.players.length + idx}
                        onClick={() => handleSelect({ ...item, type: 'event' })}
                      />
                    ))}
                  </div>
                )}

                {/* Blog Results */}
                {results.blogs.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Articles</div>
                    {results.blogs.map((item, idx) => (
                      <ResultItem 
                        key={item.slug} 
                        item={{ ...item, icon: BookOpen, type: 'blog' }} 
                        active={selectedIndex === results.navigation.length + results.players.length + results.events.length + idx}
                        onClick={() => handleSelect({ ...item, type: 'blog' })}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : query.length > 1 ? (
              <div className="py-12 text-center text-gray-500">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-20 text-[#CCFF00]" />
                <p className="text-sm font-medium text-white/80">No results found for "{query}"</p>
                <p className="text-xs mt-1 text-gray-500">Try searching for players, tournaments or rankings</p>
              </div>
            ) : (
              <div className="py-10 px-6">
                <div className="flex items-center gap-3 text-[#CCFF00]/60 mb-6">
                  <Star className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Suggested Searches</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Latest Rankings', href: '/rankings' },
                    { label: 'Upcoming Tournaments', href: '/calendar' },
                    { label: 'Broll Pro Tour', query: 'Broll' },
                    { label: 'Player Profiles', href: '/players' }
                  ].map((suggest) => (
                    <button
                      key={suggest.label}
                      onClick={() => {
                        if (suggest.href) {
                          closeSearch();
                          navigate(suggest.href);
                        } else {
                          setQuery(suggest.query);
                        }
                      }}
                      className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:border-[#CCFF00]/30 hover:bg-[#CCFF00]/5 transition-all text-left group"
                    >
                      <span className="text-sm text-gray-400 group-hover:text-white transition-colors">{suggest.label}</span>
                      <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-[#CCFF00]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-white/10 bg-black/40 flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-tighter">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono">ESC</kbd> Close</span>
              <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-white font-mono">ENTER</kbd> Select</span>
            </div>
            <div className="text-[#CCFF00] font-black tracking-widest">4M PADEL</div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const ResultItem = ({ item, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-4 py-3 transition-all duration-200 border-l-2 ${
      active 
        ? 'bg-[#CCFF00]/10 border-[#CCFF00] translate-x-1' 
        : 'border-transparent hover:bg-white/5'
    }`}
  >
    <div className={`p-2 rounded-lg ${active ? 'bg-[#CCFF00] text-black' : 'bg-white/5 text-gray-400'}`}>
      <item.icon className="w-4 h-4" />
    </div>
    <div className="flex-1 text-left min-w-0">
      <div className={`text-sm font-bold truncate ${active ? 'text-white' : 'text-gray-300'}`}>
        {item.name}
      </div>
      {(item.subtitle || item.category || item.rankedin_id) && (
        <div className="text-[10px] text-gray-500 font-medium uppercase truncate tracking-wide mt-0.5">
          {item.subtitle || item.category || (item.rankedin_id ? `ID: ${item.rankedin_id}` : '')}
        </div>
      )}
    </div>
    {active && <ChevronRight className="w-4 h-4 text-[#CCFF00]" />}
  </button>
);

export default SearchPalette;
