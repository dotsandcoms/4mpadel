import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, CheckCircle2, ChevronRight, ChevronLeft, Loader2, User, Mail, Phone, MapPin, Instagram, Youtube, FileText, ExternalLink } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';

const steps = [
    { id: 1, title: 'Personal Info' },
    { id: 2, title: 'Coach Details' }
];

const CoachRegistration = () => {
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
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProfilePic(file);
            setProfilePicPreview(URL.createObjectURL(file));
        }
    };

    // Client-side image resizing
    const resizeImage = (file, maxWidth = 800, quality = 0.8) => {
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

    const handleNext = () => {
        // Basic Validation for Step 1
        if (!formData.firstName || !formData.lastName || !formData.email || !formData.contact_number) {
            toast.error('Please fill in all required fields in Step 1.');
            return;
        }
        setCurrentStep(2);
    };

    const handlePrev = () => {
        setCurrentStep(1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Basic validation for Step 2
        if (!formData.bio || !formData.coaching_location || !profilePic) {
            toast.error('Please complete the bio, location, and upload a profile picture.');
            return;
        }

        try {
            setIsSubmitting(true);
            let profilePicUrl = '';

            // Handle Image Upload
            if (profilePic) {
                const resizedFile = await resizeImage(profilePic);
                const fileExt = 'jpg';
                const fileName = `${formData.full_name.replace(/\s+/g, '-').toLowerCase()}_${Date.now()}.${fileExt}`;
                const filePath = `${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('coach-profiles')
                    .upload(filePath, resizedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('coach-profiles')
                    .getPublicUrl(filePath);

                profilePicUrl = publicUrl;
            }

            // Save to Database
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
                    status: 'pending'
                }]);

            if (dbError) throw dbError;

            setIsSuccess(true);
            toast.success('Application submitted successfully!');

        } catch (error) {
            console.error('Error submitting application:', error);
            toast.error('Failed to submit application. Please try again later.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen pt-32 bg-[#0A0D14] flex items-center justify-center -mt-20">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-[#1E293B]/50 backdrop-blur-md p-8 rounded-2xl border border-padel-green/30 text-center mx-4"
                >
                    <div className="w-20 h-20 bg-padel-green/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <CheckCircle2 className="w-10 h-10 text-padel-green" />
                    </div>
                    <h2 className="text-3xl font-bold text-white mb-4">Application Received!</h2>
                    <p className="text-gray-400 mb-8">
                        Thank you for applying to be a 4M Padel Approved Coach. Our team will review your application and get back to you shortly.
                    </p>
                    <button
                        onClick={() => window.location.href = '/'}
                        className="bg-white text-black font-bold px-8 py-4 rounded-xl hover:bg-padel-green transition-colors w-full"
                    >
                        Return Home
                    </button>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pt-32 pb-20 bg-[#0A0D14] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-padel-green/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-1/2 right-0 w-[400px] h-[400px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">

                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 uppercase">
                        Coach <span className="text-padel-green">Registration</span>
                    </h1>
                    <p className="text-gray-400">Join our network of approved 4M Padel coaches.</p>
                </div>

                {/* Progress Bar */}
                <div className="mb-12">
                    <div className="flex justify-between relative">
                        {/* Connecting Line */}
                        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/10 -z-10 -translate-y-1/2" />

                        {steps.map((step) => {
                            const isCompleted = currentStep > step.id;
                            const isActive = currentStep === step.id;

                            return (
                                <div key={step.id} className="flex flex-col items-center">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-300 ${isCompleted
                                            ? 'bg-padel-green text-black'
                                            : isActive
                                                ? 'bg-white border-2 border-padel-green text-black'
                                                : 'bg-[#1E293B] border border-white/20 text-gray-500'
                                            }`}
                                    >
                                        {isCompleted ? <CheckCircle2 className="w-6 h-6" /> : step.id}
                                    </div>
                                    <span className={`mt-3 text-sm font-medium ${isActive || isCompleted ? 'text-white' : 'text-gray-500'}`}>
                                        {step.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Form Container */}
                <div className="bg-[#1E293B]/40 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl">
                    <form onSubmit={handleSubmit}>

                        <AnimatePresence mode="wait">
                            {/* Step 1: Personal Info */}
                            {currentStep === 1 && (
                                <motion.div
                                    key="step1"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <User size={16} className="text-padel-green" /> Name *
                                                </label>
                                                <input
                                                    type="text"
                                                    name="firstName"
                                                    required
                                                    value={formData.firstName}
                                                    onChange={handleInputChange}
                                                    placeholder="John"
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <User size={16} className="text-padel-green" /> Surname *
                                                </label>
                                                <input
                                                    type="text"
                                                    name="lastName"
                                                    required
                                                    value={formData.lastName}
                                                    onChange={handleInputChange}
                                                    placeholder="Doe"
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                <Mail size={16} className="text-padel-green" /> Email Address *
                                            </label>
                                            <input
                                                type="email"
                                                name="email"
                                                required
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                placeholder="john@example.com"
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                <Phone size={16} className="text-padel-green" /> Contact Number *
                                            </label>
                                            <input
                                                type="tel"
                                                name="contact_number"
                                                required
                                                value={formData.contact_number}
                                                onChange={handleInputChange}
                                                placeholder="+27 82 123 4567"
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                <User size={16} className="text-padel-green" /> Gender *
                                            </label>
                                            <select
                                                name="gender"
                                                required
                                                value={formData.gender}
                                                onChange={handleInputChange}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled className="bg-[#1E293B]">Select Gender</option>
                                                <option value="Male" className="bg-[#1E293B]">Male</option>
                                                <option value="Female" className="bg-[#1E293B]">Female</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="pt-6 mt-6 border-t border-white/10 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleNext}
                                            className="flex items-center gap-2 bg-white text-black font-bold px-8 py-4 rounded-xl hover:bg-padel-green transition-all"
                                        >
                                            Next Step <ChevronRight size={20} />
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* Step 2: Coach Details */}
                            {currentStep === 2 && (
                                <motion.div
                                    key="step2"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.3 }}
                                    className="space-y-6"
                                >
                                    {/* Image Upload Zone */}
                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2">Profile Picture *</label>
                                        <div className="relative border-2 border-dashed border-white/20 hover:border-white/40 bg-black/30 rounded-2xl p-6 transition-colors text-center group overflow-hidden">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleFileChange}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                            />

                                            {profilePicPreview ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-padel-green shadow-xl mb-4 relative z-10">
                                                        <img src={profilePicPreview} alt="Preview" className="w-full h-full object-cover" />
                                                    </div>
                                                    <span className="text-sm font-medium text-padel-green relative z-10 bg-black/50 px-3 py-1 rounded-full">Change Image</span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                                                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center text-white mb-4 border border-white/10 group-hover:scale-110 group-hover:bg-padel-green group-hover:text-black transition-all">
                                                        <UploadCloud size={32} />
                                                    </div>
                                                    <p className="font-bold text-white mb-1">Click or drag image to upload</p>
                                                    <p className="text-xs">Square aspect ratio recommended (Max 2MB)</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                            <FileText size={16} className="text-padel-green" /> Bio *
                                        </label>
                                        <textarea
                                            name="bio"
                                            required
                                            rows="4"
                                            value={formData.bio}
                                            onChange={handleInputChange}
                                            placeholder="Tell us about yourself, your experience, and your coaching philosophy..."
                                            className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors leading-relaxed"
                                        />
                                    </div>

                                    <div className="space-y-4">
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <MapPin size={16} className="text-padel-green" /> City *
                                                </label>
                                                <input
                                                    type="text"
                                                    name="city"
                                                    required
                                                    value={formData.city}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. Johannesburg"
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <MapPin size={16} className="text-padel-green" /> Coaching Club/Location *
                                                </label>
                                                <input
                                                    type="text"
                                                    name="coaching_location"
                                                    required
                                                    value={formData.coaching_location}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. Wanderers Club, Illovo"
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <ExternalLink size={16} className="text-blue-400" /> Website
                                                </label>
                                                <input
                                                    type="url"
                                                    name="website_link"
                                                    value={formData.website_link}
                                                    onChange={handleInputChange}
                                                    placeholder="https://yoursite.com"
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <Instagram size={16} className="text-pink-500" /> Instagram
                                                </label>
                                                <input
                                                    type="url"
                                                    name="instagram_link"
                                                    value={formData.instagram_link}
                                                    onChange={handleInputChange}
                                                    placeholder="https://instagram.com/..."
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-300 mb-2 flex items-center gap-2">
                                                    <Youtube size={16} className="text-red-500" /> YouTube
                                                </label>
                                                <input
                                                    type="url"
                                                    name="youtube_link"
                                                    value={formData.youtube_link}
                                                    onChange={handleInputChange}
                                                    placeholder="https://youtube.com/..."
                                                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-6 mt-6 border-t border-white/10 flex justify-between items-center">
                                        <button
                                            type="button"
                                            onClick={handlePrev}
                                            className="flex items-center gap-2 text-gray-400 hover:text-white font-medium transition-colors"
                                        >
                                            <ChevronLeft size={20} /> Back
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex items-center gap-2 bg-padel-green text-black font-bold px-8 py-4 rounded-xl hover:bg-white hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-5 h-5 animate-spin" /> Submitting...
                                                </>
                                            ) : (
                                                <>
                                                    Submit Application <CheckCircle2 size={20} />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CoachRegistration;
