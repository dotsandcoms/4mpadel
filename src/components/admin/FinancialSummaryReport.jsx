import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { 
    Download, Search, Filter, Loader2, 
    CheckCircle, XCircle, AlertCircle, 
    User, Calendar, Landmark, FileSpreadsheet
} from 'lucide-react';
import { formatCurrency } from '../../constants/fees';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const FinancialSummaryReport = ({ allowedEvents = [] }) => {
    const isRestricted = allowedEvents.length > 0;
    const [viewMode, setViewMode] = useState('events'); // 'players' or 'events'
    const [loading, setLoading] = useState(true);
    const [players, setPlayers] = useState([]);
    const [payments, setPayments] = useState([]);
    const [registrations, setRegistrations] = useState([]);
    const [events, setEvents] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchReportData = async () => {
            setLoading(true);
            try {
                const [
                    { data: pData },
                    { data: payData },
                    { data: regData },
                    { data: eventData }
                ] = await Promise.all([
                    supabase.from('players').select('id, name, email, license_type, paid_registration, approved'),
                    isRestricted 
                        ? supabase.from('payments').select('*, calendar(event_name)').in('event_id', allowedEvents)
                        : supabase.from('payments').select('*, calendar(event_name)'),
                    isRestricted
                        ? supabase.from('tournament_participants').select('*, players(name, email, license_type, paid_registration)').in('event_id', allowedEvents)
                        : supabase.from('tournament_participants').select('*, players(name, email, license_type, paid_registration)'),
                    isRestricted
                        ? supabase.from('calendar').select('id, event_name, entry_fee, start_date').in('id', allowedEvents)
                        : supabase.from('calendar').select('id, event_name, entry_fee, start_date')
                ]);

                setPlayers(pData || []);
                setPayments(payData || []);
                setRegistrations(regData || []);
                setEvents(eventData || []);
            } catch (err) {
                console.error("Report fetch error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchReportData();
    }, []);

    const eventReportData = useMemo(() => {
        return registrations.map(reg => {
            const playerPayments = payments.filter(p => p.player_id === reg.profile_id && p.event_id === reg.event_id);
            const entryFeePayment = playerPayments.find(p => p.payment_type === 'event_entry_fee');
            const licensePayment = payments.find(p => p.player_id === reg.profile_id && p.payment_type === 'temp_license' && p.event_id === reg.event_id);
            
            const event = events.find(e => e.id === reg.event_id);

            return {
                id: reg.id,
                playerName: reg.full_name || reg.players?.name || 'Unknown',
                email: reg.players?.email || 'N/A',
                eventName: event?.event_name || 'Unknown Event',
                entryFeePaid: !!entryFeePayment || reg.is_paid,
                entryFeeAmount: entryFeePayment?.amount || 0,
                licenseStatus: reg.players?.license_type || 'None',
                licensePaid: reg.players?.paid_registration || false,
                totalPaid: playerPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
            };
        })
        .filter(item => 
            item.playerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.eventName.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.playerName.localeCompare(b.playerName));
    }, [registrations, payments, events, searchQuery]);

    const playerReportData = useMemo(() => {
        return players.map(p => {
            const playerPayments = payments.filter(pay => pay.player_id === p.id);
            const membershipPayment = playerPayments.find(pay => pay.payment_type === 'membership');
            
            return {
                id: p.id,
                name: p.name,
                email: p.email,
                licenseType: p.license_type,
                isApproved: p.approved,
                isPaid: p.paid_registration,
                membershipPaid: !!membershipPayment,
                totalSpent: playerPayments.reduce((sum, pay) => sum + (pay.amount || 0), 0)
            };
        })
        .filter(item => 
            item.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
            item.email?.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    }, [players, payments, searchQuery]);

    const exportToCSV = () => {
        let headers = [];
        let rows = [];
        let filename = "";

        if (viewMode === 'events') {
            headers = ["Player", "Email", "Event", "Entry Fee Status", "License Status", "Total Paid (ZAR)"];
            rows = eventReportData.map(d => [
                d.playerName,
                d.email,
                d.eventName,
                d.entryFeePaid ? "Paid" : "Unpaid",
                d.licenseStatus + (d.licensePaid ? " (Paid)" : " (Unpaid)"),
                d.totalPaid
            ]);
            filename = "event_financial_summary.csv";
        } else {
            headers = ["Player", "Email", "License Type", "Status", "Total Spent (ZAR)"];
            rows = playerReportData.map(d => [
                d.name,
                d.email,
                d.licenseType,
                d.isPaid ? "Paid/Active" : "Inactive",
                d.totalSpent
            ]);
            filename = "player_financial_summary.csv";
        }

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const exportToExcelConsolidated = async () => {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = '4M Padel Admin';
        workbook.created = new Date();

        // Helper for auto-widths
        const setAutoWidth = (worksheet) => {
            worksheet.columns.forEach(column => {
                let maxColumnLength = 0;
                column.eachCell({ includeEmpty: true }, (cell) => {
                    const columnLength = cell.value ? cell.value.toString().length : 10;
                    if (columnLength > maxColumnLength) {
                        maxColumnLength = columnLength;
                    }
                });
                column.width = maxColumnLength < 12 ? 12 : maxColumnLength + 5;
            });
        };

        // 1. Summary Sheet
        const wsSummary = workbook.addWorksheet('Global Summary');
        wsSummary.addRow(['4M PADEL CONSOLIDATED FINANCIAL REPORT']).font = { size: 16, bold: true };
        wsSummary.addRow(['Generated on:', new Date().toLocaleString()]);
        wsSummary.addRow([]);
        
        const summaryHeader = wsSummary.addRow(['Metric', 'Value']);
        summaryHeader.font = { bold: true };
        
        const summaryRows = [
            ['Total Revenue (All Time)', payments.reduce((s, p) => s + (p.amount || 0), 0)],
            ['Total Players', players.length],
            ['Full License Holders', players.filter(p => p.license_type === 'full').length],
            ['Temp License Holders', players.filter(p => p.license_type === 'temporary').length],
            ['Total Participants (All Events)', registrations.length],
            [],
            ['Revenue Breakdown'],
            ['Event Entry Fees', payments.filter(p => p.payment_type === 'event_entry_fee').reduce((s, p) => s + (p.amount || 0), 0)],
            ['License Fees', payments.filter(p => p.payment_type === 'temp_license' || p.payment_type === 'full_license').reduce((s, p) => s + (p.amount || 0), 0)],
            ['Membership / Others', payments.filter(p => p.payment_type === 'membership').reduce((s, p) => s + (p.amount || 0), 0)],
        ];
        
        summaryRows.forEach(row => wsSummary.addRow(row));
        wsSummary.getColumn(2).numFmt = '"R"#,##0.00';
        wsSummary.columns = [{ width: 35 }, { width: 20 }];

        // 2. Global Player Ledger
        const wsLedger = workbook.addWorksheet('Global Player Ledger');
        wsLedger.columns = [
            { header: 'Player Name', key: 'name' },
            { header: 'Email', key: 'email' },
            { header: 'License Type', key: 'license' },
            { header: 'Paid Registration', key: 'paid' },
            { header: 'LifeTime Spent (ZAR)', key: 'spent' }
        ];
        
        wsLedger.getRow(1).font = { bold: true };
        playerReportData.forEach(p => {
            wsLedger.addRow({
                name: p.name,
                email: p.email,
                license: p.licenseType,
                paid: p.isPaid ? 'YES' : 'NO',
                spent: p.totalSpent
            });
        });
        wsLedger.getColumn(5).numFmt = '"R"#,##0.00';
        wsLedger.autoFilter = 'A1:E1';
        setAutoWidth(wsLedger);

        // 3. Master Transactions
        const wsTrx = workbook.addWorksheet('Transactions History');
        wsTrx.columns = [
            { header: 'Date', key: 'date' },
            { header: 'Reference', key: 'ref' },
            { header: 'Player Name', key: 'playerName' },
            { header: 'Event', key: 'event' },
            { header: 'Type', key: 'type' },
            { header: 'Amount', key: 'amount' },
            { header: 'Status', key: 'status' }
        ];
        
        wsTrx.getRow(1).font = { bold: true };
        payments.forEach(p => {
            wsTrx.addRow({
                date: new Date(p.created_at).toLocaleDateString(),
                ref: p.reference,
                playerName: players.find(player => player.id === p.player_id)?.name || 'Unknown',
                event: p.calendar?.event_name || 'N/A',
                type: p.payment_type,
                amount: p.amount,
                status: p.status
            });
        });
        wsTrx.getColumn(6).numFmt = '"R"#,##0.00';
        wsTrx.autoFilter = 'A1:G1';
        setAutoWidth(wsTrx);

        // 4. Individual Event Sheets
        const uniqueEvents = [...new Set(registrations.map(r => r.event_id))];
        uniqueEvents.forEach(eventId => {
            const event = events.find(e => e.id === eventId);
            const eventName = event?.event_name || `Event_${eventId}`;
            const eventRegs = eventReportData.filter(r => registrations.find(reg => reg.id === r.id)?.event_id === eventId);
            
            if (eventRegs.length > 0) {
                const baseName = eventName.replace(/[\[\]\*\?\/\\]/g, '').substring(0, 25);
                let finalName = baseName;
                let counter = 1;
                while (workbook.worksheets.find(w => w.name === finalName)) {
                    finalName = `${baseName.substring(0, 20)}_${counter++}`;
                }

                const wsEvent = workbook.addWorksheet(finalName);
                wsEvent.addRow([`EVENT REPORT: ${eventName}`]).font = { bold: true, size: 14 };
                wsEvent.addRow([`Entry Fee: R ${event?.entry_fee || 0}`]);
                wsEvent.addRow([]);
                
                const eventHeaderRow = wsEvent.addRow(["Player Name", "Email", "Entry Fee Status", "License Status", "Total Paid (ZAR)"]);
                eventHeaderRow.font = { bold: true };
                
                eventRegs.forEach(r => {
                    wsEvent.addRow([
                        r.playerName,
                        r.email,
                        r.entryFeePaid ? 'PAID' : 'DUE',
                        r.licenseStatus + (r.licensePaid ? ' (Paid)' : ''),
                        r.totalPaid
                    ]);
                });
                
                wsEvent.getColumn(5).numFmt = '"R"#,##0.00';
                wsEvent.autoFilter = 'A4:E4';
                setAutoWidth(wsEvent);
            }
        });

        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `Financial_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-12 h-12 animate-spin text-padel-green mb-4" />
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Generating Comprehensive Report...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Report Controls */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1E293B]/50 p-6 rounded-3xl border border-white/10">
                <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5">
                    <button 
                        onClick={() => setViewMode('events')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'events' ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20' : 'text-gray-500 hover:text-white'}`}
                    >
                        <Landmark size={14} />
                        Event Participation
                    </button>
                    <button 
                        onClick={() => setViewMode('players')}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'players' ? 'bg-padel-green text-black shadow-lg shadow-padel-green/20' : 'text-gray-500 hover:text-white'}`}
                    >
                        <User size={14} />
                        Player Standing
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                        <input 
                            type="text" 
                            placeholder="Search report..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:border-padel-green outline-none"
                        />
                    </div>
                    <button 
                        onClick={exportToExcelConsolidated}
                        className="bg-padel-green/10 hover:bg-padel-green/20 text-padel-green px-4 py-2.5 rounded-xl border border-padel-green/20 transition-all group flex items-center gap-2 text-xs font-black uppercase tracking-wider shadow-lg shadow-padel-green/5"
                        title="Export Consolidated XLSX with all event sheets"
                    >
                        <FileSpreadsheet size={18} className="group-hover:scale-110 transition-transform" />
                        XLSX Report
                    </button>
                    <button 
                        onClick={exportToCSV}
                        className="bg-white/5 hover:bg-white/10 text-white p-2.5 rounded-xl border border-white/10 transition-all group"
                        title="Export current view as CSV"
                    >
                        <Download size={20} className="group-hover:scale-110 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Report Table */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-black/40 text-gray-400 text-[10px] uppercase font-black tracking-widest">
                            {viewMode === 'events' ? (
                                <tr>
                                    <th className="px-6 py-5">Player</th>
                                    <th className="px-6 py-5">Event</th>
                                    <th className="px-6 py-5 text-center">License</th>
                                    <th className="px-6 py-5 text-center">Entry Fee</th>
                                    <th className="px-6 py-5 text-right">Total Paid</th>
                                </tr>
                            ) : (
                                <tr>
                                    <th className="px-6 py-5">Player</th>
                                    <th className="px-6 py-5">License Type</th>
                                    <th className="px-6 py-5 text-center">Status</th>
                                    <th className="px-6 py-5 text-center">Account Setup</th>
                                    <th className="px-6 py-5 text-right">Lifetime Spent</th>
                                </tr>
                            )}
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {viewMode === 'events' ? (
                                eventReportData.length > 0 ? (
                                    eventReportData.map(row => (
                                        <tr key={row.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white group-hover:text-padel-green transition-colors">{row.playerName}</div>
                                                <div className="text-[10px] text-gray-500 font-medium">{row.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-gray-300">{row.eventName}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase ${
                                                        row.licenseStatus === 'full' ? 'bg-padel-green/10 text-padel-green border border-padel-green/20' :
                                                        row.licenseStatus === 'temporary' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                        'bg-gray-800 text-gray-500'
                                                    }`}>
                                                        {row.licenseStatus}
                                                    </span>
                                                    {row.licensePaid ? (
                                                        <span className="text-[8px] text-padel-green font-bold">PAID</span>
                                                    ) : (
                                                        <span className="text-[8px] text-red-500 font-bold italic">DUE</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.entryFeePaid ? (
                                                    <div className="inline-flex items-center gap-1.5 bg-padel-green/10 text-padel-green px-3 py-1.5 rounded-full text-[10px] font-black border border-padel-green/20">
                                                        <CheckCircle size={10} /> PAID
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 px-3 py-1.5 rounded-full text-[10px] font-black border border-red-500/20">
                                                        <XCircle size={10} /> UNPAID
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-black text-white">{formatCurrency(row.totalPaid)}</div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="py-20 text-center text-gray-600 italic">No registrations found matching criteria</td></tr>
                                )
                            ) : (
                                playerReportData.length > 0 ? (
                                    playerReportData.map(row => (
                                        <tr key={row.id} className="hover:bg-white/[0.02] transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white group-hover:text-padel-green transition-colors">{row.name}</div>
                                                <div className="text-[10px] text-gray-500 font-medium">{row.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase ${
                                                    row.licenseType === 'full' ? 'bg-padel-green/10 text-padel-green border border-padel-green/20' :
                                                    row.licenseType === 'temporary' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                                    'bg-gray-800 text-gray-500 border border-white/5'
                                                }`}>
                                                    {row.licenseType || 'none'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.isPaid ? (
                                                    <div className="inline-flex items-center gap-1.5 bg-padel-green/10 text-padel-green px-3 py-1.5 rounded-full text-[10px] font-black border border-padel-green/20">
                                                        <CheckCircle size={10} /> ACTIVE
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 px-3 py-1.5 rounded-full text-[10px] font-black border border-red-500/20">
                                                        <AlertCircle size={10} /> INACTIVE
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {row.isApproved ? (
                                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Verified</span>
                                                ) : (
                                                    <span className="text-[10px] text-yellow-500/50 font-bold uppercase tracking-widest">Pending</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="text-sm font-black text-white">{formatCurrency(row.totalSpent)}</div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr><td colSpan="5" className="py-20 text-center text-gray-600 italic">No players found matching criteria</td></tr>
                                )
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Summary Footer Widget */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#0F172A] border border-white/10 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">Total Participants</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-white">{registrations.length}</span>
                        <span className="text-gray-600 text-xs font-bold mb-1.5 pb-0.5">Across all events</span>
                    </div>
                </div>
                <div className="bg-[#0F172A] border border-white/10 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">Financial Compliance</p>
                    <div className="flex items-end gap-2">
                        <span className="text-3xl font-black text-padel-green">
                            {registrations.length > 0 ? Math.round((registrations.filter(r => r.is_paid).length / registrations.length) * 100) : 0}%
                        </span>
                        <span className="text-gray-600 text-xs font-bold mb-1.5 pb-0.5 text-padel-green/60">Entry fees settled</span>
                    </div>
                </div>
                <div className="bg-[#0F172A] border border-white/10 p-6 rounded-[2rem] shadow-xl">
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-2">Total Revenue (Ledger)</p>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-black text-white">{formatCurrency(payments.reduce((s, p) => s + (p.amount || 0), 0))}</span>
                        <span className="text-padel-green text-[10px] font-black mb-1.5 pb-1 cursor-help group relative">
                            Gross
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-black text-[10px] text-gray-400 invisible group-hover:visible rounded-lg border border-white/10 shadow-2xl z-10 transition-all">
                                Sum of all success transactions in payments table
                            </div>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialSummaryReport;
