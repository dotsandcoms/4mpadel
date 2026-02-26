import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    BarChart3,
    Target,
    Type,
    MapPin,
    Search,
    Calendar,
    HelpCircle,
    ArrowUpRight,
    ArrowDownRight,
    ChevronDown,
    FileText,
    Link as LinkIcon,
    ExternalLink,
    PieChart,
    MoreHorizontal,
    TrendingUp,
    AlertCircle
} from 'lucide-react';
import { useSEOContext } from '../context/SEOProvider';

const ReportsDashboard = () => {
    const { pages, site } = useSEOContext();
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [searchTerm, setSearchTerm] = useState('');

    // --- REAL DATA CALCULATION ---
    const pageList = useMemo(() => {
        return Object.entries(pages || {})
            .filter(([path]) => path !== '/reports')
            .map(([path, config]) => {
                const conf = config || {};
                // Calculate SEO Score based on live metadata
                let score = conf.lastScore || 0;
                if (!conf.lastScore) {
                    // Realistic scan estimation
                    if (conf.title) {
                        score += 10;
                        if (conf.title.length >= 30 && conf.title.length <= 60) score += 20;
                    }
                    if (conf.description) {
                        score += 10;
                        if (conf.description.length >= 120 && conf.description.length <= 160) score += 20;
                    }
                    if (conf.focusKeyword) {
                        score += 10;
                        if (conf.title?.toLowerCase().includes(conf.focusKeyword.toLowerCase())) score += 5;
                        if (conf.description?.toLowerCase().includes(conf.focusKeyword.toLowerCase())) score += 5;
                    }
                    if (conf.image) score += 20;
                }

                // Get tracked keywords for this page
                const focusKeyword = conf.focusKeyword || '';

                return {
                    path,
                    config: conf,
                    score,
                    focusKeyword,
                    // These will be 0/null until Google API is connected
                    traffic: conf.liveTraffic || 0,
                    impressions: conf.liveImpressions || 0,
                    avgPosition: conf.livePosition || 0,
                    clicks: conf.liveClicks || 0,
                    ctr: conf.liveCtr || 0,
                    links: {
                        internal: conf.internalLinks || 0,
                        external: conf.externalLinks || 0
                    }
                };
            })
            .filter(p =>
                p.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.config.title && p.config.title.toLowerCase().includes(searchTerm.toLowerCase()))
            );
    }, [pages, searchTerm]);

    const stats = useMemo(() => {
        const total = pageList.length;
        const withData = pageList.filter(p => p.score > 0);
        return {
            total,
            good: pageList.filter(p => p.score >= 80).length,
            fair: pageList.filter(p => p.score >= 50 && p.score < 80).length,
            poor: pageList.filter(p => p.score < 50 && p.score > 0).length,
            noData: pageList.filter(p => p.score === 0).length,
            average: withData.length > 0 ? Math.round(withData.reduce((acc, p) => acc + p.score, 0) / withData.length) : 0,

            // Search aggregates
            totalTraffic: pageList.reduce((acc, p) => acc + p.traffic, 0),
            totalImpressions: pageList.reduce((acc, p) => acc + p.impressions, 0),
            totalClicks: pageList.reduce((acc, p) => acc + p.clicks, 0),
            avgPosition: pageList.length > 0 ? (pageList.reduce((acc, p) => acc + p.avgPosition, 0) / pageList.length).toFixed(1) : '—',
            ctr: pageList.length > 0 ? (pageList.reduce((acc, p) => acc + p.ctr, 0) / pageList.length).toFixed(2) : '—'
        };
    }, [pageList]);

    const tabs = [
        { name: 'Dashboard', icon: LayoutDashboard },
        { name: 'Site Analytics', icon: BarChart3 },
        { name: 'SEO Performance', icon: Target },
        { name: 'Keywords', icon: Type },
        { name: 'Rank Tracker', icon: MapPin },
        { name: 'Index Status', icon: PieChart },
    ];

    return (
        <div className="min-h-screen bg-[#f1f3f6] text-[#4a5568] font-sans pb-12 pt-20">
            <div className="max-w-[1400px] mx-auto px-6">

                {/* Header Section */}
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        <span>DASHBOARD</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-gray-600">{activeTab.toUpperCase()}</span>
                    </div>
                    <div className="text-right text-[11px] text-gray-400">
                        Last updated<br />
                        <span className="text-gray-600 font-medium">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-8">
                    {tabs.map((tab) => (
                        <button
                            key={tab.name}
                            onClick={() => setActiveTab(tab.name)}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all relative ${activeTab === tab.name ? 'text-blue-600 bg-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50'
                                }`}
                        >
                            <tab.icon size={18} className={activeTab === tab.name ? 'text-blue-600' : 'text-gray-400'} />
                            {tab.name}
                            {activeTab === tab.name && (
                                <motion.div layoutId="activeTabOutline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-600" />
                            )}
                        </button>
                    ))}
                </div>

                {/* View Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'Dashboard' && <DashboardView stats={stats} pageList={pageList} setActiveTab={setActiveTab} />}
                        {activeTab === 'Site Analytics' && <SiteAnalyticsView stats={stats} pageList={pageList} />}
                        {activeTab === 'SEO Performance' && <SEOPerformanceView stats={stats} pageList={pageList} />}
                        {activeTab === 'Keywords' && <KeywordsView stats={stats} pageList={pageList} />}
                        {activeTab === 'Rank Tracker' && <RankTrackerView stats={stats} pageList={pageList} />}
                        {activeTab === 'Index Status' && <IndexStatusView />}
                    </motion.div>
                </AnimatePresence>

                {/* Professional Footer */}
                <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                    <div className="flex items-center gap-2">
                        {site.name || 'Site Analytics'} &copy; {new Date().getFullYear()}
                    </div>
                    <div className="flex items-center gap-1">
                        Developed by{' '}
                        <a
                            href="https://www.digi-hive.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-600 transition-colors"
                        >
                            Digi Hive Developers
                        </a>
                    </div>
                </div>

            </div>
        </div>
    );
};

// --- SUB-VIEWS ---

const DashboardView = ({ stats, pageList, setActiveTab }) => {
    const winningPosts = useMemo(() => [...pageList].sort((a, b) => b.score - a.score).slice(0, 5), [pageList]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Overall optimization */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
                    <div className="flex justify-center gap-2 mb-8 text-[#4a5568] font-bold">Overall Optimization <HelpCircle size={14} className="text-gray-300" /></div>
                    <div className="flex items-center gap-12">
                        <div className="relative w-48 h-48">
                            <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                                <circle cx="50" cy="50" r="40" stroke="#edf2f7" strokeWidth="12" fill="none" />
                                <circle
                                    cx="50" cy="50" r="40"
                                    stroke={stats.average >= 80 ? "#48bb78" : stats.average >= 50 ? "#ed8936" : "#f56565"}
                                    strokeWidth="12"
                                    fill="none"
                                    strokeDasharray="251.2"
                                    strokeDashoffset={251.2 - (251.2 * (stats.average / 100))}
                                    strokeLinecap="round"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-bold text-5xl text-gray-700">{stats.average || 0}</div>
                        </div>
                        <div className="flex-1 space-y-4">
                            <LegendItem color="bg-[#48bb78]" label="Good" value={stats.good} />
                            <LegendItem color="bg-[#ed8936]" label="Fair" value={stats.fair} />
                            <LegendItem color="bg-[#f56565]" label="Poor" value={stats.poor} />
                            <LegendItem color="bg-[#cbd5e0]" label="No Data" value={stats.noData} />
                        </div>
                    </div>
                    <div className="mt-8 text-center text-xs text-gray-400">
                        {stats.average} is the average SEO score for {stats.total} pages.
                    </div>
                </div>

                {/* Metrics */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 grid grid-cols-2 gap-8">
                    <MetricCard title="Search Traffic" value={stats.totalTraffic || '—'} />
                    <MetricCard title="Total Impressions" value={stats.totalImpressions || '—'} />
                    <MetricCard title="Total Keywords" value={pageList.filter(p => p.focusKeyword).length || '—'} />
                    <MetricCard title="Average Position" value={stats.avgPosition} />
                    <div className="col-span-2 flex justify-end pt-4 border-t border-gray-100">
                        <button onClick={() => setActiveTab('SEO Performance')} className="text-[10px] uppercase font-bold text-blue-500 hover:text-blue-600 transition-colors tracking-widest">VIEW ANALYTICS</button>
                    </div>
                </div>
            </div>

            {/* Top Winning Posts */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 font-bold text-gray-800">Top Optimization Wins</div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-[#fcfdfe] text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4">#</th>
                            <th className="px-6 py-4">Page Title</th>
                            <th className="px-6 py-4 text-center">Current Score</th>
                            <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {winningPosts.length > 0 ? winningPosts.map((page, i) => (
                            <tr key={page.path} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4 text-gray-300 font-bold">{i + 1}</td>
                                <td className="px-6 py-4">
                                    <div className="font-bold text-gray-700 truncate max-w-xs">{page.config.title || 'Untitled Page'}</div>
                                    <div className="text-gray-400 text-[10px]">{page.path}</div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-block px-3 py-1 rounded-md font-bold text-xs border ${getScoreStyle(page.score)}`}>
                                        {page.score}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    {page.score >= 80 ? <span className="text-green-500 text-[10px] font-bold">OPTIMIZED</span> : <span className="text-gray-400 text-[10px] font-bold">NEEDS WORK</span>}
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="4" className="px-6 py-8 text-center text-gray-400 italic">No page data available yet. Visit your pages to run audits.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const SiteAnalyticsView = ({ stats, pageList }) => (
    <div className="space-y-6">
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500" style={{ width: `${(stats.good / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-orange-500" style={{ width: `${(stats.fair / (stats.total || 1)) * 100}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${(stats.poor / (stats.total || 1)) * 100}%` }} />
        </div>

        <div className="grid grid-cols-4 gap-4">
            <ScoreCard label="Good" count={stats.good} color="text-green-500" border="border-green-500" />
            <ScoreCard label="Fair" count={stats.fair} color="text-orange-500" border="border-orange-500" />
            <ScoreCard label="Poor" count={stats.poor} color="text-red-500" border="border-red-500" />
            <ScoreCard label="No Data" count={stats.noData} color="text-gray-300" border="border-gray-200" />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-[#fcfdfe] text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                    <tr>
                        <th className="px-6 py-4">#</th>
                        <th className="px-6 py-4">Title / Path</th>
                        <th className="px-6 py-4">SEO Score</th>
                        <th className="px-6 py-4">Focus Keyword</th>
                        <th className="px-6 py-4">Traffic</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                    {pageList.map((page, i) => (
                        <tr key={page.path} className="hover:bg-gray-50/50">
                            <td className="px-6 py-4 text-gray-300 font-bold">{i + 1}</td>
                            <td className="px-6 py-4">
                                <div className="font-bold text-gray-700">{page.config.title || 'Untitled Page'}</div>
                                <div className="text-gray-400 text-[11px] truncate max-w-sm">{page.path}</div>
                            </td>
                            <td className="px-6 py-4">
                                <span className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-bold border ${getScoreStyle(page.score)}`}>
                                    {page.score}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                {page.focusKeyword ? <span className="text-blue-500 font-medium italic">{page.focusKeyword}</span> : <span className="text-gray-300 italic">None set</span>}
                            </td>
                            <td className="px-6 py-4 font-bold text-gray-700">{page.traffic || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div >
);

const SEOPerformanceView = ({ stats }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center space-y-6">
        <div className="inline-flex p-6 bg-blue-50 text-blue-500 rounded-full">
            <Target size={48} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Search Console Performance</h2>
        <p className="text-gray-500 max-w-lg mx-auto leading-relaxed">
            Connect your Google Search Console account in the settings to pull live traffic, clicks, and average position data directly from Google's servers.
        </p>
        <button className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-blue-500/20">
            CONNECT SEARCH CONSOLE
        </button>
        <div className="grid grid-cols-4 gap-6 pt-12 max-w-3xl mx-auto opacity-50">
            <MetricCard title="Clicks" value="—" />
            <MetricCard title="Impressions" value="—" />
            <MetricCard title="CTR" value="—" />
            <MetricCard title="Position" value="—" />
        </div>
    </div>
);

const KeywordsView = ({ pageList }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-100 font-bold text-gray-800">Focus Keyword Status</div>
        <table className="w-full text-left text-sm">
            <thead className="bg-[#fcfdfe] text-[10px] uppercase font-bold text-gray-400 border-b border-gray-100">
                <tr>
                    <th className="px-6 py-4">Keyword</th>
                    <th className="px-6 py-4">Assigned Page</th>
                    <th className="px-6 py-4 text-center">Score</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
                {pageList.filter(p => p.focusKeyword).map((page) => (
                    <tr key={page.path}>
                        <td className="px-6 py-4 font-bold text-gray-700 flex items-center gap-2">
                            <TrendingUp size={14} className="text-blue-500" /> {page.focusKeyword}
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-xs">{page.path}</td>
                        <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getScoreStyle(page.score)}`}>
                                {page.score}
                            </span>
                        </td>
                    </tr>
                ))}
                {pageList.filter(p => p.focusKeyword).length === 0 && (
                    <tr><td colSpan="3" className="px-6 py-12 text-center text-gray-400 italic">No focus keywords assigned to any pages yet.</td></tr>
                )}
            </tbody>
        </table>
    </div>
);

const RankTrackerView = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center space-y-6">
        <div className="inline-flex p-6 bg-blue-50 text-blue-500 rounded-full">
            <MapPin size={48} />
        </div>
        <h2 className="text-2xl font-bold text-gray-800">Rank Tracking (API Required)</h2>
        <p className="text-gray-500 max-w-lg mx-auto leading-relaxed">
            Keyword rank tracking requires a premium connection to monitor your SERP positions daily for specific target keywords across various search regions.
        </p>
        <div className="flex justify-center gap-4">
            <a
                href="https://developers.google.com/search/docs/monitoring/debug/search-console-api"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2 border border-blue-600 text-blue-600 font-bold rounded-lg hover:bg-blue-50 transition-colors inline-block"
            >
                Learn More
            </a>
            <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors inline-block"
            >
                Get API Key
            </a>
        </div>
    </div>
);

const IndexStatusView = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center space-y-4">
        <div className="inline-flex p-6 bg-red-50 text-red-500 rounded-full mb-2">
            <AlertCircle size={48} />
        </div>
        <h2 className="text-xl font-bold text-gray-800">Inspection Data Missing</h2>
        <p className="text-gray-500 max-w-sm mx-auto">
            We cannot see which pages are currently indexed by Google without Search Console permissions enabled.
        </p>
    </div>
);

// --- HELPERS ---

const LegendItem = ({ color, label, value }) => (
    <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-sm ${color}`} /><span className="text-gray-500 font-medium">{label}</span></div>
        <span className="font-bold text-gray-700">{value}</span>
    </div>
);

const MetricCard = ({ title, value }) => (
    <div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{title} <HelpCircle size={12} className="text-gray-200" /></div>
        <div className="text-3xl font-bold text-gray-700">{value}</div>
    </div>
);

const ScoreCard = ({ label, count, color, border }) => (
    <div className={`bg-white rounded-xl shadow-sm border-b-4 ${border} p-6 text-center`}>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</div>
        <div className={`text-3xl font-bold ${color}`}>{count}</div>
    </div>
);

const KeywordTrendItem = ({ label, score, trend, pos }) => (
    <li className="flex items-center justify-between text-xs">
        <span className="text-gray-500 italic truncate max-w-[120px]">{label}</span>
        <div className="flex items-center gap-4">
            <span className="font-bold text-gray-700">{score}</span>
            <span className={`flex items-center gap-0.5 font-bold ${pos ? 'text-green-500' : 'text-red-500'}`}>
                {pos ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} {trend}
            </span>
        </div>
    </li>
);

const PositionBoxStat = ({ label, color, value, trend }) => (
    <div className="flex flex-col items-center px-4">
        <div className="flex items-center gap-2 text-[9px] uppercase font-bold text-gray-400 tracking-wider mb-3">{label}</div>
        <div className="text-3xl font-bold text-gray-700">{value}</div>
        <div className={`text-xs font-bold ${trend >= 0 ? 'text-green-500' : 'text-red-500'} flex items-center gap-0.5`}>
            {trend >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} {Math.abs(trend)}
        </div>
    </div>
);

const getScoreStyle = (score) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-100";
    if (score >= 50) return "text-orange-600 bg-orange-50 border-orange-100";
    if (score > 0) return "text-red-600 bg-red-50 border-red-100";
    return "text-gray-400 bg-gray-50 border-gray-100";
};

export default ReportsDashboard;
