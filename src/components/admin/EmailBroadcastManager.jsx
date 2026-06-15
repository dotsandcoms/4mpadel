import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';
import { Mail, Users, Send, AlertCircle, Loader, CheckCircle, Search, Bold, Italic, Underline, List, ListOrdered, Link as LinkIcon, RemoveFormatting } from 'lucide-react';
import { motion } from 'framer-motion';

const CustomWysiwyg = ({ value, onChange }) => {
    const editorRef = React.useRef(null);

    React.useEffect(() => {
        if (editorRef.current && value !== editorRef.current.innerHTML) {
            editorRef.current.innerHTML = value || '';
        }
    }, [value]);

    const exec = (command, val = null) => {
        document.execCommand(command, false, val);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
            editorRef.current.focus();
        }
    };

    return (
        <div className="bg-black/50 border border-white/10 rounded-xl overflow-hidden flex flex-col text-white">
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-white/10 bg-black/80">
                <button type="button" onClick={() => exec('bold')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Bold"><Bold size={16} /></button>
                <button type="button" onClick={() => exec('italic')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Italic"><Italic size={16} /></button>
                <button type="button" onClick={() => exec('underline')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Underline"><Underline size={16} /></button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button type="button" onClick={() => exec('insertUnorderedList')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Bullet List"><List size={16} /></button>
                <button type="button" onClick={() => exec('insertOrderedList')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Numbered List"><ListOrdered size={16} /></button>
                <div className="w-px h-4 bg-white/20 mx-1"></div>
                <button type="button" onClick={() => {
                    const url = prompt('Enter the link URL:');
                    if (url) exec('createLink', url);
                }} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Insert Link"><LinkIcon size={16} /></button>
                <button type="button" onClick={() => exec('removeFormat')} className="p-2 hover:bg-white/10 rounded-lg transition-colors" title="Clear Formatting"><RemoveFormatting size={16} /></button>
            </div>
            <div 
                ref={editorRef}
                className="p-4 min-h-[300px] outline-none text-sm font-sans"
                contentEditable
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                onBlur={(e) => onChange(e.currentTarget.innerHTML)}
            />
        </div>
    );
};

const EmailBroadcastManager = () => {
    const [events, setEvents] = useState([]);
    const [selectedEvents, setSelectedEvents] = useState([]);
    const [loadingEvents, setLoadingEvents] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [testEmails, setTestEmails] = useState('');
    const [showRecipientsList, setShowRecipientsList] = useState(false);

    const [subject, setSubject] = useState('');
    const [bodyHtml, setBodyHtml] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isTesting, setIsTesting] = useState(false);
    
    const [recipients, setRecipients] = useState([]);
    const [loadingRecipients, setLoadingRecipients] = useState(false);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            const { data, error } = await supabase
                .from('calendar')
                .select('id, event_name, start_date')
                .order('start_date', { ascending: false });

            if (error) throw error;
            setEvents(data || []);
        } catch (error) {
            console.error("Error fetching events:", error);
            toast.error("Failed to load tournaments");
        } finally {
            setLoadingEvents(false);
        }
    };

    const handleEventToggle = (eventId) => {
        setSelectedEvents(prev => 
            prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
        );
    };

    // Whenever selected events change, fetch the unique emails
    useEffect(() => {
        if (selectedEvents.length === 0) {
            setRecipients([]);
            return;
        }

        const fetchRecipients = async () => {
            setLoadingRecipients(true);
            try {
                // Get local registrations
                const { data: regData, error: regError } = await supabase
                    .from('event_registrations')
                    .select('email')
                    .in('event_id', selectedEvents);

                if (regError) console.error("Error fetching event_registrations:", regError);

                // Get rankedin participants
                const { data: tpData, error: tpError } = await supabase
                    .from('tournament_participants')
                    .select('email')
                    .in('event_id', selectedEvents);

                if (tpError) console.error("Error fetching tournament_participants:", tpError);

                // Extract and deduplicate unique emails
                const allEmails = [
                    ...(regData || []).map(r => r.email),
                    ...(tpData || []).map(r => r.email)
                ].filter(e => e && e.includes('@'));

                const uniqueEmails = [...new Set(allEmails)];
                setRecipients(uniqueEmails);
            } catch (error) {
                console.error("Error fetching recipients:", error);
                toast.error("Failed to load participants");
            } finally {
                setLoadingRecipients(false);
            }
        };

        fetchRecipients();
    }, [selectedEvents]);

    const handleSendTest = async () => {
        if (!subject.trim()) return toast.error("Please enter a subject line");
        if (!bodyHtml.trim()) return toast.error("Please enter the email message");
        if (!testEmails.trim()) return toast.error("Please enter at least one test email");

        const emails = testEmails.split(',').map(e => e.trim()).filter(e => e && e.includes('@'));
        if (emails.length === 0) return toast.error("Please enter valid email addresses");

        setIsTesting(true);
        try {
            const { data, error } = await supabase.functions.invoke('send-email', {
                body: {
                    template: 'broadcast',
                    bcc: emails,
                    variables: {
                        subject: subject + " (TEST)",
                        message: bodyHtml
                    }
                }
            });

            if (error || (data && data.error)) {
                console.error("Test failed:", error || data.error);
                toast.error("Test email failed to send. Check console.");
            } else {
                toast.success(`Test email successfully sent to ${emails.length} recipient(s)!`);
            }
        } catch (error) {
            console.error("Error sending test:", error);
            toast.error(error.message || "Failed to send test email");
        } finally {
            setIsTesting(false);
        }
    };

    const handleSendBroadcast = async () => {
        if (!subject.trim()) return toast.error("Please enter a subject line");
        if (!bodyHtml.trim()) return toast.error("Please enter the email message");
        if (recipients.length === 0) return toast.error("No recipients selected");

        const confirmed = window.confirm(`Are you sure you want to send this email to ${recipients.length} participants?`);
        if (!confirmed) return;

        setIsSending(true);
        try {
            // Batch emails in chunks of 50 for Resend API limits
            const chunkSize = 50;
            const chunks = [];
            for (let i = 0; i < recipients.length; i += chunkSize) {
                chunks.push(recipients.slice(i, i + chunkSize));
            }

            let successCount = 0;
            let errorCount = 0;

            for (const chunk of chunks) {
                const { data, error } = await supabase.functions.invoke('send-email', {
                    body: {
                        template: 'broadcast',
                        bcc: chunk, // We use bcc to ensure privacy
                        variables: {
                            subject: subject,
                            message: bodyHtml
                        }
                    }
                });

                if (error) {
                    console.error("Chunk failed:", error);
                    errorCount += chunk.length;
                } else if (data && data.error) {
                    console.error("Chunk returned error:", data.error);
                    errorCount += chunk.length;
                } else {
                    successCount += chunk.length;
                }
            }

            if (errorCount > 0) {
                toast.warning(`Sent to ${successCount} players, but failed for ${errorCount}. Check logs.`);
            } else {
                toast.success(`Broadcast successfully sent to ${successCount} participants!`);
                // Reset form
                setSubject('');
                setBodyHtml('');
                setSelectedEvents([]);
            }

        } catch (error) {
            console.error("Error sending broadcast:", error);
            toast.error(error.message || "Failed to send broadcast");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-tight">Email Broadcast</h1>
                    <p className="text-gray-400 mt-1">Send bulk emails to tournament participants</p>
                </div>
                <div className="w-12 h-12 bg-padel-green/10 rounded-xl flex items-center justify-center">
                    <Mail className="w-6 h-6 text-padel-green" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LEFT COLUMN: Configuration */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Event Selection */}
                    <div className="bg-[#0F172A] border border-white/5 p-6 rounded-2xl shadow-xl">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-padel-green" />
                            Target Audience
                        </h2>
                        
                        <p className="text-sm text-gray-400 mb-4">Select the tournaments to email participants from. We will automatically deduplicate emails if players entered multiple selected events.</p>

                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Search tournaments by name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-black/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                            />
                        </div>

                        <div className="max-h-64 overflow-y-auto custom-scrollbar border border-white/10 rounded-xl bg-black/30 p-2">
                            {loadingEvents ? (
                                <div className="p-4 text-center text-gray-400">Loading tournaments...</div>
                            ) : events.length === 0 ? (
                                <div className="p-4 text-center text-gray-400">No tournaments found.</div>
                            ) : (
                                <div className="space-y-1">
                                    {events
                                        .filter(event => event.event_name?.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map(event => (
                                            <label key={event.id} className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedEvents.includes(event.id)}
                                                    onChange={() => handleEventToggle(event.id)}
                                                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-padel-green focus:ring-padel-green focus:ring-offset-gray-900"
                                                />
                                                <span className="text-sm font-medium text-white truncate">{event.event_name}</span>
                                                <span className="text-xs text-gray-500 ml-auto flex-shrink-0">
                                                    {event.start_date ? new Date(event.start_date).toLocaleDateString() : 'No date'}
                                                </span>
                                            </label>
                                        ))}
                                    {events.filter(event => event.event_name?.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                                        <div className="p-4 text-center text-gray-500 text-sm">No matching tournaments found.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Audience Stats */}
                        <div className="mt-4 flex items-center justify-between bg-black/50 p-4 rounded-xl border border-white/5">
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Recipients</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-2xl font-black text-white">{loadingRecipients ? <Loader className="w-5 h-5 animate-spin text-padel-green" /> : recipients.length}</span>
                                    <span className="text-sm text-gray-400">Unique Emails</span>
                                </div>
                            </div>
                            {recipients.length > 0 && (
                                <div className="bg-padel-green/10 text-padel-green px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                    <CheckCircle className="w-3 h-3" /> Target Audience Ready
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Email Composer */}
                    <div className="bg-[#0F172A] border border-white/5 p-6 rounded-2xl shadow-xl">
                        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                            <Mail className="w-5 h-5 text-padel-green" />
                            Email Message
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Subject Line</label>
                                <input 
                                    type="text" 
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="e.g. Important Update regarding SAPA Gold Tournament"
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Message Content (WYSIWYG Editor)</label>
                                <CustomWysiwyg value={bodyHtml} onChange={setBodyHtml} />
                                <p className="text-[11px] text-gray-500 mt-2 flex items-start gap-1">
                                    <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                    This content will be automatically wrapped inside the premium 4M Padel email template layout. Just type your main content above.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Preview & Send */}
                <div className="space-y-6">
                    {/* Test Email Section */}
                    <div className="bg-[#0F172A] border border-white/5 p-6 rounded-2xl shadow-xl">
                        <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs border-b border-white/10 pb-2">Send Test Email</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Test Recipients</label>
                                <input 
                                    type="text" 
                                    value={testEmails}
                                    onChange={(e) => setTestEmails(e.target.value)}
                                    placeholder="email1@test.com, email2@test.com"
                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green transition-all"
                                />
                                <p className="text-[10px] text-gray-500 mt-1">Comma separated list of emails</p>
                            </div>
                            <button 
                                onClick={handleSendTest}
                                disabled={isTesting || isSending || !testEmails.trim() || !subject.trim() || !bodyHtml.trim()}
                                className="w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isTesting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} 
                                Send Test
                            </button>
                        </div>
                    </div>

                    <div className="bg-black/80 border border-padel-green/30 p-6 rounded-2xl shadow-lg sticky top-24">
                        <h3 className="font-bold text-white mb-4 uppercase tracking-widest text-xs border-b border-white/10 pb-2">Broadcast Summary</h3>
                        
                        <div className="space-y-4 mb-6">
                            <div>
                                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1 flex justify-between items-center">
                                    To
                                    {recipients.length > 0 && (
                                        <button 
                                            onClick={() => setShowRecipientsList(!showRecipientsList)}
                                            className="text-padel-green hover:text-white transition-colors capitalize text-xs"
                                        >
                                            {showRecipientsList ? 'Hide List' : 'View List'}
                                        </button>
                                    )}
                                </p>
                                <p className="text-sm text-white font-medium">{recipients.length} participants (BCC)</p>
                                
                                {showRecipientsList && recipients.length > 0 && (
                                    <div className="mt-2 max-h-40 overflow-y-auto custom-scrollbar bg-black/50 border border-white/10 rounded-xl p-3 text-xs text-gray-400 space-y-1">
                                        {recipients.map(email => (
                                            <div key={email} className="truncate">{email}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] uppercase text-gray-500 font-bold mb-1">Subject</p>
                                <p className="text-sm text-white font-medium">{subject || <span className="text-gray-600 italic">No subject</span>}</p>
                            </div>
                        </div>

                        <button 
                            onClick={handleSendBroadcast}
                            disabled={isSending || recipients.length === 0 || !subject.trim() || !bodyHtml.trim()}
                            className="w-full py-4 px-6 bg-padel-green hover:bg-[#A9FF00] text-black font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(204,255,0,0.15)] hover:shadow-[0_0_30px_rgba(204,255,0,0.3)] disabled:shadow-none"
                        >
                            {isSending ? (
                                <>
                                    <Loader className="w-5 h-5 animate-spin" /> Sending...
                                </>
                            ) : (
                                <>
                                    <Send className="w-5 h-5" /> Send Broadcast
                                </>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default EmailBroadcastManager;
