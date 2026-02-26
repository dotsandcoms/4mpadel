import React, { useMemo, useState } from 'react';
import { useSEOContext } from '../context/SEOProvider';
import { BarChart, CheckCircle, AlertTriangle, X, Search, Filter, Download } from 'lucide-react';
import { Link } from 'react-router-dom';

const AnalyticsDashboard = () => {
    const { pages, site } = useSEOContext();
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState('score'); // score, path

    // Calculate stats and scores for all pages
    const analysis = useMemo(() => {
        const pageList = Object.entries(pages)
            .filter(([path]) => path !== '/reports')
            .map(([path, config]) => {
                // Use persisted score if available (more accurate), otherwise estimate
                let score = config.lastScore || 0;
                let isEstimate = !config.lastScore;

                let checks = {
                    title: !!config.title,
                    description: !!config.description,
                    keyword: !!config.focusKeyword,
                    image: !!config.image
                };

                // Fallback Estimation if no visited score
                if (isEstimate) {
                    // Simple weighted estimation
                    if (checks.title) score += 30;
                    if (checks.description) score += 30;
                    if (checks.keyword) score += 20;
                    if (checks.image) score += 20;
                }

                return {
                    path,
                    config,
                    score,
                    isEstimate,
                    checks
                };
            });

        // Sorting
        if (sort === 'score') pageList.sort((a, b) => a.score - b.score);
        else pageList.sort((a, b) => a.path.localeCompare(b.path));

        // Filtering
        if (filter) {
            return pageList.filter(p => p.path.toLowerCase().includes(filter.toLowerCase()));
        }

        return pageList;
    }, [pages, filter, sort]);

    // Overall Site Health
    const siteHealth = useMemo(() => {
        if (analysis.length === 0) return 0;
        const totalScore = analysis.reduce((acc, curr) => acc + curr.score, 0);
        return Math.round(totalScore / analysis.length);
    }, [analysis]);

    const exportCSV = () => {
        const headers = ['Path', 'Title', 'Description', 'Focus Keyword', 'Score'];
        const csvContent = [
            headers.join(','),
            ...analysis.map(p => [
                p.path,
                `"${p.config.title || ''}"`,
                `"${p.config.description || ''}"`,
                `"${p.config.focusKeyword || ''}"`,
                p.score
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `seo_report_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    return (
        <div className="space-y-6">
            {/* Header Stats */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-white font-semibold flex items-center gap-2">
                        <BarChart size={18} className="text-blue-400" />
                        Analytics Dashboard
                    </h3>
                    <p className="text-xs text-gray-500">Overview of {Object.keys(pages).length} pages tracked</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white leading-none">{siteHealth}</div>
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider">Site Health</div>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 text-gray-600 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Filter pages..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full bg-[#151521] border border-gray-800 rounded-md pl-9 pr-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                    />
                </div>
                <button
                    onClick={exportCSV}
                    className="bg-[#151521] border border-gray-800 text-gray-400 hover:text-white p-2 rounded-md transition-colors"
                    title="Export CSV"
                >
                    <Download size={16} />
                </button>
            </div>

            {/* List */}
            <div className="space-y-2">
                {analysis.map((page) => (
                    <div key={page.path} className="bg-[#151521] border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                            <div className="min-w-0">
                                <Link to={page.path} className="text-sm font-medium text-blue-400 hover:underline block truncate">
                                    {page.path}
                                </Link>
                                <p className="text-xs text-gray-500 truncate mt-0.5">
                                    {page.config.title || <span className="text-red-500/50 italic">Missing Title</span>}
                                </p>
                            </div>
                            <div className={`flex flex-col items-end flex-shrink-0 ml-3`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${page.score >= 80 ? 'border-green-500 text-green-500' :
                                    page.score >= 50 ? 'border-amber-500 text-amber-500' :
                                        'border-red-500 text-red-500'
                                    }`}>
                                    {page.score}
                                </div>
                                {page.isEstimate && (
                                    <span className="text-[9px] text-gray-500 mt-0.5 uppercase tracking-wider">Est.</span>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-800/50">
                            <Badge label="Title" status={page.config.title ? 'good' : 'bad'} />
                            <Badge label="Desc" status={page.config.description ? 'good' : 'bad'} />
                            <Badge label="Kw" status={page.config.focusKeyword ? 'good' : 'bad'} />
                            <Badge label="Img" status={page.config.image ? 'good' : 'bad'} />
                        </div>
                    </div>
                ))}

                {analysis.length === 0 && (
                    <div className="text-center py-10 text-gray-500">
                        No pages found.
                    </div>
                )}
            </div>
        </div>
    );
};

const Badge = ({ label, status }) => (
    <div className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${status === 'good' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
        {status === 'good' ? <CheckCircle size={8} /> : <X size={8} />}
        {label}
    </div>
);

export default AnalyticsDashboard;
