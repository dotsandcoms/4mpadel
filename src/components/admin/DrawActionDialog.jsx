import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Native modal dialogs also appear above the Players & seeds side drawer.
export default function DrawActionDialog({ open, title, onClose, children, footer, alert = false, wide = false }) {
    const ref = useRef(null);
    const titleId = useId();
    useEffect(() => {
        if (!open) return;
        const dialog = ref.current;
        const previous = document.activeElement;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        dialog.showModal();
        return () => {
            dialog.close();
            document.body.style.overflow = overflow;
            if (previous?.isConnected) previous.focus();
        };
    }, [open]);

    return createPortal(
        <dialog ref={ref} role={alert ? 'alertdialog' : undefined} aria-labelledby={titleId} aria-describedby={alert ? `${titleId}-content` : undefined}
            onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
            className={`fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${wide ? 'max-w-3xl' : 'max-w-lg'} ${footer ? 'open:flex open:flex-col overflow-hidden' : 'overflow-y-auto'} overscroll-contain rounded-2xl border border-white/20 bg-[#101214] p-0 text-white shadow-2xl backdrop:bg-black/70`}>
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 bg-[#101214] border-b border-white/15 px-5 py-4">
                <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                <button type="button" autoFocus onClick={onClose} aria-label="Close popup"
                    className="rounded-lg border border-white/20 p-2 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"><X size={20} /></button>
            </div>
            <div id={`${titleId}-content`} className={`space-y-4 ${footer ? 'min-h-0 overflow-y-auto overscroll-contain px-5 py-4' : 'p-5'}`}>{children}</div>
            {footer && <div className="shrink-0 border-t border-white/15 bg-[#14191c] px-5 py-4">{footer}</div>}
        </dialog>, document.body,
    );
}
