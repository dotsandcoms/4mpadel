import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../supabaseClient';
import { toast } from 'sonner';
import { UserX, CheckCircle2, XCircle, Mail, Phone, Instagram, Youtube, Trash2, X, ExternalLink, Edit2, Save, UploadCloud } from 'lucide-react';

const CoachProfileModal = ({
    app,
    onClose,
    isAdmin = false,
    onStatusUpdate,
    onDelete,
    onUpdate
}) => {
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editFormData, setEditFormData] = useState(null);
    const [newProfilePic, setNewProfilePic] = useState(null);
    const [newProfilePicPreview, setNewProfilePicPreview] = useState(null);
    const fileInputRef = useRef(null);

    // Stop propagation on modal click
    const handleModalClick = (e) => e.stopPropagation();

    const handleClose = () => {
        setIsEditing(false);
        setNewProfilePic(null);
        setNewProfilePicPreview(null);
        if (onClose) onClose();
    };

    const startEditing = () => {
        if (!app) return;
        
        // Split full_name into firstName and lastName
        const nameParts = (app.full_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        setEditFormData({
            firstName,
            lastName,
            coaching_location: app.coaching_location,
            email: app.email,
            contact_number: app.contact_number,
            instagram_link: app.instagram_link || '',
            youtube_link: app.youtube_link || '',
            website_link: app.website_link || '',
            city: app.city || '',
            bio: app.bio,
            gender: app.gender || ''
        });
        setNewProfilePic(null);
        setNewProfilePicPreview(null);
        setIsEditing(true);
    };

    const handleEditChange = (e) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setNewProfilePic(file);
            setNewProfilePicPreview(URL.createObjectURL(file));
        }
    };

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

    const handleSaveEdit = async () => {
        setIsUpdating(true);
        try {
            let updatedProfilePicUrl = app.profile_pic_url;

            const combinedName = `${editFormData.firstName} ${editFormData.lastName}`.trim();

            if (newProfilePic) {
                // Delete old image if it exists
                if (app.profile_pic_url) {
                    const oldFileName = app.profile_pic_url.split('/').pop();
                    await supabase.storage.from('coach-profiles').remove([oldFileName]);
                }

                // Upload new image
                const resizedFile = await resizeImage(newProfilePic);
                const fileExt = 'jpg';
                const fileName = `${combinedName.replace(/\s+/g, '-').toLowerCase()}_${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('coach-profiles')
                    .upload(fileName, resizedFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('coach-profiles')
                    .getPublicUrl(fileName);

                updatedProfilePicUrl = publicUrl;
            }

            const dataToUpdate = {
                ...editFormData,
                full_name: combinedName,
                profile_pic_url: updatedProfilePicUrl
            };

            // Remove temporary split fields before saving
            delete dataToUpdate.firstName;
            delete dataToUpdate.lastName;

            const { error } = await supabase
                .from('coach_applications')
                .update(dataToUpdate)
                .eq('id', app.id);

            if (error) throw error;
            toast.success('Coach information updated successfully');

            const updatedApp = { ...app, ...dataToUpdate };
            setIsEditing(false);
            setNewProfilePic(null);
            setNewProfilePicPreview(null);
            if (onUpdate) onUpdate(updatedApp);
        } catch (error) {
            console.error('Error updating coach:', error);
            toast.error('Failed to update coach information');
        } finally {
            setIsUpdating(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return 'bg-padel-green text-black';
            case 'rejected': return 'bg-red-500 text-white';
            default: return 'bg-yellow-500 text-black';
        }
    };

    if (!app) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    onClick={handleModalClick}
                    className="bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl relative"
                >
                    <button
                        onClick={handleClose}
                        className="absolute top-6 right-6 text-gray-400 hover:text-white bg-black/50 p-2 rounded-full z-10"
                    >
                        <X size={24} />
                    </button>

                    <div className="flex flex-col md:flex-row">
                        {/* Left Sidebar: Image & Actions */}
                        <div className="md:w-1/3 bg-[#1E293B]/50 p-8 flex flex-col">
                            <div className="relative w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-padel-green shadow-xl mb-6 flex-shrink-0 bg-black group">
                                {isEditing ? (
                                    <>
                                        {newProfilePicPreview || app.profile_pic_url ? (
                                            <img src={newProfilePicPreview || app.profile_pic_url} alt={app.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <UserX className="w-full h-full p-8 text-gray-500" />
                                        )}
                                        <div
                                            onClick={() => fileInputRef.current?.click()}
                                            className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white"
                                        >
                                            <UploadCloud size={32} className="mb-2" />
                                            <span className="text-xs font-bold px-2 py-1 bg-padel-green text-black rounded-full">Change Photo</span>
                                        </div>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />
                                    </>
                                ) : (
                                    app.profile_pic_url ? (
                                        <img src={app.profile_pic_url} alt={app.full_name} className="w-full h-full object-cover" />
                                    ) : (
                                        <UserX className="w-full h-full p-8 text-gray-500" />
                                    )
                                )}
                            </div>

                            <div className="text-center mb-8">
                                <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold uppercase mb-4 ${getStatusColor(app.status)}`}>
                                    Status: {app.status}
                                </div>
                                <h2 className="text-3xl font-bold text-white mb-2">{app.full_name}</h2>
                                    <p className="text-gray-400">
                                        {app.gender && `${app.gender} • `}
                                        {app.city && `${app.city}${app.coaching_location ? ', ' : ''}`}
                                        {app.coaching_location}
                                    </p>
                            </div>

                            <div className="space-y-3 mt-auto">
                                {!isEditing ? (
                                    <>
                                        {isAdmin && app.status !== 'approved' && (
                                            <button
                                                onClick={() => { setIsUpdating(true); onStatusUpdate(app.id, 'approved').finally(() => setIsUpdating(false)); }}
                                                disabled={isUpdating}
                                                className="w-full flex items-center justify-center gap-2 bg-padel-green text-black font-bold py-3 rounded-xl hover:bg-white transition-colors"
                                            >
                                                <CheckCircle2 size={18} /> Approve Application
                                            </button>
                                        )}
                                        {isAdmin && app.status !== 'rejected' && (
                                            <button
                                                onClick={() => { setIsUpdating(true); onStatusUpdate(app.id, 'rejected').finally(() => setIsUpdating(false)); }}
                                                disabled={isUpdating}
                                                className="w-full flex items-center justify-center gap-2 bg-red-500/20 text-red-500 font-bold py-3 rounded-xl hover:bg-red-500 hover:text-white transition-colors border border-red-500/50"
                                            >
                                                <XCircle size={18} /> Reject Application
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button
                                                onClick={startEditing}
                                                disabled={isUpdating}
                                                className="w-full flex items-center justify-center gap-2 bg-blue-500/20 text-blue-500 font-bold py-3 border border-blue-500/50 rounded-xl hover:bg-blue-500 hover:text-white transition-colors"
                                            >
                                                <Edit2 size={18} /> Edit Information
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <button
                                                onClick={() => { setIsUpdating(true); onDelete(app.id, app.profile_pic_url).finally(() => setIsUpdating(false)); }}
                                                disabled={isUpdating}
                                                className="w-full flex items-center justify-center gap-2 text-gray-500 font-bold py-3 mt-4 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={18} /> Delete Record
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={handleSaveEdit}
                                            disabled={isUpdating}
                                            className="w-full flex items-center justify-center gap-2 bg-blue-500 text-white font-bold py-3 rounded-xl hover:bg-blue-600 transition-colors"
                                        >
                                            <Save size={18} /> Save Changes
                                        </button>
                                        <button
                                            onClick={() => { setIsEditing(false); setNewProfilePic(null); setNewProfilePicPreview(null); }}
                                            disabled={isUpdating}
                                            className="w-full flex items-center justify-center gap-2 text-gray-400 font-bold py-3 hover:text-white transition-colors"
                                        >
                                            Cancel Edit
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right Content: Details */}
                        <div className="md:w-2/3 p-8 md:p-12">
                            {isEditing ? (
                                <div className="space-y-5">
                                    <h3 className="text-xl font-bold text-white mb-6 border-b border-white/10 pb-4">Edit Coach Information</h3>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Name</label>
                                            <input type="text" name="firstName" value={editFormData.firstName} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Surname</label>
                                            <input type="text" name="lastName" value={editFormData.lastName} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Email Address</label>
                                            <input type="email" name="email" value={editFormData.email} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Contact Number</label>
                                            <input type="text" name="contact_number" value={editFormData.contact_number} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">City</label>
                                            <input type="text" name="city" value={editFormData.city} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Gender</label>
                                            <select name="gender" value={editFormData.gender} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors appearance-none cursor-pointer">
                                                <option value="">Select Gender</option>
                                                <option value="Male">Male</option>
                                                <option value="Female">Female</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-gray-400 mb-2">Coaching Club/Location</label>
                                        <input type="text" name="coaching_location" value={editFormData.coaching_location} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Website Link</label>
                                            <input type="url" name="website_link" value={editFormData.website_link} onChange={handleEditChange} placeholder="Optional" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">Instagram Link</label>
                                            <input type="url" name="instagram_link" value={editFormData.instagram_link} onChange={handleEditChange} placeholder="Optional" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-400 mb-2">YouTube Link</label>
                                            <input type="url" name="youtube_link" value={editFormData.youtube_link} onChange={handleEditChange} placeholder="Optional" className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-400 mb-2">Coaching Bio</label>
                                        <textarea name="bio" rows="5" value={editFormData.bio} onChange={handleEditChange} className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors leading-relaxed" />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Contact Information</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
                                        <div className="flex items-start gap-3">
                                            <Mail className="text-gray-500 mt-1" size={20} />
                                            <div>
                                                <p className="text-sm text-gray-500 mb-1">Email Address</p>
                                                <a href={`mailto:${app.email}`} className="text-white hover:text-padel-green">{app.email}</a>
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-3">
                                            <Phone className="text-gray-500 mt-1" size={20} />
                                            <div>
                                                <p className="text-sm text-gray-500 mb-1">Contact Number</p>
                                                <a href={`tel:${app.contact_number}`} className="text-white hover:text-padel-green">{app.contact_number}</a>
                                            </div>
                                        </div>
                                    </div>

                                    <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Social & Web Links</h3>
                                    <div className="flex flex-wrap gap-4 mb-10">
                                        {app.website_link && (
                                            <a href={app.website_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#1E293B] hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors border border-white/10">
                                                <ExternalLink className="text-blue-400" size={18} /> Website <ExternalLink size={14} className="text-gray-500" />
                                            </a>
                                        )}

                                        {app.instagram_link && (
                                            <a href={app.instagram_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#1E293B] hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors border border-white/10">
                                                <Instagram className="text-pink-500" size={18} /> Instagram <ExternalLink size={14} className="text-gray-500" />
                                            </a>
                                        )}

                                        {app.youtube_link && (
                                            <a href={app.youtube_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-[#1E293B] hover:bg-white/10 px-4 py-2 rounded-lg text-white transition-colors border border-white/10">
                                                <Youtube className="text-red-500" size={18} /> YouTube <ExternalLink size={14} className="text-gray-500" />
                                            </a>
                                        )}

                                        {!app.website_link && !app.instagram_link && !app.youtube_link && (
                                            <span className="text-gray-500 text-sm italic py-2">No links provided</span>
                                        )}
                                    </div>

                                    <h3 className="text-xl font-bold text-padel-green mb-6 border-b border-white/10 pb-4">Coaching Bio</h3>
                                    <div className="bg-[#1E293B]/30 p-6 rounded-2xl border border-white/5">
                                        <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{app.bio}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CoachProfileModal;
