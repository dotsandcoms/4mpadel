import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

const normalize = (value) => String(value || '').toLowerCase().trim();

const SearchableSelect = ({
    id,
    value,
    options,
    onChange,
    emptyLabel,
    searchPlaceholder = 'Search…',
}) => {
    const rootRef = useRef(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const selectedOption = options.find((option) => String(option.value) === String(value));
    const filteredOptions = useMemo(() => {
        const search = normalize(query);
        if (!search) return options;
        return options.filter((option) => normalize(`${option.label} ${option.searchText || ''}`).includes(search));
    }, [options, query]);

    useEffect(() => {
        const closeOnOutsidePointer = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setIsOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        listRef.current?.querySelector(`[data-option-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, isOpen]);

    const chooseOption = (option) => {
        onChange(option.value);
        setIsOpen(false);
        setQuery('');
        inputRef.current?.focus();
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
            setIsOpen(false);
            setQuery('');
            return;
        }
        if (event.key === 'Tab') {
            setIsOpen(false);
            setQuery('');
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) => Math.min(index + 1, Math.max(filteredOptions.length - 1, 0)));
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
        }
        if (event.key === 'Enter' && isOpen && filteredOptions[activeIndex]) {
            event.preventDefault();
            chooseOption(filteredOptions[activeIndex]);
        }
    };

    const listboxId = `${id}-listbox`;
    const activeOptionId = filteredOptions[activeIndex] ? `${id}-option-${activeIndex}` : undefined;

    return (
        <div ref={rootRef} className="relative">
            <div className={`relative rounded-lg border bg-black/40 transition-colors ${isOpen ? 'border-padel-green' : 'border-white/10'}`}>
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
                <input
                    ref={inputRef}
                    id={id}
                    type="text"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls={listboxId}
                    aria-activedescendant={isOpen ? activeOptionId : undefined}
                    autoComplete="off"
                    value={isOpen ? query : (selectedOption?.label || emptyLabel)}
                    placeholder={searchPlaceholder}
                    onFocus={() => {
                        setIsOpen(true);
                        setQuery('');
                        setActiveIndex(0);
                    }}
                    onClick={() => setIsOpen(true)}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                        setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    className="w-full rounded-lg bg-transparent py-3 pl-10 pr-10 text-base text-white outline-none sm:text-sm"
                />
                <button
                    type="button"
                    onClick={() => {
                        if (isOpen) {
                            setIsOpen(false);
                            setQuery('');
                        } else {
                            inputRef.current?.focus();
                        }
                    }}
                    className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center text-gray-400 hover:text-white"
                    aria-label={isOpen ? 'Close options' : 'Open options'}
                    tabIndex={-1}
                >
                    <ChevronDown size={18} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {isOpen && (
                <div className="absolute left-0 right-0 z-[260] mt-2 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
                    <div className="border-b border-white/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500" role="status">
                        {filteredOptions.length} {filteredOptions.length === 1 ? 'result' : 'results'}
                    </div>
                    <div ref={listRef} id={listboxId} role="listbox" className="max-h-64 overscroll-contain overflow-y-auto p-1.5 custom-scrollbar">
                        {filteredOptions.length > 0 ? filteredOptions.map((option, index) => {
                            const isSelected = String(option.value) === String(value);
                            const isActive = index === activeIndex;
                            return (
                                <button
                                    type="button"
                                    id={`${id}-option-${index}`}
                                    data-option-index={index}
                                    key={String(option.value)}
                                    role="option"
                                    aria-selected={isSelected}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={() => chooseOption(option)}
                                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${isActive ? 'bg-white/10 text-white' : 'text-gray-300'} ${isSelected ? 'font-semibold' : ''}`}
                                >
                                    <span className="min-w-0 truncate">{option.label}</span>
                                    {isSelected && <Check size={16} className="shrink-0 text-padel-green" aria-hidden="true" />}
                                </button>
                            );
                        }) : (
                            <p className="px-3 py-5 text-center text-sm text-gray-500">No matching results</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
