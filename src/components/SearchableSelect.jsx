import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, Check } from 'lucide-react';

const SearchableSelect = ({ 
    options, 
    value, 
    onChange, 
    placeholder = "Select an option",
    icon: Icon,
    className = ""
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    const filteredOptions = options.filter(option => 
        option.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const selectedOption = options.find(opt => opt.value === value);

    const handleSelect = (optionValue) => {
        onChange({ target: { value: optionValue } });
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {Icon && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none text-padel-green/75">
                    <Icon size={18} className="w-4 h-4 md:w-5 md:h-5" />
                </div>
            )}
            
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-white/[0.03] backdrop-blur-md border border-white/10 ${Icon ? 'pl-11 md:pl-12' : 'pl-4'} pr-10 py-3 md:py-4 text-left text-white focus:outline-none focus:border-padel-green/50 focus:bg-white/[0.05] hover:border-white/20 transition-all font-bold text-xs md:text-sm rounded-xl md:rounded-2xl`}
            >
                {selectedOption ? (
                    <span className="truncate block">{selectedOption.label}</span>
                ) : (
                    <span className="text-gray-500 truncate block">{placeholder}</span>
                )}
            </button>
            
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown className={`w-4 h-4 md:w-5 md:h-5 text-white/50 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scaleY: 0.95 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -10, scaleY: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-[9999] w-full mt-2 bg-[#0F172A] border border-white/10 rounded-xl overflow-hidden shadow-2xl origin-top"
                    >
                        <div className="p-2 border-b border-white/5 bg-black/20">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Search..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-padel-green/50 placeholder:text-gray-600"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                        
                        <div className="max-h-60 overflow-y-auto py-1 custom-scrollbar">
                            {filteredOptions.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                                    No options found
                                </div>
                            ) : (
                                filteredOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleSelect(option.value)}
                                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-colors flex items-center justify-between group"
                                    >
                                        <span className={`truncate ${value === option.value ? 'text-padel-green font-bold' : 'text-gray-300 group-hover:text-white'}`}>
                                            {option.label}
                                        </span>
                                        {value === option.value && (
                                            <Check className="w-4 h-4 text-padel-green shrink-0 ml-2" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SearchableSelect;
