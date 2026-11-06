import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { Trash2, Edit2, Plus, X, CheckCircle, AlertCircle, Search, Users, CreditCard, Eye, EyeOff, Mail, ShieldAlert, Key, Image as ImageIcon, Upload, MapPin, Download, Calendar, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ExcelJS from 'exceljs';
import logo4m from '../../assets/logo_4m_lowercase.png';
import { useClubs } from '../../hooks/useClubs';
import SearchableSelect from '../SearchableSelect';
import { BirthDateField, PlayerProfileDetailsFields } from '../PlayerProfileDetailsFields';
import { birthDateError, playtomicDetailsError, getProfileDetails, saveProfileDetails, PROOF_BUCKET, proofFileError } from '../../utils/profileDetails';
import { adminPlayerForm, adminPlayerPayload, privateProfileForm, privateProfileChanged } from '../../utils/adminPlayerProfile';
import { COURT_SIDE_OPTIONS, PLAYING_HAND_OPTIONS } from '../../utils/playerPreferences';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';

const STAT_COLORS = { 'padel-green': '#beff00', green: '#22c55e', amber: '#f59e0b', slate: '#64748b', sky: '#38bdf8' };
const StatCard = ({ title, value, subtext, icon: Icon, color = 'padel-green', delay = 0 }) => {
    const c = STAT_COLORS[color] || STAT_COLORS['padel-green'];
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.3 }}
            className="bg-[#1a1a1a]/50 backdrop-blur-md p-5 rounded-2xl border border-white/10 hover:border-white/20 transition-colors"
        >
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">{title}</p>
                    <p className="text-3xl font-black text-white">{value}</p>
                    <p className="text-gray-500 text-xs mt-1">{subtext}</p>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: c + '20' }}>
                    <Icon size={24} style={{ color: c }} />
                </div>
            </div>
        </motion.div>
    );
};

const PlayerManager = ({ canManageLicenses = false }) => {
    const [players, setPlayers] = useState([]);
    const { clubs, loading: loadingClubs } = useClubs();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [currentPlayer, setCurrentPlayer] = useState(null);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [toasts, setToasts] = useState([]);
    const [resetPasswordPlayer, setResetPasswordPlayer] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPaid, setFilterPaid] = useState('all'); // all | paid | unpaid
    const [filterActive, setFilterActive] = useState('all'); // all | visible | hidden
    const [filterCategory, setFilterCategory] = useState('All');
    const [filterRegion, setFilterRegion] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const [fullLicensePayments, setFullLicensePayments] = useState([]);
    const itemsPerPage = 50;
    const [showCharts, setShowCharts] = useState(() => {
        const saved = localStorage.getItem('show_admin_charts');
        return saved === 'true';
    });

    // Form State
    const [formData, setFormData] = useState(() => adminPlayerForm());
    const [profileDetails, setProfileDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsReady, setDetailsReady] = useState(false);
    const [detailsError, setDetailsError] = useState('');
    const [detailsRetry, setDetailsRetry] = useState(0);
    const [savingPlayer, setSavingPlayer] = useState(false);
    const [proofUploading, setProofUploading] = useState(false);
    const [uploadingGallery, setUploadingGallery] = useState(false);
    const [formError, setFormError] = useState('');
    const saveInFlight = useRef(false);
    const editDialogRef = useRef(null);
    const busy = savingPlayer || uploadingImage || proofUploading || uploadingGallery;

    useEffect(() => {
        if (!isEditing || !currentPlayer?.id) return;
        let active = true;
        setDetailsLoading(true); setDetailsReady(false); setDetailsError('');
        getProfileDetails(supabase, currentPlayer.id).then(details => {
            if (!active) return;
            setProfileDetails(details);
            setFormData(previous => ({ ...previous, ...privateProfileForm(details) }));
            setDetailsReady(true);
        }).catch(error => {
            if (active) setDetailsError(error.message);
        }).finally(() => { if (active) setDetailsLoading(false); });
        return () => { active = false; };
    }, [isEditing, currentPlayer?.id, detailsRetry]);

    useEffect(() => {
        if (!isEditing) return;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        editDialogRef.current?.focus();
        const keydown = event => {
            if (event.key === 'Escape' && !busy) { event.preventDefault(); setIsEditing(false); }
            if (event.key !== 'Tab') return;
            const controls = [...(editDialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]') || [])].filter(control => control.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && (document.activeElement === first || document.activeElement === editDialogRef.current)) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === editDialogRef.current)) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
    }, [isEditing, busy]);


    useEffect(() => {
        fetchPlayers();
    }, []);

    const showToast = (message, type = 'success') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 3000);
    };

    const removeToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const fetchPlayers = async () => {
        setLoading(true);
        setLoadError('');
        try {
            let allPlayers = [];
            let allPayments = [];
            const limit = 1000;
            
            let page = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('players')
                    .select('*, temporary_licenses(event_name, event_date, revoked_at)')
                    .order('created_at', { ascending: false })
                    .range(page * limit, (page + 1) * limit - 1);
                
                if (error) throw error;
                if (data && data.length > 0) {
                    allPlayers = [...allPlayers, ...data.map(player => ({
                        ...player,
                        temporary_licenses: (player.temporary_licenses || []).filter(license => !license.revoked_at),
                    }))];
                    if (data.length < limit) break;
                    page++;
                } else {
                    break;
                }
            }

            setPlayers(allPlayers);
            page = 0;
            while (true) {
                const { data, error } = await supabase
                    .from('payments')
                    .select('player_id, created_at, amount')
                    .in('payment_type', ['membership', 'full_license'])
                    .eq('status', 'success')
                    .order('created_at', { ascending: false })
                    .range(page * limit, (page + 1) * limit - 1);
                
                if (error) throw error;
                if (data && data.length > 0) {
                    allPayments = [...allPayments, ...data];
                    if (data.length < limit) break;
                    page++;
                } else {
                    break;
                }
            }

            setFullLicensePayments(allPayments);
        } catch (error) {
            console.error('Error fetching players:', error);
            setLoadError(error.message || 'Could not load player data.');
            showToast('Failed to fetch players', 'error');
        }

        setLoading(false);
    };

    // Derived stats
    const stats = useMemo(() => {
        const total = players.length;
        const full = players.filter(p => p.paid_registration === true && p.license_type === 'full').length;
        const temp = players.filter(p => p.paid_registration === true && p.license_type === 'temporary').length;
        const unpaid = total - (full + temp);
        const visible = players.filter(p => p.approved !== false && p.paid_registration === true && p.license_type === 'full').length;

        // Calculate Percentages
        const fullPercentage = total > 0 ? Math.round((full / total) * 100) : 0;

        // Calculate Gender Stats
        const male = players.filter(p => p.gender?.toLowerCase() === 'male').length;
        const female = players.filter(p => p.gender?.toLowerCase() === 'female').length;

        // Calculate Region Stats
        const regionMap = {};
        players.forEach(p => {
            const reg = p.region || 'Unassigned';
            regionMap[reg] = (regionMap[reg] || 0) + 1;
        });
        const topRegionEntry = Object.entries(regionMap).sort((a, b) => b[1] - a[1])[0];
        const topRegion = topRegionEntry ? topRegionEntry[0] : 'None';

        return {
            total,
            paid: full + temp,
            full,
            fullPercentage,
            temp,
            unpaid,
            visible,
            topRegion,
            uniqueRegions: Object.keys(regionMap).length,
            male,
            female
        };
    }, [players]);

    const genderChartData = useMemo(() => [
        { name: 'Male', value: stats.male, color: '#38bdf8' },
        { name: 'Female', value: stats.female, color: '#f472b6' },
        { name: 'Other', value: stats.total - (stats.male + stats.female), color: '#64748b' }
    ].filter(item => item.value > 0), [stats]);

    const regionChartData = useMemo(() => {
        const map = {};
        players.forEach(p => {
            const reg = p.region || 'Unassigned';
            map[reg] = (map[reg] || 0) + 1;
        });
        return Object.entries(map)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [players]);

    // Chart data
    const paymentChartData = useMemo(() => [
        { name: 'Full License', value: stats.full, color: '#beff00' },
        { name: 'Temp License', value: stats.temp, color: '#2563eb' },
        { name: 'Unpaid', value: stats.unpaid, color: '#f59e0b' },
    ], [stats.full, stats.temp, stats.unpaid]);


    const categoryChartData = useMemo(() => {
        const map = {};
        players.forEach(p => {
            const cat = p.category || 'Unassigned';
            map[cat] = (map[cat] || 0) + 1;
        });
        return Object.entries(map).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    }, [players]);

    const registrationChartData = useMemo(() => {
        const map = {};
        players.forEach(p => {
            if (!p.created_at) return;
            const date = new Date(p.created_at);
            const monthYear = date.toLocaleString('default', { month: 'short', year: '2-digit' });
            const sortKey = date.toISOString().substring(0, 7); // YYYY-MM

            if (!map[sortKey]) {
                map[sortKey] = { name: monthYear, count: 0, sortKey };
            }
            map[sortKey].count += 1;
        });

        return Object.values(map)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(item => ({ name: item.name, registrations: item.count }));
    }, [players]);

    const fullLicenseChartData = useMemo(() => {
        const map = {};
        fullLicensePayments.forEach(p => {
            if (!p.created_at) return;
            const date = new Date(p.created_at);
            const monthYear = date.toLocaleString('default', { month: 'short', year: '2-digit' });
            const sortKey = date.toISOString().substring(0, 7); // YYYY-MM

            if (!map[sortKey]) {
                map[sortKey] = { name: monthYear, count: 0, sortKey };
            }
            map[sortKey].count += 1;
        });

        return Object.values(map)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
            .map(item => ({ name: item.name, licenses: item.count }));
    }, [fullLicensePayments]);

    // Categories and Regions for filter dropdown
    const categories = useMemo(() => ['All', ...new Set(players.map(p => p.category).filter(Boolean))], [players]);
    const regions = useMemo(() => ['All', ...new Set(players.map(p => p.region).filter(Boolean))], [players]);

    // Filtered players
    const filteredPlayers = useMemo(() => {
        return players.map(player => {
            const payment = fullLicensePayments.find(p => p.player_id === player.id);
            return {
                ...player,
                full_license_paid_at: payment ? payment.created_at : null
            };
        }).filter(player => {
            const matchesSearch = !searchTerm ||
                player.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                player.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (player.home_club && player.home_club.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesPaid = filterPaid === 'all' ||
                (filterPaid === 'full' && player.paid_registration === true && player.license_type === 'full') ||
                (filterPaid === 'temporary' && player.paid_registration === true && player.license_type === 'temporary') ||
                (filterPaid === 'unpaid' && player.paid_registration !== true);
            const matchesActive = filterActive === 'all' ||
                (filterActive === 'visible' && player.approved !== false && player.paid_registration === true && player.license_type === 'full') ||
                (filterActive === 'hidden' && (player.approved === false || player.paid_registration !== true || player.license_type !== 'full'));
            const matchesCategory = filterCategory === 'All' || player.category === filterCategory;
            const matchesRegion = filterRegion === 'All' || player.region === filterRegion;
            return matchesSearch && matchesPaid && matchesActive && matchesCategory && matchesRegion;
        });
    }, [players, fullLicensePayments, searchTerm, filterPaid, filterActive, filterCategory, filterRegion]);


    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentPlayers = filteredPlayers.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredPlayers.length / itemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filterPaid, filterActive, filterCategory, filterRegion]);

    const resetEditorDetails = () => {
        setProfileDetails(null); setDetailsLoading(false); setDetailsReady(false); setDetailsError(''); setFormError('');
    };
    const handleAddNew = () => {
        setCurrentPlayer(null); setFormData(adminPlayerForm()); resetEditorDetails(); setIsEditing(true);
    };
    const handleEdit = player => {
        setCurrentPlayer(player); setFormData(adminPlayerForm(player)); resetEditorDetails(); setIsEditing(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this player?')) return;
        const { error } = await supabase.from('players').delete().eq('id', id);
        if (error) showToast('Error deleting player', 'error');
        else { showToast('Player deleted successfully'); fetchPlayers(); }
    };

    const handleInvite = async (player) => {
        if (!player.email) {
            showToast('Player has no email address', 'error');
            return;
        }

        const { error } = await supabase.auth.signInWithOtp({
            email: player.email,
            options: {
                emailRedirectTo: window.location.origin + '/profile?new_invite=true',
            }
        });

        if (error) {
            showToast('Failed to send invite: ' + error.message, 'error');
        } else {
            showToast('Invitation (Magic Link) sent to ' + player.email);
        }
    };

    const handleResetPassword = async (player) => {
        setResetPasswordPlayer(player);
        setNewPassword('');
    };

    const submitPasswordReset = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }

        setResetLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('admin-set-password', {
                body: { email: resetPasswordPlayer.email, newPassword: newPassword },
            });

            if (error) {
                throw new Error(error.message || 'Error from edge function');
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            showToast(`Password successfully updated for ${resetPasswordPlayer.name}`);
            setResetPasswordPlayer(null);
        } catch (error) {
            console.error('Password reset error:', error);
            showToast('Failed to reset password: ' + error.message, 'error');
        } finally {
            setResetLoading(false);
        }
    };

    const handleTestLogin = (player) => {
        sessionStorage.setItem('admin_test_login_email', player.email);
        showToast('Now testing as ' + player.name + '.');
        // Redirect to profile to see the impersonated user data
        setTimeout(() => {
            window.location.href = '/profile';
        }, 1000);
    };

    const handleSubmit = async event => {
        event.preventDefault();
        if (saveInFlight.current || busy) return;
        setFormError('');
        if (currentPlayer && !detailsReady) { setFormError(detailsError || 'Wait for the private profile details to finish loading.'); return; }
        if (currentPlayer) {
            const levelIssue = playtomicDetailsError(formData);
            if (levelIssue) { setFormError(levelIssue); return; }
        }
        const changedDetails = currentPlayer && privateProfileChanged(formData, profileDetails);
        if (changedDetails) {
            const issue = birthDateError(formData.date_of_birth) || playtomicDetailsError(formData);
            if (issue) { setFormError(issue); return; }
        }
        saveInFlight.current = true; setSavingPlayer(true);
        let privateSaved = false;
        try {
            if (changedDetails) {
                const details = await saveProfileDetails(supabase, currentPlayer.id, formData);
                setProfileDetails(details); privateSaved = true;
            }
            const payload = adminPlayerPayload(formData, clubs);
            const { error } = currentPlayer
                ? await supabase.from('players').update(payload).eq('id', currentPlayer.id).select('id').single()
                : await supabase.from('players').insert([payload]);
            if (error) throw error;
            if (changedDetails && profileDetails?.playtomic_proof_path && profileDetails.playtomic_proof_path !== formData.playtomic_proof_path) {
                void supabase.storage.from(PROOF_BUCKET).remove([profileDetails.playtomic_proof_path]);
            }
            showToast(currentPlayer ? 'Player updated' : 'Player added');
            setIsEditing(false); setCurrentPlayer(null); fetchPlayers();
        } catch (error) {
            setFormError(`${privateSaved ? 'Private details were saved. Other profile changes could not be saved. ' : ''}${error.message || 'Could not save the player profile.'} Retry to finish saving.`);
        } finally { saveInFlight.current = false; setSavingPlayer(false); }
    };

    // Resizing Utility
    const resizeImage = (file, maxWidth = 1200, quality = 0.8) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        }));
                    }, 'image/jpeg', quality);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    };

    const handleImageUpload = async (event) => {
        try {
            setUploadingImage(true);
            const file = event.target.files[0];
            if (!file) return;

            // Optional: Show toast for processing
            showToast('Processing image...', 'info');

            const resizedFile = await resizeImage(file);
            const fileExt = 'jpg';
            const fileName = `${currentPlayer?.id || 'new'}_${Date.now()}.${fileExt}`;
            const filePath = `players/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, resizedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            setFormData(previous => ({ ...previous, image_url: publicUrl }));
            showToast('Image uploaded successfully. Remember to save!');
        } catch (error) {
            console.error('Upload error:', error);
            showToast('Failed to upload image: ' + error.message, 'error');
        } finally {
            setUploadingImage(false);
        }
    };

    const handleGalleryUpload = async event => {
        const files = [...(event.target.files || [])]; event.target.value = '';
        if (!files.length || busy) return;
        const remaining = Math.max(0, 5 - formData.additional_images.length);
        if (files.length > remaining) { setFormError(`Choose up to ${remaining} more gallery photos.`); return; }
        const invalid = files.map(proofFileError).find(Boolean);
        if (invalid) { setFormError(invalid); return; }
        setUploadingGallery(true); setFormError('');
        try {
            const urls = [];
            for (const file of files) {
                const resized = await resizeImage(file);
                const filePath = `players/${currentPlayer?.id || 'new'}_gallery_${crypto.randomUUID()}.jpg`;
                const { error } = await supabase.storage.from('profile-pics').upload(filePath, resized, { contentType: 'image/jpeg', upsert: false });
                if (error) throw error;
                const { data } = supabase.storage.from('profile-pics').getPublicUrl(filePath);
                urls.push(data.publicUrl);
            }
            setFormData(previous => ({ ...previous, additional_images: [...previous.additional_images, ...urls].slice(0, 5) }));
        } catch (error) { setFormError(error.message || 'Could not upload gallery photos. Please try again.'); }
        finally { setUploadingGallery(false); }
    };

    const handleExportExcel = async () => {
        try {
            // Use FILTERED players for export to respect user's current view
            const sortedPlayers = [...filteredPlayers].sort((a, b) => 
                (a.name || '').localeCompare(b.name || '')
            );

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Players List');

            // Add Title at the top
            const titleRow = sheet.addRow([`4M Padel - Players Export (${new Date().toLocaleDateString()})`]);
            titleRow.font = { bold: true, size: 14 };
            titleRow.height = 45;
            titleRow.alignment = { vertical: 'middle' };
            sheet.mergeCells('A1:J1');

            try {
                // Fetch the image from the bundled URL
                const response = await fetch(logo4m);
                const buffer = await response.arrayBuffer();
                const imageId = workbook.addImage({
                    buffer: buffer,
                    extension: 'png',
                });
                
                sheet.addImage(imageId, {
                    tl: { col: 8, row: 0 },
                    ext: { width: 120, height: 40 }
                });
            } catch (imgErr) {
                console.warn('Could not load logo for Excel export', imgErr);
            }
            
            sheet.addRow([]);

            // Add Headers
            const headers = [
                'Name', 'Email', 'Contact Number', 'Region', 'Racket Brand', 'Home Club', 
                'Category', 'Gender', 'License Type', 'Paid Status', 
                'License Paid', 'Last Login'
            ];
            const headerRow = sheet.addRow(headers);
            headerRow.font = { bold: true };
            sheet.autoFilter = 'A3:L3';

            // Add Data Rows
            sortedPlayers.forEach(p => {
                sheet.addRow([
                    p.name,
                    p.email || 'N/A',
                    p.contact_number || 'N/A',
                    p.region || 'N/A',
                    p.racket_brand || 'N/A',
                    p.home_club || 'N/A',
                    p.category || 'N/A',
                    p.gender || 'N/A',
                    p.license_type || 'None',
                    p.paid_registration ? 'Paid' : 'Unpaid',
                    p.full_license_paid_at ? new Date(p.full_license_paid_at).toLocaleDateString() : 'N/A',
                    p.last_login ? new Date(p.last_login).toLocaleDateString() : 'Never'
                ]);
            });

            // Expand columns to fit content
            for (let i = 1; i <= 12; i++) {
                const column = sheet.getColumn(i);
                let maxLen = 0;
                column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
                    if (rowNumber >= 3 && cell.value) {
                        const colLen = cell.value.toString().length;
                        if (colLen > maxLen) maxLen = colLen;
                    }
                });
                column.width = maxLen + 2 > 10 ? maxLen + 2 : 10;
            }

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Players_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showToast("Players export downloaded successfully");
        } catch (err) {
            console.error("Export error:", err);
            showToast("Failed to generate Excel export", "error");
        }
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Toast Container */}
            <div className="fixed bottom-6 right-6 z-[99999] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border pointer-events-auto ${toast.type === 'error' ? 'bg-red-900/90 border-red-500/50' : 'bg-gray-900/90 border-padel-green/50'}`}
                        >
                            {toast.type === 'error' ? <AlertCircle size={20} className="text-red-400" /> : <CheckCircle size={20} className="text-padel-green" />}
                            <span className="font-medium text-sm">{toast.message}</span>
                            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:opacity-70"><X size={16} /></button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Players Dashboard</h2>
                    <p className="text-gray-400 text-sm">Manage players, view stats, and filter by license status</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportExcel}
                        className="bg-white/10 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white/20 transition-colors"
                    >
                        <Download size={18} /> Export
                    </button>
                    <button
                        onClick={handleAddNew}
                        className="bg-padel-green text-black px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-white transition-colors"
                    >
                        <Plus size={18} /> Add Player
                    </button>
                </div>
            </div>

            {loadError && <div role="alert" className="rounded-xl border border-red-400/30 p-4 text-red-200 flex flex-wrap items-center justify-between gap-3">
                <p>Could not load all player data. {loadError}</p>
                <button type="button" onClick={fetchPlayers} disabled={loading} className="border border-red-300/40 rounded-lg px-3 py-2 text-sm disabled:opacity-50">Retry</button>
            </div>}

            {/* Collapsible Stats and Insights */}
            <div className="space-y-4">
                <div className="flex items-center justify-between border-t border-white/5 pt-4">
                    <button
                        type="button"
                        aria-expanded={showCharts}
                        aria-controls="player-analytics-insights"
                        onClick={() => {
                            const nextVal = !showCharts;
                            setShowCharts(nextVal);
                            localStorage.setItem('show_admin_charts', String(nextVal));
                        }}
                        className="flex min-h-11 items-center gap-2 rounded-lg group cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-padel-green"
                    >
                        <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-padel-green/10 text-padel-green transition-transform duration-300 group-hover:scale-105">
                                <TrendingUp size={16} />
                            </span>
                            <span className="text-sm font-black uppercase tracking-wider text-white group-hover:text-padel-green transition-colors">
                                Analytics & Insights
                            </span>
                        </div>
                        <span className="text-gray-400 group-hover:text-white transition-colors">
                            {showCharts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                    </button>
                </div>

                <AnimatePresence initial={false}>
                    {showCharts && (
                        <motion.div
                            id="player-analytics-insights"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                        >
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2 pb-6">
                                <StatCard title="Total Players" value={loading ? '—' : stats.total} subtext="All registered" icon={Users} color="padel-green" delay={0} />
                                <StatCard title="Full License" value={loading ? '—' : stats.full} subtext={`${stats.fullPercentage}% of all registered`} icon={CreditCard} color="green" delay={0.05} />
                                <StatCard title="Male / Female" value={loading ? '—' : `${stats.male} / ${stats.female}`} subtext="Gender breakdown" icon={Users} color="sky" delay={0.1} />
                                <StatCard title="Current Temp License" value={loading ? '—' : stats.temp} subtext="Event specific" icon={CreditCard} color="amber" delay={0.15} />
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Payment Status</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <PieChart>
                                                <Pie data={paymentChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name}: ${value}`}>
                                                    {paymentChartData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.25 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">By Category</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={categoryChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                                <Bar dataKey="count" fill="#beff00" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.3 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">By Region</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={regionChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                                <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.35 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Gender Distribution</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <PieChart>
                                                <Pie 
                                                    data={genderChartData} 
                                                    dataKey="value" 
                                                    nameKey="name" 
                                                    cx="50%" 
                                                    cy="50%" 
                                                    innerRadius={50}
                                                    outerRadius={70} 
                                                    paddingAngle={5}
                                                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {genderChartData.map((entry, i) => (
                                                        <Cell key={i} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-padel-green">Registrations</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={registrationChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                                <Bar dataKey="registrations" fill="#beff00" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>

                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.45 }}
                                    className="bg-[#1a1a1a]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10"
                                >
                                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider text-green-400">Full License Sales</h3>
                                    {loading ? (
                                        <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <BarChart data={fullLicenseChartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                                                <Bar dataKey="licenses" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, email, or club..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 pl-12 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={filterPaid}
                    onChange={(e) => setFilterPaid(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="all">All Payment Status</option>
                    <option value="full">Full License</option>
                    <option value="temporary">Temp License</option>
                    <option value="unpaid">Unpaid</option>
                </select>

                <select
                    value={filterActive}
                    onChange={(e) => setFilterActive(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    <option value="all">All Visibility</option>
                    <option value="visible">Visible</option>
                    <option value="hidden">Hidden</option>
                </select>
                <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-padel-green focus:outline-none cursor-pointer"
                >
                    {regions.map(r => (
                        <option key={r} value={r}>{r}</option>
                    ))}
                </select>
            </div>

            {/* Players Table */}
            <div className="bg-[#1a1a1a]/30 rounded-2xl border border-white/10 overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-[#111827] text-gray-400 border-b border-white/10">
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Name</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">License</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Date Registered</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Status</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Last Activity</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Category</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Region</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Club</th>
                                <th className="py-3 px-4 font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Points</th>
                                <th className="py-3 px-4 text-right font-semibold text-xs uppercase sticky top-0 bg-[#111827]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="8" className="text-center py-12 text-gray-500">Loading...</td></tr>
                            ) : currentPlayers.length === 0 ? (
                                <tr><td colSpan="10" className="text-center py-12 text-gray-500">{loadError ? 'Player data could not be loaded. Use Retry above.' : 'No players match your filters'}</td></tr>
                            ) : (
                                currentPlayers.map(player => (
                                    <tr key={player.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        <td className="py-3 px-4 font-medium text-white">{player.name}</td>
                                        <td className="py-3 px-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`w-fit px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${player.paid_registration ? (player.license_type === 'full' ? 'bg-padel-green/20 text-padel-green' : 'bg-blue-500/20 text-blue-400') : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {player.paid_registration ? (player.license_type === 'full' ? 'Full' : 'Temp') : 'Unpaid'}
                                                </span>
                                                {player.license_type === 'temporary' && player.temporary_licenses?.[0] && (
                                                    <span className="text-[9px] text-blue-500 font-bold uppercase truncate max-w-[120px] block" title={player.temporary_licenses[0].event_name}>
                                                        {player.temporary_licenses[0].event_name}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-gray-400 text-xs font-bold">
                                                {player.created_at ? new Date(player.created_at).toLocaleDateString() : '—'}
                                            </span>
                                        </td>

                                        <td className="py-3 px-4">
                                            {player.approved !== false && player.paid_registration && player.license_type === 'full' ? (
                                                <span className="flex items-center gap-1 text-green-400 text-xs"><Eye size={12} /> Visible</span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-gray-500 text-xs"><EyeOff size={12} /> Hidden</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-gray-400 text-xs text-center block">
                                                {player.last_login ? new Date(player.last_login).toLocaleDateString() : 'Never'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-300 text-sm">{player.category || '—'}</td>
                                        <td className="py-3 px-4 text-gray-300 text-sm font-bold">{player.region || '—'}</td>
                                        <td className="py-3 px-4 text-gray-400 text-sm">{player.home_club || '—'}</td>
                                        <td className="py-3 px-4 text-padel-green font-mono">{player.points ?? 0}</td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex justify-end gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleResetPassword(player)}
                                                    title="Reset Password"
                                                    className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500 hover:text-white"
                                                >
                                                    <Key size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleTestLogin(player)}
                                                    title="Test Login (Impersonate)"
                                                    className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg hover:bg-amber-500 hover:text-black"
                                                >
                                                    <ShieldAlert size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleInvite(player)}
                                                    title="Send Login Invite"
                                                    className="p-1.5 bg-padel-green/10 text-padel-green rounded-lg hover:bg-padel-green hover:text-black"
                                                >
                                                    <Mail size={14} />
                                                </button>
                                                {canManageLicenses && <button
                                                    onClick={() => { window.location.href = `/admin?tab=licenses&player=${player.id}`; }}
                                                    title="Manage licenses"
                                                    className="p-1.5 bg-sky-500/10 text-sky-400 rounded-lg hover:bg-sky-500 hover:text-white"
                                                >
                                                    <Calendar size={14} />
                                                </button>}
                                                <button aria-label={`Edit ${player.name || 'player'}`} onClick={() => handleEdit(player)} className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500 hover:text-white">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => handleDelete(player.id)} className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-between items-center px-4 py-3 border-t border-white/5 bg-black/20">
                    <span className="text-sm text-gray-500">
                        Showing {filteredPlayers.length ? indexOfFirstItem + 1 : 0}–{Math.min(indexOfLastItem, filteredPlayers.length)} of {filteredPlayers.length}
                    </span>
                    {totalPages > 1 && (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 text-sm"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 text-sm"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {isEditing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            ref={editDialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-player-editor-title" tabIndex={-1}
                            className="bg-[#1a1a1a] w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center p-6 border-b border-white/10 sticky top-0 bg-[#1a1a1a] z-10">
                                <h3 id="admin-player-editor-title" className="text-xl font-bold text-white">{currentPlayer ? 'Edit Player' : 'New Player'}</h3>
                                <button type="button" aria-label="Close player editor" disabled={busy} onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-white disabled:opacity-40"><X size={24} /></button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6">
                                {formError && <p role="alert" className="mb-4 rounded-lg border border-red-400/30 p-3 text-sm text-red-300">{formError}</p>}
                                <fieldset disabled={savingPlayer} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {['name', 'rank_label', 'points', 'win_rate', 'age_group', 'category', 'region', 'level', 'nationality', 'contact_number', 'email', 'id_number', 'instagram_link'].map(field => (
                                        <div key={field}>
                                            <label htmlFor={`admin-player-${field}`} className="block text-gray-400 text-sm mb-1 capitalize">{field === 'id_number' ? 'ID number' : field === 'instagram_link' ? 'Instagram' : field.replace('_', ' ')}</label>
                                            {field === 'category' ? (
                                                <select
                                                    id={`admin-player-${field}`} name={field} value={formData[field] ?? ''}
                                                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none appearance-none cursor-pointer font-bold"
                                                >
                                                    <option value="">Select Category</option>
                                                    <optgroup label="Men's" className="bg-[#1a1a1a]">
                                                        <option value="Men's Open (Pro/Elite)">Men's Open (Pro/Elite)</option>
                                                        <option value="Men's Advanced">Men's Advanced</option>
                                                        <option value="Men's Intermediate">Men's Intermediate</option>
                                                        <option value="Men's 35+">Men's 35+</option>
                                                        <option value="Men's Juniors">Men's Juniors</option>
                                                    </optgroup>
                                                    <optgroup label="Ladies" className="bg-[#1a1a1a]">
                                                        <option value="Ladies Open (Pro/Elite)">Ladies Open (Pro/Elite)</option>
                                                        <option value="Ladies Advanced">Ladies Advanced</option>
                                                        <option value="Ladies Intermediate">Ladies Intermediate</option>
                                                        <option value="Ladies 35+">Ladies 35+</option>
                                                        <option value="Ladies Juniors">Ladies Juniors</option>
                                                    </optgroup>
                                                </select>
                                            ) : field === 'region' ? (
                                                <select
                                                    id={`admin-player-${field}`} name={field} value={formData[field] ?? ''}
                                                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none appearance-none cursor-pointer font-bold"
                                                >
                                                    <option value="">Select Region</option>
                                                    <option value="Eastern Cape">Eastern Cape</option>
                                                    <option value="Free State">Free State</option>
                                                    <option value="Gauteng">Gauteng</option>
                                                    <option value="KwaZulu-Natal">KwaZulu-Natal</option>
                                                    <option value="Limpopo">Limpopo</option>
                                                    <option value="Mpumalanga">Mpumalanga</option>
                                                    <option value="Northern Cape">Northern Cape</option>
                                                    <option value="North West">North West</option>
                                                    <option value="Western Cape">Western Cape</option>
                                                </select>
                                            ) : (
                                                <input
                                                    type={field === 'points' ? 'number' : field === 'email' ? 'email' : field === 'contact_number' ? 'tel' : 'text'}
                                                    id={`admin-player-${field}`} name={field} value={formData[field] ?? ''}
                                                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                                />
                                            )}
                                        </div>
                                    ))}
                                    <div>
                                        <label className="block text-gray-400 text-sm mb-1">Home Club</label>
                                        <div className="space-y-2">
                                            <SearchableSelect ariaLabel="Home club"
                                                options={loadingClubs ? [{ value: '', label: 'Loading clubs...' }] : [...clubs.map(c => ({ value: c.id, label: c.name })), { value: 'Other', label: 'Other (Type your own)' }]}
                                                value={formData.club_id || (formData.home_club ? 'Other' : '')}
                                                onChange={event => {
                                                    const value = event.target.value;
                                                    setFormData(previous => ({ ...previous, club_id: value, home_club: value !== 'Other' ? (clubs.find(club => club.id === value)?.name || '') : previous.home_club }));
                                                }}
                                                placeholder="Search clubs..."
                                            />
                                            {(formData.club_id === 'Other' || (!formData.club_id && formData.home_club)) && (
                                                <input
                                                    type="text"
                                                    value={formData.home_club}
                                                    onChange={e => setFormData({ ...formData, home_club: e.target.value })}
                                                    placeholder="Specify club name"
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                                    required
                                                />
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label htmlFor="admin-player-gender" className="block text-gray-400 text-sm mb-1">Gender</label>
                                        <select id="admin-player-gender" name="gender" value={formData.gender || ''} onChange={e => setFormData({ ...formData, gender: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none">
                                            <option value="">Select</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="admin-player-racket-brand" className="block text-gray-400 text-sm mb-1">Racket Brand</label>
                                        <div className="space-y-2">
                                            <select id="admin-player-racket-brand" name="racket_brand"
                                                value={['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux'].includes(formData.racket_brand) ? formData.racket_brand : (formData.racket_brand ? 'Other' : '')} 
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (val === 'Other') {
                                                        setFormData({ ...formData, racket_brand: 'Other' });
                                                    } else {
                                                        setFormData({ ...formData, racket_brand: val });
                                                    }
                                                }} 
                                                className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                            >
                                                <option value="">Select Brand</option>
                                                <option value="Adidas">Adidas</option>
                                                <option value="Babolat">Babolat</option>
                                                <option value="Bull Padel">Bull Padel</option>
                                                <option value="Nox">Nox</option>
                                                <option value="Varlion">Varlion</option>
                                                <option value="Oxdog">Oxdog</option>
                                                <option value="Wilson">Wilson</option>
                                                <option value="Head">Head</option>
                                                <option value="Siux">Siux</option>
                                                <option value="Other">Other</option>
                                            </select>
                                            {(formData.racket_brand === 'Other' || (!['Adidas', 'Babolat', 'Bull Padel', 'Nox', 'Varlion', 'Oxdog', 'Wilson', 'Head', 'Siux', ''].includes(formData.racket_brand))) && (
                                                <input
                                                    type="text"
                                                    value={formData.racket_brand === 'Other' ? '' : formData.racket_brand}
                                                    onChange={e => setFormData({ ...formData, racket_brand: e.target.value })}
                                                    placeholder="Specify brand"
                                                    className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none"
                                                    required
                                                />
                                            )}
                                        </div>
                                    </div>
                                    {[['playing_hand', 'Playing hand', PLAYING_HAND_OPTIONS], ['court_side', 'Court side', COURT_SIDE_OPTIONS]].map(([field, label, options]) => <div key={field}>
                                        <label htmlFor={`admin-player-${field}`} className="block text-gray-400 text-sm mb-1">{label}</label>
                                        <select id={`admin-player-${field}`} name={field} value={formData[field]} onChange={event => setFormData(previous => ({ ...previous, [field]: event.target.value }))} className="w-full min-h-11 bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">
                                            <option value="">Not specified</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                        </select>
                                    </div>)}
                                    <div className="md:col-span-2 space-y-4 rounded-xl border border-white/10 p-4">
                                        <h4 className="text-sm font-bold text-white">Private profile details</h4>
                                        {detailsLoading && <p role="status" className="text-sm text-gray-400">Loading private profile details…</p>}
                                        {detailsError && <div role="alert" className="text-sm text-red-300"><p>{detailsError}</p><button type="button" onClick={() => setDetailsRetry(value => value + 1)} className="mt-2 min-h-11 underline">Retry private details</button></div>}
                                        {!currentPlayer && <p className="text-sm text-gray-400">Save the new player first, then reopen their profile to add a birth date and Playtomic proof.</p>}
                                        {currentPlayer && detailsReady && !profileDetails?.date_of_birth && <p className="text-xs text-gray-400">No birth date is recorded. You can update other fields without adding one. A birth date is needed when adding Playtomic details.</p>}
                                        <fieldset disabled={!currentPlayer || !detailsReady || savingPlayer} className="min-w-0 space-y-4">
                                            <BirthDateField admin value={formData.date_of_birth} fallbackAge={currentPlayer?.age ?? null} required={Boolean(profileDetails?.date_of_birth || String(formData.playtomic_level).trim() || formData.playtomic_proof_path)} onChange={date => setFormData(previous => ({ ...previous, date_of_birth: date }))} />
                                            <PlayerProfileDetailsFields key={currentPlayer?.id || 'new'} admin playerId={currentPlayer?.id} value={formData} onChange={setFormData} onBusyChange={setProofUploading} disabled={!currentPlayer || !detailsReady || savingPlayer} />
                                        </fieldset>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="admin-player-sponsors" className="block text-gray-400 text-sm mb-1">Sponsors (comma separated)</label>
                                        <input id="admin-player-sponsors" name="sponsors" type="text" value={formData.sponsors || ''} onChange={e => setFormData({ ...formData, sponsors: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-gray-400 text-sm mb-2">Player Photo</label>
                                        <div className="flex flex-col sm:flex-row items-center gap-6 bg-black/40 p-6 rounded-2xl border border-white/10 group-hover:border-white/20 transition-all">
                                            {/* Profile Preview */}
                                            <div className="relative w-24 h-24 rounded-2xl overflow-hidden bg-gray-800 border-2 border-white/5 flex-shrink-0 group">
                                                {formData.image_url ? (
                                                    <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center opacity-30">
                                                        <ImageIcon size={32} />
                                                    </div>
                                                )}
                                                {uploadingImage && (
                                                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                                        <div className="w-6 h-6 border-2 border-padel-green border-t-transparent rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex-1 space-y-3 w-full">
                                                <div className="flex flex-wrap gap-2">
                                                    <label className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${uploadingImage ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-white text-black hover:bg-padel-green shadow-lg shadow-white/5'}`}>
                                                        <Upload size={14} />
                                                        {uploadingImage ? 'Uploading...' : 'Upload Photo'}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleImageUpload}
                                                            disabled={uploadingImage}
                                                            className="hidden"
                                                        />
                                                    </label>

                                                    {formData.image_url && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, image_url: '' })}
                                                            className="px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="relative">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-500 uppercase">URL</span>
                                                    <input
                                                        type="text"
                                                        name="image_url" aria-label="Player photo URL" placeholder="Or paste external image URL..."
                                                        value={formData.image_url || ''}
                                                        onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                                                        className="w-full bg-black/40 border border-white/5 rounded-lg pl-12 pr-4 py-2 text-[11px] text-gray-400 focus:text-white focus:border-padel-green transition-all outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2 space-y-3">
                                        <h4 className="text-sm font-bold text-white">Gallery photos <span className="font-normal text-gray-400">{formData.additional_images.length} / 5</span></h4>
                                        <p className="text-xs text-gray-400">These photos appear on the player’s profile. Save to apply additions or removals.</p>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{formData.additional_images.map((url, index) => <div key={`${url}-${index}`} className="space-y-1">
                                            <img src={url} alt={`Player gallery photo ${index + 1}`} width={200} height={150} className="h-28 w-full rounded-lg object-cover border border-white/10" />
                                            <button type="button" aria-label={`Remove gallery photo ${index + 1}`} disabled={uploadingGallery} onClick={() => setFormData(previous => ({ ...previous, additional_images: previous.additional_images.filter((_, position) => position !== index) }))} className="min-h-11 text-sm text-gray-300 underline">Remove photo</button>
                                        </div>)}</div>
                                        {formData.additional_images.length < 5 && <label className="block text-sm text-gray-400">Add gallery photos
                                            <input name="gallery_photos" type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={handleGalleryUpload} className="mt-2 block w-full min-h-11 rounded-lg border border-white/20 p-2 text-sm text-white file:mr-3 file:rounded file:border-0 file:bg-white file:px-3 file:py-2 file:text-black" />
                                        </label>}
                                        {uploadingGallery && <p role="status" className="text-sm text-padel-green">Uploading gallery photos…</p>}
                                    </div>
                                    <div className="md:col-span-2">
                                        <label htmlFor="admin-player-bio" className="block text-gray-400 text-sm mb-1">Bio</label>
                                        <textarea id="admin-player-bio" name="bio" value={formData.bio || ''} onChange={e => setFormData({ ...formData, bio: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded-lg px-4 py-2 text-white focus:border-padel-green outline-none" rows="3" />
                                    </div>
                                    <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center gap-6 bg-black/20 p-4 rounded-xl border border-white/5">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={formData.approved}
                                                onChange={e => setFormData({ ...formData, approved: e.target.checked })}
                                                className="w-5 h-5 rounded border-white/20 bg-black text-padel-green focus:ring-padel-green cursor-pointer"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-sm group-hover:text-padel-green transition-colors">Approved</span>
                                                <span className="text-gray-500 text-[10px] uppercase">Account status</span>
                                            </div>
                                        </label>

                                        <div className="h-8 w-px bg-white/10 hidden sm:block" />

                                        <div className="flex-1 w-full sm:w-auto">
                                            {canManageLicenses ? <a className="inline-block px-4 py-3 rounded-xl border border-padel-green/30 text-padel-green text-sm" href={`/admin?tab=licenses&player=${formData.id || ''}`}>Manage licenses</a> : <p className="text-sm text-gray-400">A Licenses administrator can manage this player’s coverage.</p>}
                                        </div>
                                    </div>
                                </fieldset>
                                <div className="flex gap-3 justify-end pt-4 border-t border-white/10">
                                    <button type="button" disabled={busy} onClick={() => setIsEditing(false)} className="bg-gray-700 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-600">Cancel</button>
                                    <button type="submit" disabled={busy || Boolean(currentPlayer && !detailsReady)} className="bg-padel-green text-black px-6 py-2 rounded-lg font-bold hover:bg-white disabled:opacity-40">{savingPlayer ? 'Saving…' : 'Save'}</button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}

                {resetPasswordPlayer && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#1a1a1a] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl"
                        >
                            <div className="flex justify-between items-center p-6 border-b border-white/10">
                                <h3 className="text-xl font-bold text-white">Reset Password</h3>
                                <button onClick={() => setResetPasswordPlayer(null)} className="text-gray-400 hover:text-white"><X size={24} /></button>
                            </div>
                            <form onSubmit={submitPasswordReset} className="p-6">
                                <p className="text-sm text-gray-400 mb-4">
                                    Manually set a new password for <strong className="text-white">{resetPasswordPlayer.name}</strong>. They will use this new password to log in.
                                </p>
                                <div className="mb-6">
                                    <label className="block text-gray-400 text-sm mb-2 font-medium">New Password</label>
                                    <input
                                        type="text"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="e.g. Padel@2026!"
                                        className="w-full bg-black/50 border border-white/20 rounded-xl px-4 py-3 text-white focus:border-padel-green outline-none"
                                        required
                                        minLength={6}
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Must include: uppercase, lowercase, number, and special character.
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button type="button" onClick={() => setResetPasswordPlayer(null)} className="px-5 py-2.5 rounded-xl font-bold text-white hover:bg-white/5 transition-colors">
                                        Cancel
                                    </button>
                                    <button disabled={resetLoading} type="submit" className="px-5 py-2.5 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-400 transition-colors disabled:opacity-50 flex items-center gap-2">
                                        {resetLoading ? 'Saving...' : <><Key size={16} /> Set Password</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PlayerManager;
