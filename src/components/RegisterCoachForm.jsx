import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    UploadCloud, CheckCircle2, ChevronRight, ChevronLeft, Loader2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

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

const RegisterCoachForm = ({ onBack, onClose }) => {
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
        coaching_location: '',
        website_link: '',
        instagram_link: '',
        youtube_link: '',
        gender: '',
    });
    const [profilePic, setProfilePic] = useState(null);
    const [profilePicPreview, setProfilePicPreview] = useState(null);

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

        if (!formData.bio || !formData.city || !formData.coaching_location || !profilePic) {
            toast.error('Please complete your bio, location, city, and profile picture.');
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
                    coaching_location: formData.coaching_location,
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

                        <div className="grid grid-cols-2 gap-3">
                            <input
                                type="text"
                                name="city"
                                required
                                value={formData.city}
                                onChange={handleInputChange}
                                placeholder="City"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
                            <input
                                type="text"
                                name="coaching_location"
                                required
                                value={formData.coaching_location}
                                onChange={handleInputChange}
                                placeholder="Coaching location"
                                className="w-full bg-black/50 border border-white/10 rounded-xl py-3 px-4 text-white text-sm focus:outline-none focus:border-padel-green"
                            />
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
