import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Save, AlertCircle, Cloud, Check, Loader2 } from 'lucide-react';
import { useSEOContext } from '../context/SEOProvider';

const RedirectManager = () => {
    const { saveRedirectsToGH, isGitHubConfigured } = useSEOContext();

    const [redirects, setRedirects] = useState([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [syncStatus, setSyncStatus] = useState({ loading: false, success: false, error: null });
    const [newRedirect, setNewRedirect] = useState({
        from: '',
        to: '',
        type: 301,
        active: true,
        regex: false
    });

    useEffect(() => {
        const stored = localStorage.getItem('seo_redirects');
        if (stored) {
            setRedirects(JSON.parse(stored));
        } else {
            // Load initial from JSON (simulated)
            import('../redirects.json').then(data => {
                setRedirects(data.default || []);
            });
        }
    }, []);

    const saveRedirects = (updated) => {
        setRedirects(updated);
        localStorage.setItem('seo_redirects', JSON.stringify(updated));
        setHasUnsavedChanges(true);
    };

    const syncToGitHub = async () => {
        if (!isGitHubConfigured) {
            alert('Please configure GitHub in Settings first.');
            return;
        }

        setSyncStatus({ loading: true, success: false, error: null });

        try {
            const result = await saveRedirectsToGH(redirects);
            if (result.success) {
                setSyncStatus({ loading: false, success: true, error: null });
                setHasUnsavedChanges(false);
                setTimeout(() => setSyncStatus(prev => ({ ...prev, success: false })), 3000);
            } else {
                setSyncStatus({ loading: false, success: false, error: result.error });
            }
        } catch (err) {
            setSyncStatus({ loading: false, success: false, error: err.message });
        }
    };

    const addRedirect = () => {
        if (!newRedirect.from || !newRedirect.to) return;

        const updated = [...redirects, {
            ...newRedirect,
            id: Date.now(),
            hits: 0,
            lastHit: null
        }];

        saveRedirects(updated);
        setNewRedirect({
            from: '',
            to: '',
            type: 301,
            active: true,
            regex: false
        });
    };

    const deleteRedirect = (id) => {
        if (confirm('Are you sure you want to delete this redirect?')) {
            const updated = redirects.filter(r => r.id !== id);
            saveRedirects(updated);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Redirect Manager</h3>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-neutral-400">{redirects.length} rules active</span>
                    {isGitHubConfigured && (
                        <button
                            onClick={syncToGitHub}
                            disabled={syncStatus.loading}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all ${syncStatus.loading
                                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                                    : syncStatus.success
                                        ? 'bg-green-600 text-white'
                                        : hasUnsavedChanges
                                            ? 'bg-purple-600 hover:bg-purple-500 text-white'
                                            : 'bg-gray-700 text-gray-400'
                                }`}
                        >
                            {syncStatus.loading ? (
                                <><Loader2 size={14} className="animate-spin" /> Syncing...</>
                            ) : syncStatus.success ? (
                                <><Check size={14} /> Synced!</>
                            ) : (
                                <><Cloud size={14} /> Sync to GitHub</>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {syncStatus.error && (
                <div className="text-xs text-red-400 bg-red-900/20 border border-red-900 rounded p-2">
                    {syncStatus.error}
                </div>
            )}

            {/* Add New Redirect */}
            <div className="bg-neutral-800 p-4 rounded-lg border border-neutral-700 space-y-4">
                <h4 className="text-sm font-medium text-amber-500 uppercase tracking-wider">Add New Redirect</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs text-neutral-400 mb-1">Source URL</label>
                        <input
                            type="text"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white text-sm focus:border-amber-500 outline-none"
                            placeholder="/old-page"
                            value={newRedirect.from}
                            onChange={e => setNewRedirect({ ...newRedirect, from: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-neutral-400 mb-1">Target URL</label>
                        <input
                            type="text"
                            className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white text-sm focus:border-amber-500 outline-none"
                            placeholder="/new-page"
                            value={newRedirect.to}
                            onChange={e => setNewRedirect({ ...newRedirect, to: e.target.value })}
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <select
                        className="bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white text-sm focus:border-amber-500 outline-none"
                        value={newRedirect.type}
                        onChange={e => setNewRedirect({ ...newRedirect, type: Number(e.target.value) })}
                    >
                        <option value={301}>301 Permanent</option>
                        <option value={302}>302 Temporary</option>
                        <option value={307}>307 Temporary</option>
                    </select>

                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={newRedirect.regex}
                            onChange={e => setNewRedirect({ ...newRedirect, regex: e.target.checked })}
                            className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500/50"
                        />
                        Regex Match
                    </label>

                    <button
                        onClick={addRedirect}
                        disabled={!newRedirect.from || !newRedirect.to}
                        className="ml-auto flex items-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                    >
                        <Plus size={16} />
                        Add Redirect
                    </button>
                </div>
            </div>

            {/* Redirect List */}
            <div className="space-y-2">
                {redirects.length === 0 ? (
                    <div className="text-center py-8 text-neutral-500 bg-neutral-800/50 rounded-lg">
                        <AlertCircle className="mx-auto mb-2 opacity-50" />
                        <p>No redirects configured</p>
                    </div>
                ) : (
                    redirects.map(redirect => (
                        <div key={redirect.id} className="bg-neutral-800 p-4 rounded-lg border border-neutral-700 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-neutral-600 transition-colors">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${redirect.type === 301 ? 'bg-green-900/50 text-green-400' : 'bg-blue-900/50 text-blue-400'
                                        }`}>
                                        {redirect.type}
                                    </span>
                                    {redirect.regex && (
                                        <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-400">REGEX</span>
                                    )}
                                    <span className="text-xs text-neutral-500">
                                        {redirect.hits} hits • Last: {redirect.lastHit ? new Date(redirect.lastHit).toLocaleDateString() : 'Never'}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm font-mono">
                                    <span className="text-red-400 truncate max-w-[200px]" title={redirect.from}>{redirect.from}</span>
                                    <span className="text-neutral-500">→</span>
                                    <span className="text-green-400 truncate max-w-[200px]" title={redirect.to}>{redirect.to}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => deleteRedirect(redirect.id)}
                                    className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default RedirectManager;

