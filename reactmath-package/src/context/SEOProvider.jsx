import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import seoConfigData from '../seo.config.json';
import { saveConfigToGitHub, saveRedirectsToGitHub, testConnection } from '../utils/github';
import { supabase as defaultSupabase } from '../utils/supabase';

const SEOContext = createContext(null);

/**
 * SEOProvider
 * Provides global SEO state and configuration to the app.
 * Automatically synchronizes with LocalStorage, GitHub, and Supabase.
 * Pass supabase prop to use your app's client (connects on any domain).
 */
export const SEOProvider = ({ children, supabase: supabaseProp }) => {
    const supabase = supabaseProp ?? defaultSupabase;
    // 1. Domain Logic FIRST (needed for keys)
    const [linkedDomain, setLinkedDomainState] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('MathSEO_Linked_Domain') || null;
        }
        return null;
    });

    const currentDomain = useMemo(() => {
        if (linkedDomain) return linkedDomain;
        // Use VITE_SEO_DOMAIN for preview/staging (e.g. 4mpadel.vercel.app) to share SEO data with production
        const envDomain = import.meta.env.VITE_SEO_DOMAIN;
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                const projectName = import.meta.env.VITE_PROJECT_NAME;
                return projectName ? `${projectName}.local` : 'localhost';
            }
            // If on Vercel preview / staging and VITE_SEO_DOMAIN is set, use it for Supabase lookup
            if (envDomain && (hostname.includes('vercel.app') || hostname.includes('netlify.app') || hostname.includes('preview'))) {
                return envDomain;
            }
            return hostname;
        }
        return envDomain || 'localhost';
    }, [linkedDomain]);

    // 2. Storage Keys SECOND
    const STORAGE_KEY = useMemo(() => `MathSEO_Config_${currentDomain.replace(/\./g, '_')}`, [currentDomain]);
    const GITHUB_KEY = useMemo(() => `MathSEO_GitHub_${currentDomain.replace(/\./g, '_')}`, [currentDomain]);

    // 3. SEO State THIRD
    const [config, setConfig] = useState(() => {
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const projectName = import.meta.env.VITE_PROJECT_NAME || 'default';
            const resolveKey = (hostname === 'localhost' || hostname === '127.0.0.1')
                ? `MathSEO_Config_${projectName}_local`
                : `MathSEO_Config_${hostname.replace(/\./g, '_')}`;

            const stored = localStorage.getItem(resolveKey);
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored SEO config', e);
                }
            }
        }
        return seoConfigData;
    });

    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

    // GitHub settings state
    const [githubSettings, setGithubSettings] = useState(() => {
        const defaults = { owner: 'burkcorp', repo: '4mpadel', token: '' };
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(GITHUB_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    return { ...defaults, ...parsed };
                } catch (e) {
                    console.error('Failed to parse GitHub settings', e);
                }
            }
        }
        return defaults;
    });

    // Save status for UI feedback
    const [saveStatus, setSaveStatus] = useState({
        loading: false,
        success: false,
        error: null,
        lastCommitUrl: null
    });

    // --- EFFECT: Load from Supabase on start ---
    useEffect(() => {
        const loadFromSupabase = async () => {
            if (!supabase) return;
            console.log('🔍 Checking Supabase for domain:', currentDomain);

            try {
                const { data: siteData } = await supabase
                    .from('seo_sites')
                    .select('settings')
                    .eq('domain', currentDomain)
                    .single();

                const { data: pagesData } = await supabase
                    .from('seo_pages')
                    .select('path, seo_data')
                    .eq('domain', currentDomain);

                if (siteData || pagesData) {
                    setIsSupabaseConnected(true);
                    console.log('✅ Found live data for:', currentDomain);
                    setConfig(prev => {
                        const newPages = { ...prev.pages };
                        if (pagesData) {
                            pagesData.forEach(p => {
                                // IMPORTANT: Default to empty object if data is null/undefined
                                newPages[p.path] = p.seo_data || {};
                            });
                        }
                        const newSite = siteData?.settings ? { ...prev.site, ...siteData.settings } : prev.site;
                        return { ...prev, site: newSite, pages: newPages };
                    });
                } else {
                    console.log('ℹ️ No data found in Supabase for this domain yet.');
                }
            } catch (err) {
                console.error('Supabase connection failed:', err);
            }
        };

        loadFromSupabase();
    }, [currentDomain]);

    // --- EFFECT: LocalStorage Persistence ---
    useEffect(() => {
        if (typeof window !== 'undefined' && STORAGE_KEY) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
        }
    }, [config, STORAGE_KEY]);

    useEffect(() => {
        if (typeof window !== 'undefined' && GITHUB_KEY) {
            localStorage.setItem(GITHUB_KEY, JSON.stringify(githubSettings));
        }
    }, [githubSettings, GITHUB_KEY]);

    const setLinkedDomain = useCallback((domain) => {
        if (domain) {
            localStorage.setItem('MathSEO_Linked_Domain', domain);
        } else {
            localStorage.removeItem('MathSEO_Linked_Domain');
        }
        setLinkedDomainState(domain);
    }, []);

    const updateGitHubSettings = useCallback((updates) => {
        setGithubSettings(prev => ({ ...prev, ...updates }));
    }, []);

    const testGitHubConnection = useCallback(async () => {
        const { owner, repo, token } = githubSettings;
        if (!token) return { success: false, message: 'Please enter a GitHub token' };
        return await testConnection(owner, repo, token);
    }, [githubSettings]);

    const saveToGitHub = useCallback(async () => {
        if (!githubSettings.token) {
            setSaveStatus({ loading: false, success: false, error: 'GitHub token not configured', lastCommitUrl: null });
            return { success: false, error: 'GitHub token not configured' };
        }
        setSaveStatus({ loading: true, success: false, error: null, lastCommitUrl: null });
        try {
            const result = await saveConfigToGitHub(config, githubSettings);
            if (result.success) {
                setSaveStatus({ loading: false, success: true, error: null, lastCommitUrl: result.commitUrl });
                setTimeout(() => setSaveStatus(prev => ({ ...prev, success: false })), 5000);
                return result;
            } else {
                setSaveStatus({ loading: false, success: false, error: result.error, lastCommitUrl: null });
                return result;
            }
        } catch (err) {
            const error = err.message || 'Failed to save to GitHub';
            setSaveStatus({ loading: false, success: false, error, lastCommitUrl: null });
            return { success: false, error };
        }
    }, [config, githubSettings]);

    const saveRedirectsToGH = useCallback(async (redirects) => {
        if (!githubSettings.token) return { success: false, error: 'GitHub token not configured' };
        try {
            return await saveRedirectsToGitHub(redirects, githubSettings);
        } catch (err) {
            return { success: false, error: err.message };
        }
    }, [githubSettings]);

    const updateSiteConfig = useCallback((updates) => {
        setConfig((prev) => {
            const newSite = { ...prev.site, ...updates };
            if (isSupabaseConnected && supabase) {
                supabase.from('seo_sites')
                    .upsert({ domain: currentDomain, settings: newSite }, { onConflict: 'domain' })
                    .then(({ error }) => {
                        if (error) console.error('Supabase Site Sync Error:', error);
                    });
            }
            return { ...prev, site: newSite };
        });
    }, [isSupabaseConnected, currentDomain]);

    const updatePageConfig = useCallback((path, updates) => {
        setConfig((prev) => {
            const oldPageConf = prev.pages[path] || {};
            const newPageConf = { ...oldPageConf, ...updates };
            if (isSupabaseConnected && supabase) {
                supabase.from('seo_pages')
                    .upsert({
                        domain: currentDomain,
                        path: path,
                        seo_data: newPageConf
                    }, { onConflict: 'domain,path' })
                    .then(({ error }) => {
                        if (error) console.error(`Supabase Page Sync Error (${path}):`, error);
                    });
            }
            return {
                ...prev,
                pages: { ...prev.pages, [path]: newPageConf },
            };
        });
    }, [isSupabaseConnected, currentDomain]);

    const getPageConfig = useCallback((path) => {
        const pageConfig = config.pages[path];
        return {
            ...config.defaults,
            ...pageConfig,
            site: config.site,
        };
    }, [config]);

    const toggleAdmin = useCallback(() => {
        setIsAdminOpen((prev) => !prev);
    }, []);

    const exportConfig = useCallback(() => {
        return JSON.stringify(config, null, 2);
    }, [config]);

    const isGitHubConfigured = Boolean(githubSettings.token && githubSettings.owner && githubSettings.repo);

    const value = {
        config,
        site: config.site,
        pages: config.pages,
        defaults: config.defaults,
        organization: config.organization,
        updateSiteConfig,
        updatePageConfig,
        getPageConfig,
        isAdminOpen,
        toggleAdmin,
        setIsAdminOpen,
        exportConfig,
        githubSettings,
        updateGitHubSettings,
        testGitHubConnection,
        saveToGitHub,
        saveRedirectsToGH,
        saveStatus,
        isGitHubConfigured,
        isSupabaseConnected,
        linkedDomain,
        setLinkedDomain,
        currentDomain,
    };

    return (
        <SEOContext.Provider value={value}>
            {children}
        </SEOContext.Provider>
    );
};

export const useSEOContext = () => {
    const context = useContext(SEOContext);
    if (!context) throw new Error('useSEOContext must be used within a SEOProvider');
    return context;
};

export default SEOProvider;
