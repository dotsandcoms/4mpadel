import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Building, Mail, Phone, Globe, X, Send, ShieldAlert, Sparkles, Upload, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';

const ApplyOrganisationModal = ({ isOpen, onClose, playerProfile, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '',
        contact_email: playerProfile?.email || '',
        contact_phone: playerProfile?.contact_number || '',
        logo_url: '',
        website_url: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    if (!isOpen) return null;

    const handleLogoUpload = async (event) => {
        try {
            setUploadingLogo(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select a logo image.');
            }
            const file = event.target.files[0];
            
            // Limit to 2MB
            if (file.size > 2 * 1024 * 1024) {
                throw new Error('Logo file size must be less than 2MB.');
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `logo_${Date.now()}.${fileExt}`;
            const filePath = `organizations/logos/${fileName}`;

            // Upload to Supabase Storage public bucket 'profile-pics'
            let { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            // Resolve Public URL
            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                setFormData(prev => ({ ...prev, logo_url: publicUrlData.publicUrl }));
                toast.success('Logo uploaded successfully! 🎨');
            }

        } catch (error) {
            toast.error(`Upload Failed: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = () => {
        setFormData(prev => ({ ...prev, logo_url: '' }));
        toast.info('Logo removed.');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            toast.error('Please specify the Organisation Name.');
            return;
        }
        if (!formData.contact_email.trim()) {
            toast.error('Please specify a contact email.');
            return;
        }

        setSubmitting(true);
        try {
            // A. Create clean, URL-friendly slug from Organisation Name
            const slug = formData.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            // B. Write to database with status 'pending'
            const { data, error } = await supabase
                .from('organizations')
                .insert({
                    name: formData.name.trim(),
                    slug: slug,
                    contact_email: formData.contact_email.trim(),
                    contact_phone: formData.contact_phone.trim(),
                    logo_url: formData.logo_url.trim() || null,
                    website_url: formData.website_url.trim() || null,
                    created_by: playerProfile?.id || null,
                    status: 'pending'
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('An organisation with this name already exists.');
                }
                throw error;
            }

            toast.success('Application submitted successfully! 🏢');

            // C. Fire secure emails in parallel (Non-blocking)
            // 1. Alert to Host Applicant
            sendEmail(formData.contact_email.trim(), 'org_applied', {
                orgName: formData.name.trim(),
                contactEmail: formData.contact_email.trim()
            });

            // 2. Alert to Super Admin (brad@dotsandcoms.co.za or admin@4mpadel.co.za)
            sendEmail('admin@4mpadel.co.za', 'admin_org_applied', {
                orgName: formData.name.trim(),
                creatorName: playerProfile?.name || 'Unknown Player',
                contactEmail: formData.contact_email.trim(),
                contactPhone: formData.contact_phone.trim()
            });

            // Trigger parent state refetch
            if (onSuccess) onSuccess();

            // Close modal
            onClose();

        } catch (err) {
            console.error('Organisation Application failed:', err);
            toast.error(`Application Failed: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="max-w-lg w-full bg-[#0F172A]/90 border border-white/10 rounded-3xl p-6 md:p-8 relative shadow-2xl overflow-hidden shadow-padel-green/5"
            >
                {/* Visual Glass Accents */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full" />
                <div className="absolute bottom-0 left-0 w-32 h-32 bg-padel-green/5 blur-3xl rounded-full" />

                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-padel-green/10 text-padel-green rounded-2xl flex items-center justify-center shrink-0">
                        <Building size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            Host Tournaments <Sparkles size={16} className="text-padel-green animate-pulse" />
                        </h2>
                        <p className="text-gray-400 text-xs">Apply to become a sanctioned organisation on 4M Padel</p>
                    </div>
                </div>

                <div className="bg-black/20 border border-white/5 rounded-2xl p-4 mb-6 flex items-start gap-3">
                    <ShieldAlert className="text-padel-green w-5 h-5 shrink-0 mt-0.5" />
                    <p className="text-gray-400 text-xs leading-relaxed">
                        Approved organisations are granted a **dedicated Organisation Portal** to create sanctioned tournaments, configure draws, schedule court slots, and manage live brackets. Applications are reviewed within 24–48 hours.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 text-left">
                    {/* Club Name */}
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Organisation / Club Name</label>
                        <div className="relative">
                            <Building size={16} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                required
                                value={formData.name}
                                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors placeholder:text-gray-600"
                                placeholder="Cape Town Padel Club"
                            />
                        </div>
                    </div>

                    {/* Contact Email */}
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Business Email</label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-500" />
                            <input
                                type="email"
                                required
                                value={formData.contact_email}
                                onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors"
                            />
                        </div>
                    </div>

                    {/* Contact Phone */}
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Contact Phone</label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-500" />
                            <input
                                type="tel"
                                value={formData.contact_phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors placeholder:text-gray-600"
                                placeholder="+27 82 123 4567"
                            />
                        </div>
                    </div>

                    {/* Club Logo Upload */}
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Club Logo <span className="text-[9px] text-gray-500 font-normal">(Optional)</span></label>
                        {formData.logo_url ? (
                            <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                                <img 
                                    src={formData.logo_url} 
                                    alt="Club Logo" 
                                    className="w-14 h-14 object-cover rounded-xl border border-white/10" 
                                />
                                <div className="flex-1">
                                    <span className="text-xs text-white font-bold block truncate">logo_uploaded.png</span>
                                    <button 
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        className="text-[10px] text-red-400 font-extrabold uppercase tracking-wider mt-1 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                                    >
                                        <Trash2 size={12} /> Remove Image
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <label className="flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl p-6 cursor-pointer group transition-all">
                                <div className="flex flex-col items-center justify-center text-center">
                                    {uploadingLogo ? (
                                        <>
                                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green mb-2" />
                                            <span className="text-xs text-gray-400">Uploading logo to Supabase...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 text-gray-500 group-hover:text-padel-green mb-2 transition-colors" />
                                            <span className="text-xs text-gray-300 font-bold group-hover:text-white transition-colors">Select Club Logo</span>
                                            <span className="text-[10px] text-gray-500 mt-1">PNG, JPG (max 2MB)</span>
                                        </>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={uploadingLogo}
                                    onChange={handleLogoUpload}
                                    className="hidden"
                                />
                            </label>
                        )}
                    </div>

                    {/* Club Website URL */}
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Club Website URL <span className="text-[9px] text-gray-500 font-normal">(Optional)</span></label>
                        <div className="relative">
                            <Globe size={16} className="absolute left-4 top-[50%] -translate-y-1/2 text-gray-500" />
                            <input
                                type="url"
                                value={formData.website_url}
                                onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 focus:outline-none focus:border-padel-green text-sm transition-colors placeholder:text-gray-600"
                                placeholder="https://myclub.co.za"
                            />
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer"
                        >
                            <Send size={14} />
                            {submitting ? 'Submitting Application...' : 'Submit Application'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default ApplyOrganisationModal;
