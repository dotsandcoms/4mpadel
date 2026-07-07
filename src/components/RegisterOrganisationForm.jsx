import React, { useState } from 'react';
import {
    Building, Mail, Phone, Globe, Send, Loader2, ChevronLeft,
    ShieldAlert, Upload, Trash2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { sendEmail } from '../utils/emails';
import { toast } from 'sonner';

const RegisterOrganisationForm = ({
    onBack,
    onClose,
    onSuccess,
    playerProfile = null,
    contactEmail = '',
    contactPhone = '',
    compact = false,
}) => {
    const [formData, setFormData] = useState({
        name: '',
        contact_email: playerProfile?.email || contactEmail,
        contact_phone: playerProfile?.contact_number || contactPhone,
        logo_url: '',
        website_url: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);

    const handleLogoUpload = async (event) => {
        try {
            setUploadingLogo(true);
            if (!event.target.files || event.target.files.length === 0) {
                throw new Error('You must select a logo image.');
            }
            const file = event.target.files[0];

            if (file.size > 2 * 1024 * 1024) {
                throw new Error('Logo file size must be less than 2MB.');
            }

            const fileExt = file.name.split('.').pop();
            const fileName = `logo_${Date.now()}.${fileExt}`;
            const filePath = `organizations/logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('profile-pics')
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('profile-pics')
                .getPublicUrl(filePath);

            if (publicUrlData) {
                setFormData((prev) => ({ ...prev, logo_url: publicUrlData.publicUrl }));
                toast.success('Logo uploaded successfully!');
            }
        } catch (error) {
            toast.error(`Upload Failed: ${error.message}`);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleRemoveLogo = () => {
        setFormData((prev) => ({ ...prev, logo_url: '' }));
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
            const slug = formData.name
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');

            const { error } = await supabase
                .from('organizations')
                .insert({
                    name: formData.name.trim(),
                    slug,
                    contact_email: formData.contact_email.trim(),
                    contact_phone: formData.contact_phone.trim() || null,
                    logo_url: formData.logo_url.trim() || null,
                    website_url: formData.website_url.trim() || null,
                    created_by: playerProfile?.id || null,
                    status: 'pending',
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('An organisation with this name already exists.');
                }
                throw error;
            }

            toast.success('Application submitted successfully!');

            sendEmail(formData.contact_email.trim(), 'org_applied', {
                orgName: formData.name.trim(),
                contactEmail: formData.contact_email.trim(),
            });

            sendEmail('admin@4mpadel.co.za', 'admin_org_applied', {
                orgName: formData.name.trim(),
                creatorName: playerProfile?.name || 'New Applicant',
                contactEmail: formData.contact_email.trim(),
                contactPhone: formData.contact_phone.trim(),
            });

            onSuccess?.();
            onClose?.();
        } catch (err) {
            console.error('Organisation application failed:', err);
            toast.error(err.message || 'Application failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const fieldClass = compact
        ? 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-padel-green transition-colors'
        : 'w-full bg-black/40 border border-white/10 text-white rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:border-padel-green transition-colors';

    return (
        <form onSubmit={handleSubmit} className={`text-left ${compact ? 'space-y-3' : 'space-y-4'}`}>
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                    <ChevronLeft size={14} /> Back to registration options
                </button>
            )}

            <div className={`bg-black/20 border border-white/5 rounded-xl flex items-start gap-2.5 ${compact ? 'p-3' : 'p-4 rounded-2xl gap-3'}`}>
                <ShieldAlert className={`text-padel-green shrink-0 mt-0.5 ${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                <p className={`text-gray-400 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'}`}>
                    Approved organisations are granted a dedicated Organisation Portal to create sanctioned tournaments, configure draws, schedule court slots, and manage live brackets. Applications are reviewed within 24–48 hours.
                </p>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Organisation / Club Name</label>
                <div className="relative">
                    <Building size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                        className={`${fieldClass} placeholder:text-gray-600`}
                        placeholder="Cape Town Padel Club"
                    />
                </div>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Business Email</label>
                <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="email"
                        required
                        value={formData.contact_email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contact_email: e.target.value }))}
                        className={fieldClass}
                    />
                </div>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>Contact Phone</label>
                <div className="relative">
                    <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="tel"
                        value={formData.contact_phone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contact_phone: e.target.value }))}
                        className={`${fieldClass} placeholder:text-gray-600`}
                        placeholder="+27 82 123 4567"
                    />
                </div>
            </div>

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    Club Logo <span className="text-[9px] text-gray-500 font-normal">(Optional)</span>
                </label>
                {formData.logo_url ? (
                    <div className="flex items-center gap-4 bg-black/40 border border-white/10 p-3.5 rounded-xl">
                        <img
                            src={formData.logo_url}
                            alt="Club logo"
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
                    <label className={`flex flex-col items-center justify-center border border-dashed border-white/15 bg-black/20 hover:border-padel-green/30 hover:bg-black/40 rounded-xl cursor-pointer group transition-all ${compact ? 'p-4' : 'p-5'}`}>
                        <div className="flex flex-col items-center justify-center text-center">
                            {uploadingLogo ? (
                                <>
                                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-padel-green mb-2" />
                                    <span className="text-xs text-gray-400">Uploading logo...</span>
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

            <div>
                <label className={`block text-gray-400 font-bold uppercase tracking-wider mb-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}>
                    Club Website URL <span className="text-[9px] text-gray-500 font-normal">(Optional)</span>
                </label>
                <div className="relative">
                    <Globe size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                        type="url"
                        value={formData.website_url}
                        onChange={(e) => setFormData((prev) => ({ ...prev, website_url: e.target.value }))}
                        className={`${fieldClass} placeholder:text-gray-600`}
                        placeholder="https://myclub.co.za"
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={submitting}
                className={`w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(154,233,0,0.3)] hover:scale-[1.01] transition-all disabled:opacity-50 cursor-pointer ${compact ? 'py-3.5' : 'py-4'}`}
            >
                {submitting ? (
                    <>
                        <Loader2 size={14} className="animate-spin" /> Submitting Application...
                    </>
                ) : (
                    <>
                        <Send size={14} /> Submit Application
                    </>
                )}
            </button>
        </form>
    );
};

export default RegisterOrganisationForm;
