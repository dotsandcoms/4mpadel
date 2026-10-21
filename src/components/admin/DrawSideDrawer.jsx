import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function DrawSideDrawer({ open, title, onClose, children }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return;
        const previous = document.activeElement;
        const overflow = document.body.style.overflow;
        ref.current.showModal();
        document.body.style.overflow = 'hidden';
        return () => { ref.current?.close(); document.body.style.overflow = overflow; previous?.focus(); };
    }, [open]);
    return createPortal(<dialog ref={ref} aria-label={title} onCancel={onClose} className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-full max-w-3xl border-l border-white/20 bg-[#101214] p-0 text-white shadow-2xl backdrop:bg-black/65">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/15 bg-[#101214] px-6 py-5"><h2 className="text-xl font-bold">{title}</h2><button type="button" autoFocus onClick={onClose} aria-label="Close panel" className="rounded-lg border border-white/20 p-3 hover:bg-white/10"><X size={20}/></button></div>
        <div className="p-4 sm:p-6">{children}</div>
    </dialog>, document.body);
}
