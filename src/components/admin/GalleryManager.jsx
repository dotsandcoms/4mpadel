import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Trash2, Plus, FileText, Eye, X, Save, Image as ImageIcon, UploadCloud, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';

const GalleryManager = () => {
    const [albums, setAlbums] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedAlbum, setSelectedAlbum] = useState(null); // If null, show albums list. If set, show images for this album.

    // Album Modal State
    const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
    const [editingAlbum, setEditingAlbum] = useState(null);
    const [albumFormData, setAlbumFormData] = useState({
        title: '',
        description: '',
        is_active: true,
        cover_image_url: ''
    });

    // Images State (when selectedAlbum is set)
    const [images, setImages] = useState([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        fetchAlbums();
    }, []);

    const fetchAlbums = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('albums')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setAlbums(data || []);
        } catch (error) {
            console.error('Error fetching albums:', error);
            toast.error('Failed to load albums');
        } finally {
            setLoading(false);
        }
    };

    const fetchImages = async (albumId) => {
        try {
            setLoadingImages(true);
            const { data, error } = await supabase
                .from('gallery_images')
                .select('*')
                .eq('album_id', albumId)
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: false });

            if (error) throw error;
            setImages(data || []);
        } catch (error) {
            console.error('Error fetching images:', error);
            toast.error('Failed to load images');
        } finally {
            setLoadingImages(false);
        }
    };

    const handleAlbumInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setAlbumFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const resetAlbumForm = () => {
        setAlbumFormData({
            title: '',
            description: '',
            is_active: true,
            cover_image_url: ''
        });
        setEditingAlbum(null);
        setIsAlbumModalOpen(false);
    };

    const openEditAlbumModal = (album) => {
        setEditingAlbum(album);
        setAlbumFormData({
            title: album.title || '',
            description: album.description || '',
            is_active: album.is_active,
            cover_image_url: album.cover_image_url || ''
        });
        setIsAlbumModalOpen(true);
    };

    const handleAlbumSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingAlbum) {
                const { error } = await supabase
                    .from('albums')
                    .update(albumFormData)
                    .eq('id', editingAlbum.id);

                if (error) throw error;
                toast.success('Album updated successfully');
            } else {
                const { error } = await supabase
                    .from('albums')
                    .insert([albumFormData]);

                if (error) throw error;
                toast.success('Album created successfully');
            }

            resetAlbumForm();
            fetchAlbums();
        } catch (error) {
            console.error('Error saving album:', error);
            toast.error(`Failed to save album: ${error.message}`);
        }
    };

    const handleDeleteAlbum = async (id) => {
        if (!window.confirm('Are you sure you want to delete this album? All associated images will also be deleted.')) return;

        try {
            const { error } = await supabase
                .from('albums')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Album deleted successfully');
            fetchAlbums();
        } catch (error) {
            console.error('Error deleting album:', error);
            toast.error('Failed to delete album');
        }
    };

    const handleToggleAlbumStatus = async (album) => {
        try {
            const { error } = await supabase
                .from('albums')
                .update({ is_active: !album.is_active })
                .eq('id', album.id);

            if (error) throw error;
            toast.success(`Album is now ${!album.is_active ? 'Active' : 'Inactive'}`);
            fetchAlbums();
        } catch (error) {
            console.error('Error toggling status:', error);
            toast.error('Failed to update album status');
        }
    };

    const selectAlbum = (album) => {
        setSelectedAlbum(album);
        fetchImages(album.id);
    };

    // Client-side image resizing
    const resizeImage = (file, maxWidth = 1920, quality = 0.8) => {
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

    const handleBulkImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0 || !selectedAlbum) return;

        try {
            setIsUploading(true);
            setUploadProgress({ current: 0, total: files.length });

            let uploadedCount = 0;
            let dbErrorCount = 0;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    // Resize image
                    const resizedFile = await resizeImage(file);

                    const fileExt = 'jpg'; // We save resized as jpg
                    const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                    const filePath = `${selectedAlbum.id}/${fileName}`;

                    // Upload to Storage
                    const { error: uploadError } = await supabase.storage
                        .from('gallery')
                        .upload(filePath, resizedFile);

                    if (uploadError) throw uploadError;

                    // Get Public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('gallery')
                        .getPublicUrl(filePath);

                    // Insert into DB
                    const { error: dbError } = await supabase
                        .from('gallery_images')
                        .insert([{
                            album_id: selectedAlbum.id,
                            image_url: publicUrl,
                            sort_order: i // Initial simple sort
                        }]);

                    // If it is the first image and the album has no cover image, set it
                    if (uploadedCount === 0 && !selectedAlbum.cover_image_url) {
                        await supabase.from('albums').update({ cover_image_url: publicUrl }).eq('id', selectedAlbum.id);
                        selectedAlbum.cover_image_url = publicUrl; // Update local state for next check
                    }

                    if (dbError) {
                        console.error('DB Error inserting image tracking row:', dbError);
                        dbErrorCount++;
                    } else {
                        uploadedCount++;
                    }
                } catch (err) {
                    console.error(`Error processing file ${file.name}:`, err);
                }
                setUploadProgress({ current: i + 1, total: files.length });
            }

            toast.success(`Successfully uploaded ${uploadedCount} images.`);
            if (dbErrorCount > 0) toast.error(`Failed to register ${dbErrorCount} images in database.`);

            fetchImages(selectedAlbum.id);
            fetchAlbums(); // refresh to hopefully fetch updated cover image

        } catch (error) {
            console.error('Bulk upload error:', error);
            toast.error('An error occurred during bulk upload');
        } finally {
            setIsUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleDeleteImage = async (id, filePath) => {
        if (!window.confirm('Are you sure you want to delete this image?')) return;
        try {
            // Try to extract the file path to remove from storage, if needed.
            // A more robust app would track storage paths in db.
            // URL pattern: .../storage/v1/object/public/gallery/albumId/filename.jpg
            const urlParts = filePath.split('/gallery/');
            if (urlParts.length === 2) {
                const storagePath = urlParts[1];
                await supabase.storage.from('gallery').remove([storagePath]);
            }

            const { error } = await supabase
                .from('gallery_images')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Image deleted');
            fetchImages(selectedAlbum.id);
        } catch (err) {
            console.error("Error deleting image:", err);
            toast.error('Failed to delete image');
        }
    };


    if (selectedAlbum) {
        return (
            <div className="space-y-6 relative">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setSelectedAlbum(null)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            &larr; Back to Albums
                        </button>
                        <div>
                            <h2 className="text-3xl font-bold text-white">{selectedAlbum.title}</h2>
                            <p className="text-gray-400">Manage images for this album</p>
                        </div>
                    </div>
                    <div className="relative">
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleBulkImageUpload}
                            disabled={isUploading}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                        />
                        <button
                            disabled={isUploading}
                            className="flex items-center gap-2 bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:bg-white transition-colors disabled:opacity-50"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Uploading {uploadProgress.current}/{uploadProgress.total}
                                </>
                            ) : (
                                <>
                                    <UploadCloud size={20} />
                                    Bulk Upload Images
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {loadingImages ? (
                    <div className="flex justify-center py-12">
                        <div className="w-12 h-12 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
                    </div>
                ) : images.length === 0 ? (
                    <div className="text-center py-12 bg-[#1E293B]/50 rounded-2xl border border-white/10">
                        <ImageIcon className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                        <p className="text-gray-400 font-medium">No images in this album. Upload some above!</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {images.map(img => (
                            <div key={img.id} className="relative group bg-black/50 border border-white/10 rounded-xl overflow-hidden aspect-square">
                                <img src={img.image_url} alt="Gallery" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                                <div className="absolute inset-0 bg-black/60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button
                                        onClick={() => window.open(img.image_url, '_blank')}
                                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                                        title="View Full Size"
                                    >
                                        <Eye size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteImage(img.id, img.image_url)}
                                        className="p-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white transition-colors"
                                        title="Delete Image"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6 relative">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white">Gallery Manager</h2>
                    <p className="text-gray-400">Manage albums and bulk upload images</p>
                </div>
                <button
                    onClick={() => { resetAlbumForm(); setIsAlbumModalOpen(true); }}
                    className="flex items-center gap-2 bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:bg-white transition-colors"
                >
                    <Plus size={20} />
                    New Album
                </button>
            </div>

            {/* Albums List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-12 h-12 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
                </div>
            ) : albums.length === 0 ? (
                <div className="text-center py-12 bg-[#1E293B]/50 rounded-2xl border border-white/10">
                    <ImageIcon className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 font-medium">No albums found</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {albums.map((album) => (
                        <motion.div
                            key={album.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-[#1E293B]/50 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden group hover:border-padel-green/30 transition-all flex flex-col"
                        >
                            <div className="h-48 relative border-b border-white/10 bg-black/50 flex items-center justify-center">
                                {album.cover_image_url ? (
                                    <img src={album.cover_image_url} alt={album.title} className="w-full h-full object-cover" />
                                ) : (
                                    <ImageIcon className="w-12 h-12 text-gray-500" />
                                )}
                                <div className="absolute inset-0 bg-black/50 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <button
                                        onClick={() => selectAlbum(album)}
                                        className="bg-padel-green text-black font-bold px-6 py-2 rounded-xl"
                                    >
                                        Manage Images
                                    </button>
                                </div>
                            </div>
                            <div className="p-5 flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-white line-clamp-1">{album.title}</h3>
                                    <div className={`px-2 py-1 rounded-full text-xs font-bold ${album.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {album.is_active ? 'Active' : 'Hidden'}
                                    </div>
                                </div>
                                <p className="text-sm text-gray-400 line-clamp-2 mb-4 flex-1">{album.description || 'No description'}</p>

                                <div className="flex justify-between items-center pt-4 border-t border-white/10">
                                    <button
                                        onClick={() => handleToggleAlbumStatus(album)}
                                        className="text-sm text-gray-400 hover:text-white transition-colors"
                                    >
                                        Toggle Status
                                    </button>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => openEditAlbumModal(album)}
                                            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors border border-white/10"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteAlbum(album.id)}
                                            className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors border border-red-500/20"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Modal for Create/Edit Album */}
            <AnimatePresence>
                {isAlbumModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                                <h3 className="text-2xl font-bold text-white">
                                    {editingAlbum ? 'Edit Album' : 'Create New Album'}
                                </h3>
                                <button
                                    onClick={resetAlbumForm}
                                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6">
                                <form id="album-form" onSubmit={handleAlbumSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Album Title</label>
                                        <input
                                            type="text"
                                            name="title"
                                            required
                                            value={albumFormData.title}
                                            onChange={handleAlbumInputChange}
                                            placeholder="e.g. Summer Tournament 2024"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Description</label>
                                        <textarea
                                            name="description"
                                            rows="3"
                                            value={albumFormData.description}
                                            onChange={handleAlbumInputChange}
                                            placeholder="Brief description of the album..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                        ></textarea>
                                    </div>
                                    <div className="flex items-center gap-3 bg-black/40 border border-white/10 p-4 rounded-lg">
                                        <input
                                            type="checkbox"
                                            id="is_active"
                                            name="is_active"
                                            checked={albumFormData.is_active}
                                            onChange={handleAlbumInputChange}
                                            className="w-5 h-5 rounded border-gray-600 text-padel-green focus:ring-padel-green focus:ring-offset-gray-900 bg-gray-700"
                                        />
                                        <label htmlFor="is_active" className="text-sm font-medium text-white cursor-pointer">
                                            Active (Visible to public)
                                        </label>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-white/10">
                                        <p className="text-sm text-gray-400">Note: Upon bulk uploading images later, the first image will automatically be set as the cover image if one doesn't exist.</p>
                                    </div>
                                </form>
                            </div>

                            <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-4">
                                <button
                                    type="button"
                                    onClick={resetAlbumForm}
                                    className="px-6 py-3 text-white font-bold hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="album-form"
                                    className="flex items-center gap-2 bg-padel-green text-black px-8 py-3 rounded-xl font-bold hover:bg-white transition-all"
                                >
                                    <Save size={20} />
                                    {editingAlbum ? 'Save Changes' : 'Create Album'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default GalleryManager;
