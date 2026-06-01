import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { X, Share, Download, Plus } from 'lucide-react';

const DISMISS_KEY = 'pwa-install-dismissed';
const DISMISS_DAYS = 14;
const IOS_DELAY_MS = 2500;
const ANDROID_FALLBACK_DELAY_MS = 4000;

const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(max-width: 767px)').matches ||
        /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    );
};

const isIos = () =>
    /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !window.MSStream;

const wasDismissedRecently = () => {
    try {
        const raw = localStorage.getItem(DISMISS_KEY);
        if (!raw) return false;
        const dismissedAt = parseInt(raw, 10);
        if (Number.isNaN(dismissedAt)) return false;
        return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
};

/**
 * Mobile "Add to Home Screen" prompt.
 * - Android/Chrome: uses beforeinstallprompt when available, else manual menu steps.
 * - iOS Safari: Share → Add to Home Screen instructions (no beforeinstallprompt).
 */
const PwaInstallPrompt = () => {
    const location = useLocation();
    const [visible, setVisible] = useState(false);
    const [mode, setMode] = useState('android'); // android | android-manual | ios
    const [deferredPrompt, setDeferredPrompt] = useState(null);
    const gotInstallPrompt = useRef(false);

    useEffect(() => {
        if (
            !isMobileDevice() ||
            isStandalone() ||
            wasDismissedRecently()
        ) {
            return;
        }

        if (isIos()) {
            const timer = setTimeout(() => {
                setMode('ios');
                setVisible(true);
            }, IOS_DELAY_MS);
            return () => clearTimeout(timer);
        }

        const onBeforeInstall = (e) => {
            e.preventDefault();
            gotInstallPrompt.current = true;
            setDeferredPrompt(e);
            setMode('android');
            setVisible(true);
        };

        window.addEventListener('beforeinstallprompt', onBeforeInstall);

        const fallbackTimer = setTimeout(() => {
            if (!gotInstallPrompt.current && !isStandalone()) {
                setMode('android-manual');
                setVisible(true);
            }
        }, ANDROID_FALLBACK_DELAY_MS);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            clearTimeout(fallbackTimer);
        };
    }, []);

    const handleDismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            /* ignore */
        }
        setVisible(false);
    };

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                handleDismiss();
            }
        } catch (err) {
            console.error('PWA install prompt failed:', err);
        } finally {
            setDeferredPrompt(null);
        }
    };

    if (
        location.pathname.startsWith('/admin') ||
        location.pathname.startsWith('/reports')
    ) {
        return null;
    }

    if (!visible) return null;

    return (
        <div
            className="fixed bottom-24 left-4 right-4 z-[1000] md:hidden flex justify-center pointer-events-none"
            role="dialog"
            aria-label="Add app to home screen"
        >
            <div className="pointer-events-auto w-full max-w-[390px] bg-slate-950/90 backdrop-blur-xl border border-[#CCFF00]/30 rounded-2xl p-4 shadow-[0_15px_40px_rgba(0,0,0,0.7)] ring-1 ring-black/30">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 w-10 h-10 rounded-xl bg-[#CCFF00]/15 border border-[#CCFF00]/30 flex items-center justify-center">
                        {mode === 'ios' ? (
                            <Share size={18} className="text-[#CCFF00]" />
                        ) : (
                            <Download size={18} className="text-[#CCFF00]" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white uppercase tracking-wide">
                            Add to Home Screen
                        </p>
                        {mode === 'ios' ? (
                            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                                Tap{' '}
                                <Share size={10} className="inline -mt-0.5 text-[#CCFF00]" />{' '}
                                <span className="text-white font-semibold">Share</span>, then{' '}
                                <Plus size={10} className="inline -mt-0.5 text-[#CCFF00]" />{' '}
                                <span className="text-white font-semibold">Add to Home Screen</span>{' '}
                                for quick access to 4M Padel.
                            </p>
                        ) : mode === 'android-manual' ? (
                            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                                Open your browser menu (
                                <span className="text-white font-semibold">⋮</span>) and choose{' '}
                                <span className="text-white font-semibold">Install app</span> or{' '}
                                <span className="text-white font-semibold">Add to Home screen</span>.
                            </p>
                        ) : (
                            <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                                Install 4M Padel on your home screen for faster access to rankings,
                                events, and your profile.
                            </p>
                        )}
                        <div className="flex gap-2 mt-3">
                            {mode === 'android' && deferredPrompt && (
                                <button
                                    type="button"
                                    onClick={handleInstall}
                                    className="flex-1 text-[10px] font-black uppercase tracking-widest px-3 py-2 bg-[#CCFF00] hover:bg-[#CCFF00]/90 text-black rounded-xl transition-all active:scale-[0.97]"
                                >
                                    Install
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleDismiss}
                                className={`text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all active:scale-[0.97] ${
                                    mode === 'android' && deferredPrompt ? '' : 'flex-1'
                                }`}
                            >
                                Not now
                            </button>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="shrink-0 p-1 text-gray-500 hover:text-white transition-colors"
                        aria-label="Dismiss"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PwaInstallPrompt;
