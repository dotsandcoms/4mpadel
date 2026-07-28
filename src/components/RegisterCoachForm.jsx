import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UploadCloud, CheckCircle2, ChevronRight, ChevronLeft, Loader2, X, MapPin,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useClubs } from '../hooks/useClubs';
import { toast } from 'sonner';

const MAX_COACH_CLUBS = 3;

const resizeImage = (file, maxWidth = 800, quality = 0.8) => new Promise((resolve, reject) => {
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
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })),
                'image/jpeg',
                quality,
            );
        };
        img.onerror = reject;
    };
    reader.onerror = reject;
});

/**
 * Format selected club names for the existing coaching_location text column.
 * @param {string[]} names
 */
const formatCoachingLocation = (names) => names.filter(Boolean).join(' · ');

const RegisterCoachForm = ({ onBack, onClose }) => {
    const { clubs, loadingClubs } = useClubs();
    const [currentStep, setCurrentStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        contact_number: '',
        bio: '',
        city: '',
        website_link: '',
        instagram_link: '',
        youtube_link: '',
        gender: '',
    });
    const [selectedClubs, setSelectedClubs] = useState([]);
    const [clubQuery, setClubQuery] = useState('');
    const [clubOpen, setClubOpen] = useState(false);
    const [profilePic, setProfilePic] = useState(null);
    const [profilePicPreview, setProfilePicPreview] = useState(null);

    const selectedKeys = useMemo(
        () => new Set(selectedClubs.map((c) => String(c.name || '').toLowerCase())),
        [selectedClubs],
    );

    const filteredClubs = useMemo(() => {
        const q = clubQuery.trim().toLowerCase();
        return clubs.filter((c) => {
            if (selectedKeys.has(String(c.name || '').toLowerCase())) return false;
            if (!q) return true;
            return String(c.name || '').toLowerCase().includes(q);
        });
    }, [clubs, clubQuery, selectedKeys]);

    const addClub = (club) => {
        if (!club?.name) return;
        setSelectedClubs((prev) => {
            if (prev.length >= MAX_COACH_CLUBS) {
                toast.error(`You can select up to ${MAX_COACH_CLUBS} clubs.`);
                return prev;
            }
            if (prev.some((c) => c.id === club.id || c.name.toLowerCase() === club.name.toLowerCase())) {
                return prev;
            }
            return [...prev, { id: club.id, name: club.name }];
        });
        setClubQuery('');
        setClubOpen(false);
    };

    const removeClub = (name) => {
        const key = String(name || '').toLowerCase();
        setSelectedClubs((prev) => prev.filter((c) => c.name.toLowerCase() !== key));
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProfilePic(file);
            setProfilePicPreview(URL.createObjectURL(file));
        }
    };

    const handleNext = () => {
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.contact_number || !formData.gender) {
            toast.error('Please fill in all required fields.');
            return;
        }
        setCurrentStep(2);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.bio || !formData.city || selectedClubs.length === 0 || !profilePic) {
            toast.error('Please complete your bio, city, at least one club, and profile picture.');
            return;
        }

        setIsSubmitting(true);
        try {
            let profilePicUrl = '';

            if (profilePic) {
                const resizedFile = await resizeImage(profilePic);
                const fullName = `${formData.firstName} ${formData.lastName}`.trim();
                const fileName = `${fullName.replace(/\s+/g, '-').toLowerCase()}_${Date.now()}.jpg`;

                const { error: uploadError } = await supabase.storage
                    .from('coach-profiles')
                    .upload(fileName, resizedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('coach-profiles')
                    .getPublicUrl(fileName);

                profilePicUrl = publicUrl;
            }

            const { error: dbError } = await supabase
                .from('coach_applications')
                .insert([{
                    full_name: `${formData.firstName} ${formData.lastName}`.trim(),
                    email: formData.email,
                    contact_number: formData.contact_number,
                    bio: formData.bio,
                    profile_pic_url: profilePicUrl,
                    city: formData.city,
                    coaching_location: formatCoachingLocation(selectedClubs.map((c) => c.name)),
                    website_link: formData.website_link,
                    instagram_link: formData.instagram_link,
                    youtube_link: formData.youtube_link,
                    gender: formData.gender,
                    status: 'pending',
                }]);

            if (dbError) throw dbError;

            setIsSuccess(true);
            toast.success('Coach application submitted!');
        } catch (error) {
            console.error('Error submitting coach application:', error);
            toast.error('Failed to submit application. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="text-center py-4">
                <div className="w-16 h-16 bg-padel-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="w-8 h-8 text-padel-green" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Application Received!</h3>
                <p className="text-gray-400 text-sm mb-6">
                    Thank you for applying to be a 4M Padel Approved Coach. Our team will review your application shortly.
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl hover:bg-white transition-all cursor-pointer"
                >
                    Done
                </button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    className="flex items-center gap-1.5 text-gray-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
                >
                    <ChevronLeft size={14} /> Back to registration options
                </button>
            )}

            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                <span className={currentStep === 1 ? 'text-padel-green' : 'text-gray-500'}>Step 1: Personal</span>
                <span className={currentStep === 2 ? 'text-padel-green' : 'text-gray-500'}>Step 2: Coach Details</span>
            </div>

            <AnimatePresence mode="wait">
                {currentStep === 1 ? (
                    <motion.div
                        key="coach-step-1"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        className="space-y-3"
                    >
                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="text"
                                name="firstName"
                                required
                                value={formData.firstName}
                                onChange={handleInputChange}
                                placeholder="First Name"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
                            <input
                                type="text"
                                name="lastName"
                                required
                                value={formData.lastName}
                                onChange={handleInputChange}
                                placeholder="Surname"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
                        </div>
                        <input
                            type="email"
                            name="email"
                            required
                            value={formData.email}
                            onChange={handleInputChange}
                            placeholder="Email Address"
                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                        />
                        <input
                            type="tel"
                            name="contact_number"
                            required
                            value={formData.contact_number}
                            onChange={handleInputChange}
                            placeholder="Contact Number"
                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                        />
                        <select
                            name="gender"
                            required
                            value={formData.gender}
                            onChange={handleInputChange}
                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green appearance-none cursor-pointer"
                        >
                            <option value="" disabled className="bg-[#1a1a1a]">Select Gender</option>
                            <option value="Male" className="bg-[#1a1a1a]">Male</option>
                            <option value="Female" className="bg-[#1a1a1a]">Female</option>
                        </select>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="w-full bg-padel-green text-black font-black uppercase tracking-widest text-xs py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all cursor-pointer"
                        >
                            Next Step <ChevronRight size={14} />
                        </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="coach-step-2"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        className="space-y-3"
                    >
                        <div className="relative border-2 border-dashed border-white/20 hover:border-white/40 bg-black/30 rounded-xl p-4 text-center">
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            {profilePicPreview ? (
                                <div className="flex flex-col items-center">
                                    <img src={profilePicPreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-padel-green mb-2" />
                                    <span className="text-xs text-padel-green font-bold">Change Image</span>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center py-2 text-gray-400">
                                    <UploadCloud size={24} className="text-padel-green mb-2" />
                                    <p className="text-xs font-bold text-white">Upload profile picture</p>
                                </div>
                            )}
                        </div>

                        <textarea
                            name="bio"
                            required
                            rows={3}
                            value={formData.bio}
                            onChange={handleInputChange}
                            placeholder="Bio — experience and coaching philosophy..."
                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-padel-green resize-none"
                        />

                        <input
                            type="text"
                            name="city"
                            required
                            value={formData.city}
                            onChange={handleInputChange}
                            placeholder="City"
                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                        />

                        <div className="relative">
                            <div className="flex items-center justify-between mb-1.5 px-0.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                    Clubs you coach at
                                </label>
                                <span className="text-[10px] font-bold text-gray-500">
                                    {selectedClubs.length}/{MAX_COACH_CLUBS}
                                </span>
                            </div>

                            {selectedClubs.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {selectedClubs.map((club) => (
                                        <span
                                            key={club.id || club.name}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-padel-green/40 bg-padel-green/10 text-padel-green px-2.5 py-1 text-xs font-semibold"
                                        >
                                            <MapPin size={11} className="shrink-0 opacity-80" />
                                            {club.name}
                                            <button
                                                type="button"
                                                onClick={() => removeClub(club.name)}
                                                className="rounded-full p-0.5 hover:bg-white/10 text-padel-green/80 hover:text-white border-0 bg-transparent cursor-pointer"
                                                aria-label={`Remove ${club.name}`}
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <input
                                value={clubQuery}
                                onChange={(e) => {
                                    setClubQuery(e.target.value);
                                    setClubOpen(true);
                                }}
                                onFocus={() => setClubOpen(true)}
                                onBlur={() => setTimeout(() => setClubOpen(false), 150)}
                                placeholder={
                                    selectedClubs.length >= MAX_COACH_CLUBS
                                        ? 'Maximum of 3 clubs selected'
                                        : loadingClubs
                                            ? 'Loading clubs…'
                                            : 'Search and select a club'
                                }
                                disabled={selectedClubs.length >= MAX_COACH_CLUBS || loadingClubs}
                                autoComplete="off"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green disabled:opacity-50"
                            />
                            <p className="text-[11px] text-gray-500 mt-1.5 px-0.5">
                                Select up to {MAX_COACH_CLUBS} clubs where you coach.
                            </p>

                            {clubOpen && selectedClubs.length < MAX_COACH_CLUBS && (filteredClubs.length > 0 || clubQuery.trim()) && (
                                <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded-xl max-h-52 overflow-y-auto shadow-xl">
                                    {filteredClubs.slice(0, 40).map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => addClub(c)}
                                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-padel-green hover:text-black transition-colors border-0 bg-transparent cursor-pointer"
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                    {filteredClubs.length === 0 && (
                                        <p className="px-4 py-3 text-xs text-gray-500">No matching clubs found.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        <input
                            type="url"
                            name="website_link"
                            value={formData.website_link}
                            onChange={handleInputChange}
                            placeholder="Website (optional)"
                            className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="url"
                                name="instagram_link"
                                value={formData.instagram_link}
                                onChange={handleInputChange}
                                placeholder="Instagram (optional)"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
                            <input
                                type="url"
                                name="youtube_link"
                                value={formData.youtube_link}
                                onChange={handleInputChange}
                                placeholder="YouTube (optional)"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => setCurrentStep(1)}
                                className="flex-1 border border-white/10 text-gray-300 font-bold text-xs py-3.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-[2] bg-padel-green text-black font-black uppercase tracking-widest text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-white transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" /> Submitting...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={14} /> Submit Application
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </form>
    );
};

export default RegisterCoachForm;
