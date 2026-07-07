import React, { useState, useEffect, useRef } from 'react';

const RichTextEditor = ({ value, onChange, placeholder = 'Rules, match rules, seeding information...' }) => {
    const editorRef = useRef(null);
    const [isMounted, setIsMounted] = useState(false);

    // Sync initial value on mount
    useEffect(() => {
        if (editorRef.current && !isMounted) {
            editorRef.current.innerHTML = value || '';
            setIsMounted(true);
        }
    }, [value, isMounted]);

    // Handle external clears or changes (e.g. form resets)
    useEffect(() => {
        if (editorRef.current && isMounted && !value && editorRef.current.innerHTML !== '') {
            editorRef.current.innerHTML = '';
        }
    }, [value, isMounted]);

    const handleInput = () => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            onChange(html === '<br>' ? '' : html);
        }
    };

    const execCommand = (command, val = null) => {
        document.execCommand(command, false, val);
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            onChange(html === '<br>' ? '' : html);
        }
    };

    const addLink = () => {
        const url = prompt("Enter Link URL (e.g. https://4mpadel.co.za):");
        if (url) {
            // Ensure protocol exists
            const formattedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`;
            execCommand('createLink', formattedUrl);
        }
    };

    return (
        <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/40 flex flex-col focus-within:border-padel-green focus-within:ring-1 focus-within:ring-padel-green transition-all duration-300">
            <style dangerouslySetInnerHTML={{__html: `
                .rich-editor-content[contenteditable]:empty:before {
                    content: attr(placeholder);
                    color: rgba(255, 255, 255, 0.25);
                    cursor: text;
                }
                .rich-editor-content ul {
                    list-style-type: disc !important;
                    margin-left: 24px !important;
                    margin-top: 8px !important;
                    margin-bottom: 8px !important;
                }
                .rich-editor-content ol {
                    list-style-type: decimal !important;
                    margin-left: 24px !important;
                    margin-top: 8px !important;
                    margin-bottom: 8px !important;
                }
                .rich-editor-content li {
                    margin-bottom: 4px !important;
                }
                .rich-editor-content a {
                    color: #9AE900 !important;
                    text-decoration: underline !important;
                    font-weight: 600;
                }
                .rich-editor-content h3 {
                    font-size: 1.25rem !important;
                    font-weight: 800 !important;
                    margin-top: 14px !important;
                    margin-bottom: 6px !important;
                    color: #FFFFFF !important;
                }
                .rich-editor-content h4 {
                    font-size: 1.1rem !important;
                    font-weight: 700 !important;
                    margin-top: 10px !important;
                    margin-bottom: 4px !important;
                    color: #E2E8F0 !important;
                }
                .rich-editor-content p {
                    margin-bottom: 8px !important;
                }
            `}} />

            {/* Rich Text Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 bg-white/5 border-b border-white/10">
                <button
                    type="button"
                    onClick={() => execCommand('bold')}
                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-black text-gray-300 cursor-pointer"
                    title="Bold"
                >
                    B
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('italic')}
                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs italic text-gray-300 cursor-pointer"
                    title="Italic"
                >
                    I
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('underline')}
                    className="w-8 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs underline text-gray-300 cursor-pointer"
                    title="Underline"
                >
                    U
                </button>
                
                <div className="w-px h-5 bg-white/10 mx-1" />
                
                <button
                    type="button"
                    onClick={() => execCommand('formatBlock', '<h3>')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-black text-gray-300 cursor-pointer"
                    title="Header H3"
                >
                    H1
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('formatBlock', '<h4>')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-bold text-gray-300 cursor-pointer"
                    title="Header H4"
                >
                    H2
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('formatBlock', '<p>')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-[10px] font-bold text-gray-400 cursor-pointer"
                    title="Normal Paragraph"
                >
                    TXT
                </button>
                
                <div className="w-px h-5 bg-white/10 mx-1" />
                
                <button
                    type="button"
                    onClick={() => execCommand('insertUnorderedList')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-medium text-gray-300 cursor-pointer"
                    title="Bulleted List"
                >
                    • List
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('insertOrderedList')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-medium text-gray-300 cursor-pointer"
                    title="Numbered List"
                >
                    1. List
                </button>
                
                <div className="w-px h-5 bg-white/10 mx-1" />
                
                <button
                    type="button"
                    onClick={addLink}
                    className="px-2.5 h-8 flex items-center justify-center hover:bg-white/10 hover:text-padel-green rounded-lg transition-all text-xs font-bold text-gray-300 cursor-pointer"
                    title="Insert Link"
                >
                    Link
                </button>
                <button
                    type="button"
                    onClick={() => execCommand('unlink')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-red-400 rounded-lg transition-all text-xs text-gray-500 cursor-pointer"
                    title="Remove Link"
                >
                    Unlink
                </button>
                
                <div className="w-px h-5 bg-white/10 mx-1" />
                
                <button
                    type="button"
                    onClick={() => execCommand('removeFormat')}
                    className="px-2 h-8 flex items-center justify-center hover:bg-white/10 hover:text-amber-400 rounded-lg transition-all text-[10px] font-bold text-gray-500 cursor-pointer uppercase tracking-wider"
                    title="Clear Formatting"
                >
                    Clear
                </button>
            </div>

            {/* Editable Content viewport */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                className="rich-editor-content w-full min-h-[160px] max-h-[350px] p-4 text-white focus:outline-none overflow-y-auto text-sm leading-relaxed"
                placeholder={placeholder}
                style={{ minHeight: '160px' }}
            />
        </div>
    );
};

export default RichTextEditor;
