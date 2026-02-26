import React, { useState, useEffect } from 'react';
import { Trash, ExternalLink, AlertTriangle, ArrowRight, RotateCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const FourOhFourMonitor = () => {
    const [logs, setLogs] = useState([]);

    // Load logs from localStorage
    const loadLogs = () => {
        try {
            const stored = localStorage.getItem('seo_404_logs');
            if (stored) {
                setLogs(JSON.parse(stored));
            } else {
                setLogs([]);
            }
        } catch (e) {
            console.error('Failed to load 404 logs', e);
        }
    };

    useEffect(() => {
        loadLogs();
        // Poll for updates every 5 seconds (useful if testing live)
        const interval = setInterval(loadLogs, 5000);
        return () => clearInterval(interval);
    }, []);

    const clearLogs = () => {
        if (confirm('Are you sure you want to clear all 404 logs?')) {
            localStorage.removeItem('seo_404_logs');
            setLogs([]);
        }
    };

    const deleteLog = (path) => {
        const newLogs = logs.filter(log => log.path !== path);
        localStorage.setItem('seo_404_logs', JSON.stringify(newLogs));
        setLogs(newLogs);
    };

    // Helper to format date
    const formatDate = (isoString) => {
        try {
            return new Date(isoString).toLocaleString();
        } catch (e) {
            return 'Unknown';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-500" />
                        404 Monitor
                    </h3>
                    <p className="text-xs text-gray-500">Track and fix broken links</p>
                </div>
                <button
                    onClick={clearLogs}
                    className="text-xs text-gray-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                    disabled={logs.length === 0}
                >
                    <Trash size={12} />
                    Clear Logs
                </button>
            </div>

            {logs.length === 0 ? (
                <div className="text-center py-10 bg-gray-800/50 rounded-lg border border-gray-700">
                    <CheckCircleIcon className="mx-auto h-8 w-8 text-green-500 mb-2 opacity-50" />
                    <p className="text-sm text-gray-400">No 404 errors detected yet.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {logs.map((log) => (
                        <div key={log.path} className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-600 transition-colors group">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-sm font-medium text-red-400 truncate" title={log.path}>
                                            {log.path}
                                        </h4>
                                        <span className="text-[10px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                                            {log.hits} {log.hits === 1 ? 'hit' : 'hits'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate" title={log.referer}>
                                        Referer: {log.referer}
                                    </p>
                                    <p className="text-[10px] text-gray-600 mt-0.5">
                                        Last seen: {formatDate(log.lastSeen)}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {/* Action buttons could go here, e.g. "Create Redirect" */}
                                    <button
                                        onClick={() => deleteLog(log.path)}
                                        className="p-1.5 text-gray-500 hover:text-red-400 bg-gray-700/50 hover:bg-gray-700 rounded transition-colors"
                                        title="Delete log"
                                    >
                                        <Trash size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Quick Fix Button - could trigger RedirectManager via context/props if linked */}
                            <div className="pt-2 border-t border-gray-700/50 mt-2 flex justify-end">
                                <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium">
                                    <RotateCcw size={12} />
                                    Create Redirect
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Simple Icon component for the empty state
const CheckCircleIcon = (props) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

export default FourOhFourMonitor;
