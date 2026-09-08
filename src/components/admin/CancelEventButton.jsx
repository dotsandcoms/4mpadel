import { Ban } from 'lucide-react';

export default function CancelEventButton({ onClick, className = '' }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-4 py-2 rounded-xl font-bold text-red-400 border border-red-500/30 hover:bg-red-500/10 inline-flex items-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 ${className}`}
        >
            <Ban size={16} className="shrink-0" /> Cancel event
        </button>
    );
}
