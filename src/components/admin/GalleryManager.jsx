import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Trash2, Plus, FileText, Eye, X, Save, Image as ImageIcon, UploadCloud, Loader2, ArrowLeft, RefreshCw, CheckCircle2, CheckCircle, Circle, Instagram } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';

const GalleryManager = () => {
    const fileInputRef = React.useRef(null);
    const [albums, setAlbums] = useState([]);
    const [events, setEvents] = useState([]); // Fetch calendar events
    const [loading, setLoading] = useState(true);
    const [selectedAlbum, setSelectedAlbum] = useState(null); // If null, show albums list. If set, show images for this album.
    const [selectedImages, setSelectedImages] = useState([]); // Array of image IDs for bulk actions

    // Album Modal State
    const [isAlbumModalOpen, setIsAlbumModalOpen] = useState(false);
    const [editingAlbum, setEditingAlbum] = useState(null);
    const [albumFormData, setAlbumFormData] = useState({
        title: '',
        description: '',
        is_active: true,
        cover_image_url: '',
        event_id: '',
        youtube_playlist_url: '',
        slug: '',
        photographer_name: '',
        photographer_instagram: '',
        album_date: ''
    });

    // Images State (when selectedAlbum is set)
    const [images, setImages] = useState([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

    useEffect(() => {
        fetchAlbums();
        fetchEvents();
    }, []);

    const fetchAlbums = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('albums')
                .select('*, calendar(event_name)')
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

    const fetchEvents = async () => {
        try {
            const { data, error } = await supabase
                .from('calendar')
                .select('id, event_name, start_date')
                .order('start_date', { ascending: false });

            if (error) throw error;
            setEvents(data || []);
        } catch (error) {
            console.error('Error fetching events:', error);
            // Non-blocking error
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
            cover_image_url: '',
            event_id: '',
            youtube_playlist_url: '',
            slug: '',
            photographer_name: '',
            photographer_instagram: '',
            album_date: ''
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
            cover_image_url: album.cover_image_url || '',
            event_id: album.event_id || '',
            youtube_playlist_url: album.youtube_playlist_url || '',
            slug: album.slug || '',
            photographer_name: album.photographer_name || '',
            photographer_instagram: album.photographer_instagram || '',
            album_date: album.album_date ? album.album_date.substring(0, 10) : ''
        });
        setIsAlbumModalOpen(true);
    };

    const handleAlbumSubmit = async (e) => {
        e.preventDefault();
        try {
            // Clean up empty string to null for event_id foreign key
            const submissionData = {
                ...albumFormData,
                event_id: albumFormData.event_id === '' ? null : albumFormData.event_id,
                album_date: albumFormData.album_date === '' ? null : albumFormData.album_date
            };

            if (editingAlbum) {
                const { error } = await supabase
                    .from('albums')
                    .update(submissionData)
                    .eq('id', editingAlbum.id);

                if (error) throw error;
                toast.success('Album updated successfully');
            } else {
                const { error } = await supabase
                    .from('albums')
                    .insert([submissionData]);

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

    // Helper for sanitizing title to folder name
    const sanitizeFolderName = (title) => {
        return (title || 'unnamed-album')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    };

    const generateSlug = (text) => {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')     // Replace spaces with -
            .replace(/[^\w-]+/g, '') // Remove all non-word chars
            .replace(/--+/g, '-')    // Replace multiple - with single -
            .replace(/^-+/, '')      // Trim - from start of text
            .replace(/-+$/, '');     // Trim - from end of text
    };

    const handleBulkImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0 || !selectedAlbum) return;

        try {
            setIsUploading(true);
            setUploadProgress({ current: 0, total: files.length });

            let uploadedCount = 0;
            let dbErrorCount = 0;

            // Sanitize album title for folder name
            const folderName = sanitizeFolderName(selectedAlbum.title);

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    // Generate both Full and Thumbnail resolutions
                    const [resizedFull, resizedThumb] = await Promise.all([
                        resizeImage(file, 1920, 0.82), // High Quality Full Size
                        resizeImage(file, 600, 0.7)    // Fast Loading Thumbnail
                    ]);

                    const randomId = Math.random().toString(36).substring(2, 8);
                    const timestamp = Date.now();
                    const baseFileName = `${randomId}_${timestamp}`;
                    
                    const fullPath = `${folderName}/${baseFileName}_full.jpg`;
                    const thumbPath = `${folderName}/${baseFileName}_thumb.jpg`;

                    // Upload both in parallel
                    const [fullUpload, thumbUpload] = await Promise.all([
                        supabase.storage.from('gallery').upload(fullPath, resizedFull, { cacheControl: '3600', upsert: false }),
                        supabase.storage.from('gallery').upload(thumbPath, resizedThumb, { cacheControl: '3600', upsert: false })
                    ]);

                    if (fullUpload.error) throw fullUpload.error;
                    if (thumbUpload.error) throw thumbUpload.error;

                    // Get Public URLs
                    const fullUrl = supabase.storage.from('gallery').getPublicUrl(fullPath).data.publicUrl;
                    const thumbUrl = supabase.storage.from('gallery').getPublicUrl(thumbPath).data.publicUrl;

                    // Insert into DB with both full and thumb URLs
                    const { error: dbError } = await supabase
                        .from('gallery_images')
                        .insert([{
                            album_id: selectedAlbum.id,
                            image_url: fullUrl,
                            thumbnail_url: thumbUrl,
                            sort_order: (images?.[images.length - 1]?.sort_order || 0) + uploadedCount + 1
                        }]);

                    if (dbError) throw dbError;

                    // Update album cover if needed
                    if (uploadedCount === 0 && !selectedAlbum.cover_image_url) {
                        await supabase.from('albums').update({ cover_image_url: fullUrl }).eq('id', selectedAlbum.id);
                        setSelectedAlbum(prev => ({ ...prev, cover_image_url: fullUrl }));
                    }

                    uploadedCount++;
                    setUploadProgress({ current: uploadedCount, total: files.length });
                } catch (err) {
                    console.error("Error uploading file:", err);
                    toast.error(`Failed to upload ${file.name}`);
                }
            }

            if (uploadedCount > 0) {
                toast.success(`Successfully uploaded ${uploadedCount} images.`);
                fetchImages(selectedAlbum.id);
                fetchAlbums(); // refresh total list
            }
            if (dbErrorCount > 0) toast.error(`Failed to register ${dbErrorCount} images in database.`);

        } catch (error) {
            console.error('Bulk upload error:', error);
            toast.error('An error occurred during bulk upload');
        } finally {
            setIsUploading(false);
            e.target.value = ''; // Reset input
        }
    };

    const toggleImageSelection = (id) => {
        setSelectedImages(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const selectAllImages = () => {
        if (selectedImages.length === images.length) {
            setSelectedImages([]);
        } else {
            setSelectedImages(images.map(img => img.id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedImages.length === 0) return;
        if (!window.confirm(`Are you sure you want to delete ${selectedImages.length} images?`)) return;

        try {
            setLoadingImages(true);
            
            // Get URLs for storage deletion
            const imagesToDelete = images.filter(img => selectedImages.includes(img.id));
            const storagePaths = [];
            
            imagesToDelete.forEach(img => {
                const fullParts = img.image_url.split('/gallery/');
                const thumbParts = img.thumbnail_url?.split('/gallery/');
                if (fullParts.length === 2) storagePaths.push(fullParts[1]);
                if (thumbParts?.length === 2) storagePaths.push(thumbParts[1]);
            });

            // 1. Delete from Storage
            if (storagePaths.length > 0) {
                const { error: storageError } = await supabase.storage.from('gallery').remove(storagePaths);
                if (storageError) console.error("Storage deletion error:", storageError);
            }

            // 2. Delete from DB
            const { error: dbError } = await supabase
                .from('gallery_images')
                .delete()
                .in('id', selectedImages);

            if (dbError) throw dbError;

            toast.success(`${selectedImages.length} images deleted`);
            setSelectedImages([]);
            fetchImages(selectedAlbum.id);
        } catch (err) {
            console.error("Bulk delete error:", err);
            toast.error('Failed to delete selected images');
        } finally {
            setLoadingImages(false);
        }
    };

    const handleSetAsCover = async (imageUrl) => {
        try {
            const { error } = await supabase
                .from('albums')
                .update({ cover_image_url: imageUrl })
                .eq('id', selectedAlbum.id);

            if (error) throw error;
            
            setSelectedAlbum(prev => ({ ...prev, cover_image_url: imageUrl }));
            toast.success('Album cover updated');
            fetchAlbums(); // refresh main list
        } catch (err) {
            console.error("Error setting cover:", err);
            toast.error('Failed to update cover image');
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
                            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all border border-white/5 flex items-center justify-center"
                            title="Back to Albums"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">{selectedAlbum.title}</h2>
                            <p className="text-gray-400 text-sm flex items-center gap-2">
                                <FileText size={14} />
                                {selectedAlbum.calendar?.event_name ? `Linked to ${selectedAlbum.calendar.event_name}` : 'No event linked'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {images.length > 0 && (
                            <button
                                onClick={selectAllImages}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all border border-white/5 text-sm font-bold"
                            >
                                {selectedImages.length === images.length ? 'Deselect All' : 'Select All'}
                            </button>
                        )}
                        {selectedImages.length > 0 && (
                            <button
                                onClick={handleBulkDelete}
                                className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 text-sm font-bold flex items-center gap-2"
                            >
                                <Trash2 size={16} />
                                Delete Selected ({selectedImages.length})
                            </button>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            multiple
                            accept="image/*"
                            onChange={handleBulkImageUpload}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="relative group overflow-hidden bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:bg-white transition-all disabled:opacity-50"
                        >
                            <div className="flex items-center gap-2 relative z-10">
                                {isUploading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Uploading {uploadProgress.current}/{uploadProgress.total}</span>
                                    </>
                                ) : (
                                    <>
                                        <UploadCloud size={20} />
                                        <span>Bulk Upload</span>
                                    </>
                                )}
                            </div>
                            {isUploading && (
                                <motion.div
                                    className="absolute inset-0 bg-black/10 origin-left"
                                    initial={{ scaleX: 0 }}
                                    animate={{ scaleX: uploadProgress.current / uploadProgress.total }}
                                    transition={{ duration: 0.5 }}
                                />
                            )}
                        </button>
                    </div>
                </div>

                {isUploading && (
                    <div className="bg-padel-green/5 border border-padel-green/20 rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-padel-green/10 flex items-center justify-center shrink-0">
                                <Loader2 className="w-6 h-6 text-padel-green animate-spin" />
                            </div>
                            <div>
                                <p className="text-white font-bold text-lg leading-tight">Uploading Assets</p>
                                <p className="text-gray-400 text-xs">Storing resized JPEGs in storage...</p>
                            </div>
                        </div>
                        <div className="w-full sm:w-auto text-left sm:text-right border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                            <p className="text-padel-green font-black text-2xl sm:text-3xl leading-none">{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</p>
                            <p className="text-gray-500 text-[10px] uppercase tracking-widest mt-1 font-bold">{uploadProgress.current} / {uploadProgress.total} Files Complete</p>
                        </div>
                    </div>
                )}

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
                            <div 
                                key={img.id} 
                                className={`relative group border-2 rounded-xl overflow-hidden aspect-square transition-all duration-300 ${selectedImages.includes(img.id) ? 'border-padel-green ring-4 ring-padel-green/20' : 'border-white/5 bg-slate-900'}`}
                            >
                                <img 
                                    src={img.thumbnail_url || img.image_url} 
                                    alt="Gallery" 
                                    className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${selectedImages.includes(img.id) ? 'opacity-70' : ''}`} 
                                    loading="lazy"
                                />
                                
                                {/* Selection Checkbox */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleImageSelection(img.id); }}
                                    className={`absolute top-2 left-2 z-20 p-1.5 rounded-lg transition-all ${selectedImages.includes(img.id) ? 'bg-padel-green text-black' : 'bg-black/40 text-white/50 hover:text-white border border-white/10 opacity-0 group-hover:opacity-100'}`}
                                >
                                    {selectedImages.includes(img.id) ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                                </button>

                                {selectedAlbum.cover_image_url === img.image_url && (
                                    <div className="absolute top-2 right-2 z-20 bg-padel-green text-black px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter">
                                        Cover
                                    </div>
                                )}

                                <div className="absolute inset-0 bg-black/60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button
                                        onClick={() => handleSetAsCover(img.image_url)}
                                        className={`p-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold ${selectedAlbum.cover_image_url === img.image_url ? 'bg-padel-green text-black cursor-default' : 'bg-white/10 hover:bg-padel-green hover:text-black text-white'}`}
                                        title="Set as Cover"
                                    >
                                        <ImageIcon size={18} />
                                    </button>
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
                                    <img src={album.cover_image_url} alt={album.title} className="w-full h-full object-cover object-top" />
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
                                    <div className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${album.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                        {album.is_active ? 'Active' : 'Hidden'}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    {album.calendar?.event_name && (
                                        <div className="flex items-center gap-1.5 text-padel-green/70 text-[11px] font-bold uppercase tracking-wider mb-2">
                                            <FileText size={12} />
                                            <span className="line-clamp-1">{album.calendar.event_name}</span>
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-400 line-clamp-2 mb-4">{album.description || 'No description'}</p>
                                    {album.photographer_name && (
                                        <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-bold uppercase tracking-wider mb-2">
                                            {album.photographer_instagram ? <Instagram size={10} className="text-padel-green" /> : <ImageIcon size={10} />}
                                            <span className="line-clamp-1">Photos by {album.photographer_name}</span>
                                        </div>
                                    )}
                                </div>

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
                            className="bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
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

                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                <form id="album-form" onSubmit={handleAlbumSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Album Title</label>
                                        <input
                                            type="text"
                                            name="title"
                                            required
                                            value={albumFormData.title}
                                            onChange={(e) => {
                                                const newTitle = e.target.value;
                                                setAlbumFormData(prev => ({
                                                    ...prev,
                                                    title: newTitle,
                                                    // Only auto-update slug if it was empty or matched the previous title's slug
                                                    slug: (!prev.slug || prev.slug === generateSlug(prev.title)) ? generateSlug(newTitle) : prev.slug
                                                }));
                                            }}
                                            placeholder="e.g. Summer Tournament 2024"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">URL Slug (Human-friendly ID)</label>
                                        <input
                                            type="text"
                                            name="slug"
                                            required
                                            value={albumFormData.slug}
                                            onChange={handleAlbumInputChange}
                                            placeholder="e.g. summer-tournament-2024"
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1 italic">This determines the URL: 4mpadel.co.za/gallery/slug</p>
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
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Display Date (Optional)</label>
                                            <input
                                                type="date"
                                                name="album_date"
                                                value={albumFormData.album_date}
                                                onChange={handleAlbumInputChange}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                            />
                                            <p className="text-[10px] text-gray-500 mt-1 italic">Overrides the automatic creation date.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Status</label>
                                            <div className="flex items-center h-[50px]">
                                                <label className="flex items-center cursor-pointer gap-3">
                                                    <div className="relative">
                                                        <input
                                                            type="checkbox"
                                                            name="is_active"
                                                            checked={albumFormData.is_active}
                                                            onChange={handleAlbumInputChange}
                                                            className="sr-only"
                                                        />
                                                        <div className={`block w-10 h-6 rounded-full transition-colors ${albumFormData.is_active ? 'bg-padel-green' : 'bg-gray-600'}`}></div>
                                                        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${albumFormData.is_active ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                    <span className="text-sm font-bold text-white">{albumFormData.is_active ? 'Active' : 'Hidden'}</span>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Link to Event (Optional)</label>
                                        <select
                                            name="event_id"
                                            value={albumFormData.event_id || ''}
                                            onChange={handleAlbumInputChange}
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors appearance-none"
                                        >
                                            <option value="">-- No Event Linked --</option>
                                            {events.map(event => (
                                                <option key={event.id} value={event.id}>
                                                    {event.event_name} {event.start_date ? `(${event.start_date.substring(0, 10)})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Photographer Name</label>
                                            <input
                                                type="text"
                                                name="photographer_name"
                                                value={albumFormData.photographer_name}
                                                onChange={handleAlbumInputChange}
                                                placeholder="e.g. John Doe"
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Instagram Handle</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">@</span>
                                                <input
                                                    type="text"
                                                    name="photographer_instagram"
                                                    value={albumFormData.photographer_instagram}
                                                    onChange={handleAlbumInputChange}
                                                    placeholder="username"
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">YouTube Playlist URL (Optional)</label>
                                        <input
                                            type="text"
                                            name="youtube_playlist_url"
                                            value={albumFormData.youtube_playlist_url}
                                            onChange={handleAlbumInputChange}
                                            placeholder="https://www.youtube.com/playlist?list=..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                        />
                                        <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest leading-none">Overrides linked event video if set</p>
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
