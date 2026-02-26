import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSEOContext } from '../context/SEOProvider';
import useSEOScore, { SEO_RULES } from '../hooks/useSEOScore';
import useReadability from '../hooks/useReadability';
import useInternalLinks from '../hooks/useInternalLinks';
import { generateSEOTitle, generateSEODescription, generateSEOImage } from '../utils/ai';
import { X, Search, ChevronDown, ChevronUp, Copy, Check, Eye, AlertCircle, CheckCircle, Monitor, Smartphone, Maximize2, Minimize2, Trash, Settings, Repeat, AlertTriangle, BarChart, Sparkles, Loader2, Link, Github, ExternalLink, Cloud, KeyRound } from 'lucide-react';
import RedirectManager from './RedirectManager';
import FourOhFourMonitor from './FourOhFourMonitor';
import AnalyticsDashboard from './AnalyticsDashboard';

/**
 * SEOAdminPanel
 * A floating admin panel for managing SEO settings
 * 
 * Activation:
 * - Development: Always visible
 * - Production: Requires URL param (default: ?seo-admin or configurable)
 * 
 * Features:
 * - Real-time SEO scoring
 * - Tag-based keyword input
 * - Google & Social Previews
 * - Redirect Manager
 * - GitHub Integration for persistent saves
 */
// Inner component handles all UI and Logic, but is only mounted when activated
const SEOAdminPanelInner = ({ activationParam, updateActivationParam, keyboardShortcut, updateShortcut }) => {
    const location = useLocation();
    // derived state for isActivated is handled by parent wrapper

    const {
        isAdminOpen,
        setIsAdminOpen,
        pages,
        site,
        updatePageConfig,
        updateSiteConfig,
        exportConfig,
        // GitHub integration
        githubSettings,
        updateGitHubSettings,
        testGitHubConnection,
        saveToGitHub,
        saveStatus,
        isGitHubConfigured,
    } = useSEOContext();

    const [currentPath, setCurrentPath] = useState(location.pathname);
    const [editData, setEditData] = useState({});
    const [activeTab, setActiveTab] = useState('general');
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [keywordInput, setKeywordInput] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [githubTestResult, setGithubTestResult] = useState(null);

    const [domData, setDomData] = useState({ h1Count: 0, externalLinks: 0, internalLinks: 0, wordCount: 0 });

    // Authentication State
    const [adminPassword, setAdminPassword] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('gifts_corp_admin_password') || '';
        return '';
    });
    const [isAuthenticated, setIsAuthenticated] = useState(() => {
        if (typeof window !== 'undefined') return !localStorage.getItem('gifts_corp_admin_password');
        return true;
    });
    const [loginInput, setLoginInput] = useState('');
    const [loginError, setLoginError] = useState(false);

    const handleLogin = (e) => {
        e.preventDefault();
        if (loginInput === adminPassword) {
            setIsAuthenticated(true);
            setLoginError(false);
        } else {
            setLoginError(true);
        }
    };

    const handleUpdatePassword = (newPwd) => {
        if (newPwd) {
            localStorage.setItem('gifts_corp_admin_password', newPwd);
            setAdminPassword(newPwd);
            setIsAuthenticated(true);
        } else {
            localStorage.removeItem('gifts_corp_admin_password');
            setAdminPassword('');
            setIsAuthenticated(true);
        }
    };

    // Analyze DOM content
    useEffect(() => {
        const analyzeDOM = () => {
            const container = document.getElementById('site-content');
            if (!container) return; // Wait for mount

            const h1s = container.getElementsByTagName('h1');
            const links = container.getElementsByTagName('a');
            let external = 0;
            let internal = 0;

            Array.from(links).forEach(link => {
                if (link.hostname && link.hostname !== window.location.hostname) {
                    external++;
                } else if (link.getAttribute('href')?.startsWith('/') || link.hostname === window.location.hostname) {
                    internal++;
                }
            });

            // Rough word count of body (excluding scripts/styles/admin panel)
            const text = container.innerText;
            const wordCount = text.split(/\s+/).length;

            setDomData({
                h1Count: h1s.length,
                externalLinks: external,
                internalLinks: internal,
                wordCount
            });
        };

        // Run analysis on mount and path change, and set up mutation observer?
        // For simplicity, just run it now.
        const timeout = setTimeout(analyzeDOM, 1000); // Wait for render
        return () => clearTimeout(timeout);
    }, [location.pathname]);

    // Get current page config
    const pageConfig = pages?.[currentPath] || {};

    // SEO Data merging edits > config > defaults
    // SEO Data merging edits > config > defaults > document fallback
    const seoData = useMemo(() => ({
        title: editData.title ?? pageConfig?.title ?? document.title,
        description: editData.description ?? pageConfig?.description ?? '',
        focusKeyword: editData.focusKeyword ?? pageConfig?.focusKeyword ?? '',
        keywords: editData.keywords ?? pageConfig?.keywords ?? [],
        image: editData.image ?? pageConfig?.image ?? '',
        canonicalUrl: editData.canonicalUrl ?? pageConfig?.canonicalUrl ?? '',
        url: currentPath,
        domData: domData,
        content: document.getElementById('site-content')?.innerText || '' // Pass full text for content length check
    }), [editData, pageConfig, currentPath, domData]);

    const { score, issues, passed } = useSEOScore(seoData);
    const readability = useReadability(seoData.content);
    const linkSuggestions = useInternalLinks({ content: seoData.content, currentPath, pages });

    // Persist Score for Dashboard
    useEffect(() => {
        // Only trigger update if the score has actually changed from the stored one
        if (score !== undefined && pageConfig?.lastScore !== score) {
            const timer = setTimeout(() => {
                // Ensure we haven't unmounted or changed path before updating
                updatePageConfig(currentPath, { lastScore: score });
            }, 2000); // 2s debounce for score persistence
            return () => clearTimeout(timer);
        }
    }, [score, currentPath, updatePageConfig, pageConfig?.lastScore]);

    // Update current path when location changes
    useEffect(() => {
        setCurrentPath(location.pathname);
        setEditData({});
        setKeywordInput('');
    }, [location.pathname]);

    // Handle standard input changes
    const handleChange = (field, value) => {
        setEditData((prev) => ({ ...prev, [field]: value }));
    };

    // Handle Keyword Tag Input
    const handleKeywordKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const newKeyword = keywordInput.trim();
            if (newKeyword) {
                const currentKeywords = seoData.keywords;
                if (!currentKeywords.includes(newKeyword)) {
                    handleChange('keywords', [...currentKeywords, newKeyword]);
                }
                setKeywordInput('');
            }
        }
    };

    const removeKeyword = (keywordToRemove) => {
        const currentKeywords = seoData.keywords;
        handleChange('keywords', currentKeywords.filter(k => k !== keywordToRemove));
    };

    // Save changes
    const handleSave = () => {
        const siteUpdates = {};
        const pageUpdates = {};

        Object.entries(editData).forEach(([key, value]) => {
            if (value !== undefined) {
                if (key === 'openaiApiKey' || key === 'googleAnalyticsId') {
                    siteUpdates[key] = value;
                } else {
                    pageUpdates[key] = value;
                }
            }
        });

        if (Object.keys(siteUpdates).length > 0) {
            updateSiteConfig(siteUpdates);
        }

        if (Object.keys(pageUpdates).length > 0) {
            updatePageConfig(currentPath, pageUpdates);
        }

        setEditData({});
    };

    const handleExport = () => {
        navigator.clipboard.writeText(exportConfig());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const [loadingField, setLoadingField] = useState(null); // 'title', 'description', 'image'

    // Handle AI Generation
    const handleGenerate = async (field) => {
        if (!site.openaiApiKey) {
            alert('Please add your OpenAI API Key in Settings > Global Settings first.');
            setActiveTab('settings');
            return;
        }

        setLoadingField(field);
        try {
            console.log('Generating for:', field);
            console.log('Key:', site.openaiApiKey ? 'Found' : 'Missing');

            let result = '';
            // Ensure content is string
            const content = String(seoData.content || seoData.title || '');
            const keywords = seoData.keywords || [];

            console.log('Content len:', content.length);

            if (field === 'title') {
                result = await generateSEOTitle(site.openaiApiKey, content, keywords);
                console.log('AI Title Result:', result);
                if (!result) alert('AI returned empty title');
                handleChange('title', result);
            } else if (field === 'description') {
                result = await generateSEODescription(site.openaiApiKey, content, keywords);
                console.log('AI Description Result:', result);
                if (!result) alert('AI returned empty description');
                handleChange('description', result);
            } else if (field === 'image') {
                const topic = seoData.title || seoData.focusKeyword || 'Abstract Technology';
                result = await generateSEOImage(site.openaiApiKey, topic);
                console.log('AI Image Result:', result);
                handleChange('image', result);
            }
        } catch (error) {
            console.error('AI Gen Error:', error);
            alert(`Generation failed: ${error.message}`);
        } finally {
            setLoadingField(null);
        }
    };

    const getScoreColor = (s) => {
        if (s >= 80) return 'text-green-500 border-green-500';
        if (s >= 50) return 'text-amber-500 border-amber-500';
        return 'text-red-500 border-red-500';
    };

    const getScoreBg = (s) => {
        if (s >= 80) return 'bg-green-500';
        if (s >= 50) return 'bg-amber-500';
        return 'bg-red-500';
    };

    if (!isAdminOpen) {
        return (
            <button
                onClick={() => setIsAdminOpen(true)}
                className="fixed bottom-4 right-4 z-[9999] bg-gray-900 text-white p-3 rounded-full shadow-lg border border-gray-700 hover:scale-110 transition-transform group"
                title="Open SEO Panel"
            >
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold bg-gray-800 border-2 border-gray-900 z-10 group-hover:scale-110 transition-transform">
                    <span className={getScoreColor(score).split(' ')[0]}>{score}</span>
                </div>
                <Settings size={20} className="text-gray-400 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
            </button>
        );
    }

    // Login Screen
    if (!isAuthenticated) {
        return (
            <div className="fixed right-0 top-0 bottom-0 w-[450px] bg-[#1e1e2d] border-l border-gray-800 z-[9999] flex flex-col shadow-2xl p-8 justify-center animate-in slide-in-from-right-10 duration-300">
                <button
                    onClick={() => setIsAdminOpen(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white"
                >
                    <X size={20} />
                </button>

                <div className="text-center space-y-6">
                    <div className="bg-blue-600/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-blue-500 mb-4 ring-4 ring-blue-500/10">
                        <KeyRound size={32} />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-bold text-white">Admin Access</h2>
                        <p className="text-gray-400 text-sm">This panel is password protected.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <input
                                type="password"
                                value={loginInput}
                                onChange={(e) => { setLoginInput(e.target.value); setLoginError(false); }}
                                className={`w-full bg-[#151521] border ${loginError ? 'border-red-500' : 'border-gray-700'} rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors text-center tracking-widest`}
                                placeholder="Enter Password"
                                autoFocus
                            />
                            {loginError && <p className="text-red-400 text-xs animate-shake">Incorrect password</p>}
                        </div>

                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-lg transition-all shadow-lg shadow-blue-500/20"
                        >
                            Unlock Panel
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`fixed right-0 top-0 bottom-0 bg-[#1e1e2d] border-l border-gray-800 z-[9999] flex flex-col shadow-2xl transition-all duration-300 ease-in-out ${isExpanded ? 'w-[450px]' : 'w-16'}`}
        >
            {/* Header / Sidebar Control */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-[#1b1b29]">
                {isExpanded ? (
                    <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg border-4 ${getScoreColor(score)}`}>
                            {score}
                        </div>
                        <div>
                            <h2 className="text-white font-semibold text-sm">SEO Score</h2>
                            <p className="text-gray-500 text-xs truncate max-w-[200px]">{currentPath}</p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-4 w-full">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 ${getScoreColor(score)}`}>
                            {score}
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`p-1.5 rounded hover:bg-gray-800 transition-colors ${activeTab === 'settings' ? 'text-blue-400' : 'text-gray-500 hover:text-white'}`}
                        title="Global Settings"
                    >
                        <Settings size={16} />
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 text-gray-500 hover:text-white rounded hover:bg-gray-800 transition-colors"
                        title={isExpanded ? "Collapse" : "Expand"}
                    >
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    {isExpanded && (
                        <button
                            onClick={() => setIsAdminOpen(false)}
                            className="p-1.5 text-gray-500 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>

            {/* If collapsed, show vertical tabs only */}
            {!isExpanded && (
                <div className="flex flex-col items-center gap-4 mt-4 px-2">
                    <button onClick={() => { setIsExpanded(true); setActiveTab('general'); }} title="General" className={`p-2 rounded-lg transition-colors ${activeTab === 'general' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                        <Settings size={20} />
                    </button>
                    <button onClick={() => { setIsExpanded(true); setActiveTab('preview'); }} title="Preview" className={`p-2 rounded-lg transition-colors ${activeTab === 'preview' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                        <Eye size={20} />
                    </button>
                    <button onClick={() => { setIsExpanded(true); setActiveTab('redirects'); }} title="Redirects" className={`p-2 rounded-lg transition-colors ${activeTab === 'redirects' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                        <Repeat size={20} />
                    </button>
                    <button onClick={() => { setIsExpanded(true); setActiveTab('404'); }} title="404 Monitor" className={`p-2 rounded-lg transition-colors ${activeTab === '404' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                        <AlertTriangle size={20} />
                    </button>
                    <button onClick={() => { setIsExpanded(true); setActiveTab('analytics'); }} title="Analytics" className={`p-2 rounded-lg transition-colors ${activeTab === 'analytics' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'}`}>
                        <BarChart size={20} />
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            {isExpanded && (
                <>
                    {/* Tabs */}
                    <div className="flex border-b border-gray-800 px-4 gap-4 text-xs font-medium bg-[#1e1e2d]">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`py-3 transition-colors relative ${activeTab === 'general' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            General
                            {activeTab === 'general' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('preview')}
                            className={`py-3 transition-colors relative ${activeTab === 'preview' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Preview
                            {activeTab === 'preview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('redirects')}
                            className={`py-3 transition-colors relative ${activeTab === 'redirects' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Redirects
                            {activeTab === 'redirects' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('404')}
                            className={`py-3 transition-colors relative ${activeTab === '404' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            404 Monitor
                            {activeTab === '404' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`py-3 transition-colors relative ${activeTab === 'analytics' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            Analytics
                            {activeTab === 'analytics' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400 rounded-t-full" />}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                        {activeTab === 'general' && (
                            <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Basic SEO */}
                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Page Title</label>
                                            <span className={`text-xs ${(editData.title ?? pageConfig.title ?? '').length > 60 ? 'text-red-500' : 'text-gray-500'}`}>
                                                {(editData.title ?? pageConfig.title ?? '').length}/60 px
                                            </span>
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={editData.title ?? pageConfig.title ?? ''}
                                                onChange={(e) => handleChange('title', e.target.value)}
                                                className="w-full bg-[#151521] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                                                placeholder="Page Title"
                                            />
                                            <button
                                                onClick={() => handleGenerate('title')}
                                                disabled={loadingField === 'title'}
                                                className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 rounded-md px-3 flex items-center justify-center transition-colors disabled:opacity-50"
                                                title="Auto-generate with AI"
                                            >
                                                {loadingField === 'title' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <div className="flex justify-between">
                                            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Description</label>
                                            <span className={`text-xs ${(editData.description ?? pageConfig.description ?? '').length > 160 ? 'text-red-500' : 'text-gray-500'}`}>
                                                {(editData.description ?? pageConfig.description ?? '').length}/160 px
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <textarea
                                                rows={4}
                                                value={editData.description ?? pageConfig.description ?? ''}
                                                onChange={(e) => handleChange('description', e.target.value)}
                                                className="w-full bg-[#151521] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors resize-none pr-10"
                                                placeholder="Write a compelling meta description..."
                                            />
                                            <button
                                                onClick={() => handleGenerate('description')}
                                                disabled={loadingField === 'description'}
                                                className="absolute right-2 top-2 bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 rounded-md p-1.5 flex items-center justify-center transition-colors disabled:opacity-50 settings-generate-btn"
                                                title="Auto-generate with AI"
                                            >
                                                {loadingField === 'description' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Focus Keyword</label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md px-2 py-2 min-h-[42px] flex flex-wrap gap-2 focus-within:border-blue-500/50 transition-colors relative">
                                            {/* Tag if exists */}
                                            {(editData.focusKeyword ?? pageConfig.focusKeyword) ? (
                                                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-500 px-2 py-1 rounded text-xs font-medium group w-full justify-between">
                                                    {editData.focusKeyword ?? pageConfig.focusKeyword}
                                                    <button
                                                        onClick={() => handleChange('focusKeyword', '')}
                                                        className="hover:text-amber-300 transition-colors bg-amber-500/20 rounded-full p-0.5"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ) : (
                                                <>
                                                    <Search className="absolute left-3 top-3 text-gray-600 w-4 h-4 pointer-events-none" />
                                                    <input
                                                        type="text"
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const val = e.currentTarget.value.trim();
                                                                if (val) {
                                                                    handleChange('focusKeyword', val);
                                                                    e.currentTarget.value = '';
                                                                }
                                                            }
                                                        }}
                                                        className="w-full bg-transparent pl-8 pr-3 text-sm text-gray-200 focus:outline-none"
                                                        placeholder="Add focus keyword + Enter"
                                                    />
                                                </>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-gray-500">Only 1 focus keyword allowed</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Keywords</label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md px-2 py-2 min-h-[42px] flex flex-wrap gap-2 focus-within:border-blue-500/50 transition-colors">
                                            {seoData.keywords.map((k, i) => (
                                                <span key={i} className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-medium group">
                                                    {k}
                                                    <button onClick={() => removeKeyword(k)} className="hover:text-red-400 transition-colors"><X size={12} /></button>
                                                </span>
                                            ))}
                                            <input
                                                type="text"
                                                value={keywordInput}
                                                onChange={(e) => setKeywordInput(e.target.value)}
                                                onKeyDown={handleKeywordKeyDown}
                                                className="bg-transparent text-sm text-gray-200 focus:outline-none flex-1 min-w-[120px]"
                                                placeholder="Add keyword + Enter"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500">Press Enter or comma to add a tag</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">OG Image URL</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={editData.image ?? pageConfig.image ?? ''}
                                                onChange={(e) => handleChange('image', e.target.value)}
                                                className="w-full bg-[#151521] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                                                placeholder="https://..."
                                            />
                                            <button
                                                onClick={() => handleGenerate('image')}
                                                disabled={loadingField === 'image'}
                                                className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 rounded-md px-3 flex items-center justify-center transition-colors disabled:opacity-50"
                                                title="Generate Image with DALL-E"
                                            >
                                                {loadingField === 'image' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Canonical URL</label>
                                        <div className="relative">
                                            <Link className="absolute left-3 top-2.5 text-gray-600 w-4 h-4" size={14} />
                                            <input
                                                type="text"
                                                value={editData.canonicalUrl ?? pageConfig.canonicalUrl ?? ''}
                                                onChange={(e) => handleChange('canonicalUrl', e.target.value)}
                                                disabled={currentPath === '/'}
                                                className={`w-full bg-[#151521] border border-gray-800 rounded-md pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors ${currentPath === '/' ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                placeholder={currentPath === '/' ? 'Homepage (Default)' : window.location.origin + currentPath}
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-500">
                                            {currentPath === '/'
                                                ? 'Canonical URL is set to default for the homepage.'
                                                : 'Usage: To change the page slug, you must modify the route code. This field sets `rel="canonical"`.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Analysis */}
                                <div className="space-y-3 pt-4 border-t border-gray-800">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Monitor size={16} className="text-blue-400" />
                                        Content Analysis
                                    </h3>

                                    <div className="space-y-2">
                                        {issues.map(issue => (
                                            <div key={issue.id} className="flex gap-3 bg-red-500/5 p-3 rounded-md border border-red-500/10">
                                                <X size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs text-red-200">{issue.message}</p>
                                                </div>
                                            </div>
                                        ))}

                                        {passed.map(item => (
                                            <div key={item.id} className="flex gap-3 bg-green-500/5 p-3 rounded-md border border-green-500/10">
                                                <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                                                <p className="text-xs text-gray-300">{item.name}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Readability Analysis */}
                                <div className="space-y-3 pt-4 border-t border-gray-800">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-purple-400" />
                                        Readability
                                    </h3>

                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div className="bg-[#151521] p-2 rounded border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase">Score</div>
                                            <div className={`text-xl font-bold ${readability.score >= 60 ? 'text-green-400' : 'text-amber-400'}`}>
                                                {readability.score}
                                            </div>
                                            <div className="text-[10px] text-gray-400">{readability.readabilityLabel}</div>
                                        </div>
                                        <div className="bg-[#151521] p-2 rounded border border-gray-800">
                                            <div className="text-[10px] text-gray-500 uppercase">Est. Grade</div>
                                            <div className="text-xl font-bold text-gray-200">
                                                {readability.grade}
                                            </div>
                                            <div className="text-[10px] text-gray-400">Education Level</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {readability.issues.map((issue, idx) => (
                                            <div key={idx} className={`flex gap-3 p-3 rounded-md border ${issue.type === 'critical' ? 'bg-red-500/5 border-red-500/10' : 'bg-amber-500/5 border-amber-500/10'}`}>
                                                <AlertTriangle size={16} className={issue.type === 'critical' ? 'text-red-500' : 'text-amber-500'} />
                                                <p className={`text-xs ${issue.type === 'critical' ? 'text-red-200' : 'text-amber-200'}`}>{issue.message}</p>
                                            </div>
                                        ))}
                                        {readability.issues.length === 0 && (
                                            <div className="flex gap-3 bg-green-500/5 p-3 rounded-md border border-green-500/10">
                                                <CheckCircle size={16} className="text-green-500" />
                                                <p className="text-xs text-gray-300">Content is easy to read and clear.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Link Suggestions */}
                                <div className="space-y-3 pt-4 border-t border-gray-800">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Repeat size={16} className="text-blue-400" />
                                        Internal Linking
                                    </h3>

                                    {/* Orphan Check */}
                                    {domData.internalLinks === 0 && (
                                        <div className="flex gap-3 bg-amber-500/5 p-3 rounded-md border border-amber-500/10 mb-2">
                                            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-xs text-amber-200 font-medium">Orphan Page Warning</p>
                                                <p className="text-[10px] text-amber-200/70">This page has no internal links pointing to other pages. Add some links to improve crawlability.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Suggested Links</p>
                                        {linkSuggestions.length === 0 ? (
                                            <p className="text-xs text-gray-600 italic">No suggestions found based on content.</p>
                                        ) : (
                                            linkSuggestions.map((suggestion, idx) => (
                                                <div key={idx} className="bg-[#151521] p-2 rounded border border-gray-800 flex justify-between items-center group">
                                                    <div>
                                                        <div className="text-xs text-gray-300 font-medium">{suggestion.title}</div>
                                                        <div className="text-[10px] text-gray-500">{suggestion.reason}</div>
                                                    </div>
                                                    <button
                                                        className="text-gray-500 hover:text-blue-400 p-1 rounded hover:bg-blue-400/10 transition-colors"
                                                        title="Copy Link"
                                                        onClick={() => navigator.clipboard.writeText(suggestion.path)}
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'preview' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                {/* Google SERP */}
                                <div>
                                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Google Search Result</h3>
                                    <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 font-sans">
                                        <div className="flex items-center gap-2 mb-1">
                                            <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center p-1">
                                                <img src="/bee.svg" alt="Icon" className="w-full h-full opacity-50" onError={(e) => e.target.style.display = 'none'} />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-800 leading-tight">Gifts Corporate</span>
                                                <span className="text-[10px] text-gray-500 leading-tight">{site.siteUrl}{currentPath}</span>
                                            </div>
                                        </div>
                                        <h3 className="text-[#1a0dab] text-lg hover:underline cursor-pointer truncate font-medium">
                                            {site.titleTemplate.replace('%s', seoData.title || 'Page Title')}
                                        </h3>
                                        <p className="text-[#4d5156] text-sm line-clamp-2 mt-1">
                                            {seoData.description || 'Add a meta description to see how it looks in Google search results.'}
                                        </p>
                                    </div>
                                </div>

                                {/* Facebook / Social */}
                                <div>
                                    <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Facebook / Social</h3>
                                    <div className="bg-[#f0f2f5] rounded-lg overflow-hidden border border-gray-300 font-sans shadow-sm">
                                        <div className="aspect-[1.91/1] bg-gray-200 relative overflow-hidden group">
                                            {seoData.image ? (
                                                <img
                                                    src={seoData.image.startsWith('http') ? seoData.image : seoData.image}
                                                    className="w-full h-full object-cover"
                                                    alt="Preview"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center w-full h-full text-gray-400">
                                                    <Monitor size={48} opacity={0.5} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 bg-[#f0f2f5] border-t border-gray-300/50">
                                            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{site.siteUrl.replace('https://', '').split('/')[0]}</p>
                                            <h3 className="text-gray-900 font-bold text-sm truncate mb-0.5">
                                                {site.titleTemplate.replace('%s', seoData.title || 'Page Title')}
                                            </h3>
                                            <p className="text-gray-600 text-xs line-clamp-1">
                                                {seoData.description || 'Description preview...'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'redirects' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <RedirectManager />
                            </div>
                        )}

                        {activeTab === '404' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <FourOhFourMonitor />
                            </div>
                        )}

                        {activeTab === 'analytics' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                <AnalyticsDashboard />
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-5">
                                <div className="space-y-3 pb-3 border-b border-gray-800">
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        <Settings size={16} className="text-gray-400" />
                                        Global Settings
                                    </h3>
                                    <p className="text-xs text-gray-500">Configuration that applies to the entire website.</p>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Admin Password</label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md p-3 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="password"
                                                    value={adminPassword}
                                                    onChange={(e) => handleUpdatePassword(e.target.value)}
                                                    className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600 font-mono"
                                                    placeholder="No password set"
                                                />
                                                <div className="flex items-center justify-center px-3 bg-[#1e1e2d] border border-gray-800 rounded text-gray-500">
                                                    <KeyRound size={14} />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-500">
                                                Set a password to prevent unauthorized access on the live site.
                                                <span className="block text-blue-400 mt-1">Changes are <strong>auto-saved</strong> to this browser. Clearing cache removes it.</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">OpenAI (ChatGPT) API Key</label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md p-3 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="password"
                                                    value={editData.openaiApiKey !== undefined ? editData.openaiApiKey : site.openaiApiKey || ''}
                                                    onChange={(e) => handleChange('openaiApiKey', e.target.value.trim())}
                                                    className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                    placeholder="sk-..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        const key = editData.openaiApiKey || site.openaiApiKey;
                                                        if (!key) {
                                                            setTestResult({ type: 'error', message: 'Enter API Key first' });
                                                            return;
                                                        }

                                                        setTestResult({ type: 'info', message: 'Testing...' });
                                                        console.log('Testing API Key:', key.substring(0, 8) + '...');

                                                        try {
                                                            const res = await generateSEOTitle(key, 'Test Content', ['test']);
                                                            console.log('Test Success:', res);
                                                            setTestResult({ type: 'success', message: 'Success! API is working.' });
                                                        } catch (err) {
                                                            console.error('Test Failed:', err);
                                                            let msg = err.message || 'Connection failed';
                                                            if (msg.includes('exceeded your current quota')) {
                                                                msg = 'Quota Exceeded. API usage is billed separately from ChatGPT Plus. Please add credits at platform.openai.com.';
                                                            }
                                                            setTestResult({ type: 'error', message: msg });
                                                        }
                                                    }}
                                                    className="px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md whitespace-nowrap"
                                                >
                                                    Test Key
                                                </button>
                                            </div>
                                            <p className="text-[10px] text-gray-500">
                                                Required for AI auto-generation features. Key is stored locally.
                                            </p>
                                            {testResult && (
                                                <div className={`text-xs p-2 rounded border mt-2 ${testResult.type === 'success' ? 'bg-green-900/20 border-green-900 text-green-400' : testResult.type === 'error' ? 'bg-red-900/20 border-red-900 text-red-400' : 'bg-blue-900/20 border-blue-900 text-blue-400'}`}>
                                                    <strong>{testResult.type === 'error' ? 'Error: ' : ''}</strong>
                                                    {testResult.message}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Google Analytics</label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md p-3 space-y-2">
                                            <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                    <div className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold">G-</div>
                                                    <input
                                                        type="text"
                                                        value={(editData.googleAnalyticsId !== undefined ? editData.googleAnalyticsId : site.googleAnalyticsId || '').replace('G-', '')}
                                                        onChange={(e) => handleChange('googleAnalyticsId', 'G-' + e.target.value.replace('G-', ''))}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md pl-8 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="XXXXXXXXXX"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-500">
                                                Enter your GA4 Measurement ID available in your Google Analytics Admin panel under Data Streams.
                                            </p>
                                        </div>
                                    </div>

                                    {/* GitHub Integration */}
                                    <div className="space-y-1.5 pt-4 border-t border-gray-800">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <Github size={14} />
                                            GitHub Integration
                                        </label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md p-3 space-y-3">
                                            <p className="text-[10px] text-gray-500">
                                                Save SEO config directly to your GitHub repository. Changes will automatically trigger a rebuild.
                                            </p>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-gray-500 mb-1 block">Owner</label>
                                                    <input
                                                        type="text"
                                                        value={githubSettings.owner}
                                                        onChange={(e) => updateGitHubSettings({ owner: e.target.value.trim() })}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="username"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-500 mb-1 block">Repository</label>
                                                    <input
                                                        type="text"
                                                        value={githubSettings.repo}
                                                        onChange={(e) => updateGitHubSettings({ repo: e.target.value.trim() })}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="repo-name"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] text-gray-500 mb-1 block">Personal Access Token</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="password"
                                                        value={githubSettings.token}
                                                        onChange={(e) => updateGitHubSettings({ token: e.target.value.trim() })}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="ghp_xxxxxxxxxxxx"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            setGithubTestResult({ type: 'info', message: 'Testing...' });
                                                            const result = await testGitHubConnection();
                                                            setGithubTestResult({
                                                                type: result.success ? 'success' : 'error',
                                                                message: result.message
                                                            });
                                                        }}
                                                        className="px-3 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium rounded-md whitespace-nowrap"
                                                    >
                                                        Test
                                                    </button>
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-1">
                                                    Create at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">github.com/settings/tokens</a> with "repo" scope.
                                                </p>
                                            </div>

                                            {githubTestResult && (
                                                <div className={`text-xs p-2 rounded border ${githubTestResult.type === 'success' ? 'bg-green-900/20 border-green-900 text-green-400' : githubTestResult.type === 'error' ? 'bg-red-900/20 border-red-900 text-red-400' : 'bg-blue-900/20 border-blue-900 text-blue-400'}`}>
                                                    {githubTestResult.type === 'success' && <CheckCircle size={12} className="inline mr-1" />}
                                                    {githubTestResult.type === 'error' && <AlertCircle size={12} className="inline mr-1" />}
                                                    {githubTestResult.message}
                                                </div>
                                            )}

                                            {isGitHubConfigured && (
                                                <div className="flex items-center gap-2 text-[10px] text-green-400 mt-2">
                                                    <CheckCircle size={12} />
                                                    GitHub configuration auto-saved to browser
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Activation Settings */}
                                    <div className="space-y-1.5 pt-4 border-t border-gray-800">
                                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <KeyRound size={14} />
                                            Panel Activation
                                        </label>
                                        <div className="bg-[#151521] border border-gray-800 rounded-md p-3 space-y-3">
                                            <p className="text-[10px] text-gray-500">
                                                In production, activate the panel via URL parameter or keyboard shortcut.
                                            </p>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-[10px] text-gray-500 mb-1 block">URL Parameter</label>
                                                    <input
                                                        type="text"
                                                        defaultValue={activationParam}
                                                        onBlur={(e) => updateActivationParam(e.target.value.trim())}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="seo-admin"
                                                    />
                                                    <p className="text-[9px] text-gray-600 mt-0.5">?{activationParam}</p>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-500 mb-1 block">Keyboard Shortcut</label>
                                                    <input
                                                        type="text"
                                                        defaultValue={keyboardShortcut}
                                                        onBlur={(e) => updateShortcut(e.target.value.trim().toLowerCase())}
                                                        className="w-full bg-[#0d0d15] border border-gray-800 rounded-md px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors placeholder-gray-600"
                                                        placeholder="ctrl+shift+s"
                                                    />
                                                    <p className="text-[9px] text-gray-600 mt-0.5">e.g. ctrl+shift+s</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                <CheckCircle size={12} className="text-green-400" />
                                                {import.meta.env.MODE === 'development'
                                                    ? 'Development mode - panel always visible'
                                                    : 'Production - use URL param or keyboard shortcut'}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 border-t border-gray-800 bg-[#1b1b29] space-y-3">
                        {/* Local Save Button - Always available */}
                        <button
                            onClick={handleSave}
                            disabled={Object.keys(editData).length === 0}
                            className={`w-full font-medium py-2 rounded-md transition-colors shadow-lg text-sm ${Object.keys(editData).length > 0 ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed shadow-none'}`}
                        >
                            {Object.keys(editData).length > 0 ? 'Save Changes' : 'No Changes'}
                        </button>

                        {/* Push to GitHub Button - Shows when GitHub is configured */}
                        {isGitHubConfigured && (
                            <button
                                onClick={async () => {
                                    await saveToGitHub();
                                }}
                                disabled={saveStatus.loading}
                                className={`w-full font-medium py-2.5 rounded-md transition-all shadow-lg text-sm flex items-center justify-center gap-2 ${saveStatus.loading
                                    ? 'bg-gray-700 text-gray-400 cursor-wait'
                                    : saveStatus.success
                                        ? 'bg-green-600 text-white shadow-green-500/20'
                                        : saveStatus.error
                                            ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/20'
                                            : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-500/20'
                                    }`}
                            >
                                {saveStatus.loading ? (
                                    <><Loader2 size={16} className="animate-spin" /> Pushing to GitHub...</>
                                ) : saveStatus.success ? (
                                    <><Check size={16} /> Pushed! Build will start...</>
                                ) : saveStatus.error ? (
                                    <><AlertCircle size={16} /> Error - Click to Retry</>
                                ) : (
                                    <><Github size={16} /> Push to GitHub</>
                                )}
                            </button>
                        )}

                        {/* Status feedback */}
                        {saveStatus.error && (
                            <div className="text-xs text-red-400 bg-red-900/20 border border-red-900 rounded p-2">
                                {saveStatus.error}
                            </div>
                        )}
                        {saveStatus.lastCommitUrl && (
                            <a
                                href={saveStatus.lastCommitUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                            >
                                <ExternalLink size={12} /> View commit on GitHub
                            </a>
                        )}

                        {/* Configure GitHub prompt */}
                        {!isGitHubConfigured && (
                            <button
                                onClick={() => setActiveTab('settings')}
                                className="w-full flex items-center justify-center gap-2 bg-[#2d2d3f] hover:bg-[#36364b] text-gray-300 py-2 rounded-md transition-colors text-xs font-medium border border-gray-700"
                            >
                                <Github size={14} />
                                Configure GitHub to enable cloud saves
                            </button>
                        )}

                        <button
                            onClick={handleExport}
                            className="w-full flex items-center justify-center gap-2 bg-[#2d2d3f] hover:bg-[#36364b] text-gray-300 py-2 rounded-md transition-colors text-xs font-medium border border-gray-700"
                        >
                            {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                            {copied ? 'Copied to Clipboard' : 'Export Full Config'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default function SEOAdminPanel({ activationParam: propActivationParam }) {
    const [searchParams] = useSearchParams();

    // Get activation settings from localStorage
    const [storedActivationParam] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('seo_activation_param') || 'seo-admin';
        }
        return 'seo-admin';
    });

    const [storedShortcut] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('seo_activation_shortcut') || 'ctrl+shift+s';
        }
        return 'ctrl+shift+s';
    });

    const activationParam = propActivationParam || storedActivationParam;
    const [keyboardShortcut, setKeyboardShortcut] = useState(storedShortcut);

    // Track if activated via keyboard shortcut
    const [keyboardActivated, setKeyboardActivated] = useState(false);

    // Keyboard shortcut listener
    useEffect(() => {
        if (import.meta.env.MODE === 'development') return; // Not needed in dev

        const handleKeyDown = (e) => {
            const shortcut = keyboardShortcut.toLowerCase();
            const keys = shortcut.split('+');

            const ctrlRequired = keys.includes('ctrl');
            const shiftRequired = keys.includes('shift');
            const altRequired = keys.includes('alt');
            const mainKey = keys.find(k => !['ctrl', 'shift', 'alt'].includes(k));

            if (
                (ctrlRequired === (e.ctrlKey || e.metaKey)) &&
                (shiftRequired === e.shiftKey) &&
                (altRequired === e.altKey) &&
                e.key.toLowerCase() === mainKey
            ) {
                e.preventDefault();
                setKeyboardActivated(true);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [keyboardShortcut]);

    // Check if panel should be activated
    const isActivated = useMemo(() => {
        // Never show on reports page
        if (typeof window !== 'undefined' && window.location.pathname === '/reports') {
            return false;
        }

        // Always show in development
        if (import.meta.env.MODE === 'development') {
            return true;
        }
        // In production, check for URL param OR keyboard activation
        return searchParams.has(activationParam) || keyboardActivated;
    }, [searchParams, activationParam, keyboardActivated]);

    // Save new activation param to localStorage
    const updateActivationParam = (newParam) => {
        if (typeof window !== 'undefined' && newParam) {
            localStorage.setItem('seo_activation_param', newParam);
        }
    };

    // Save new keyboard shortcut to localStorage
    const updateShortcut = (newShortcut) => {
        if (typeof window !== 'undefined' && newShortcut) {
            localStorage.setItem('seo_activation_shortcut', newShortcut);
            setKeyboardShortcut(newShortcut);
        }
    };

    if (!isActivated) {
        return null;
    }

    return (
        <SEOAdminPanelInner
            activationParam={activationParam}
            updateActivationParam={updateActivationParam}
            keyboardShortcut={keyboardShortcut}
            updateShortcut={updateShortcut}
        />
    );
};
