import React, { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Heading, List, ListOrdered, X } from 'lucide-react';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import './EventRichTextEditor.css';

// Shared EventBuilder controls and HTML contract; the preview only changes presentation.
export default function EventRichTextEditor({ value, onChange, placeholder = 'Type here...', minHeight = 130, theme = 'legacy', label = 'Formatted text' }) {
  const ref = useRef(null);
  useEffect(() => {
    const html = sanitizeHtml(value || '');
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html;
  }, [value]);
  const emit = () => onChange(ref.current ? sanitizeHtml(ref.current.innerHTML) : '');
  const exec = (command, arg = null) => { ref.current?.focus(); document.execCommand(command, false, arg); emit(); };
  const tools = [[Bold, 'Bold', 'bold'], [Italic, 'Italic', 'italic'], [Underline, 'Underline', 'underline'], [Heading, 'Heading', 'formatBlock', '<h3>'], [List, 'Bullet list', 'insertUnorderedList'], [ListOrdered, 'Numbered list', 'insertOrderedList'], [X, 'Clear formatting', 'removeFormat']];
  return <div className={theme === 'preview' ? 'ap-rich-editor' : 'border border-white/10 rounded-lg overflow-hidden bg-black/40 focus-within:border-padel-green'}>
    <div role="toolbar" aria-label={`${label} formatting`} className={theme === 'preview' ? 'ap-rich-toolbar' : 'flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-white/10 bg-white/5'}>
      {tools.map(([Icon, title, command, arg]) => <button key={title} type="button" title={title} aria-label={title} onMouseDown={e => e.preventDefault()} onClick={() => exec(command, arg)} className={theme === 'preview' ? '' : 'p-1.5 rounded text-gray-300 hover:bg-padel-green hover:text-black transition-colors'}><Icon size={16}/></button>)}
    </div>
    <div ref={ref} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label} onInput={emit} onBlur={emit} data-placeholder={placeholder} className={theme === 'preview' ? 'ap-rich-content' : 'rte-content px-4 py-3 text-white text-sm leading-relaxed focus:outline-none overflow-y-auto custom-scrollbar'} style={{ minHeight }} onPaste={e => {
      const html = e.clipboardData.getData('text/html');
      if (html) { e.preventDefault(); exec('insertHTML', sanitizeHtml(html)); }
    }}/>
  </div>;
}
