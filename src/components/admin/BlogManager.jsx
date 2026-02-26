// This file replaces the old src/components/admin/BlogManager.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Trash2, Plus, Search, FileText, Eye, X, Save, Image as ImageIcon, UploadCloud, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';

const BlogManager = () => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All Categories');
    const [categories, setCategories] = useState([]);

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        category: '',
        author: '',
        content: '',
        status: 'Draft',
        image_url: '',
        date: new Date().toISOString().substring(0, 10)
    });
    const [isUploading, setIsUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 5;

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('blogs')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            setPosts(data || []);

            // Extract unique categories for filter dropdown
            const uniqueCategories = [...new Set(data.map(p => p.category))].filter(Boolean);
            setCategories(uniqueCategories);
        } catch (error) {
            console.error('Error fetching blogs:', error);
            toast.error('Failed to load blog posts');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resetForm = () => {
        setFormData({
            title: '',
            slug: '',
            category: '',
            author: '',
            content: '',
            status: 'Draft',
            image_url: '',
            date: new Date().toISOString().substring(0, 10)
        });
        setEditingPost(null);
        setIsModalOpen(false);
    };

    const openEditModal = (post) => {
        setEditingPost(post);
        setFormData({
            title: post.title || '',
            slug: post.slug || '',
            category: post.category || '',
            author: post.author || '',
            content: post.content || '',
            status: post.status || 'Draft',
            image_url: post.image_url || '',
            date: post.date ? post.date.substring(0, 10) : new Date().toISOString().substring(0, 10)
        });
        setIsModalOpen(true);
    };

    const handleImageUpload = async (file) => {
        if (!file) return;

        try {
            setIsUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('blog-images')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('blog-images')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, image_url: publicUrl }));
            toast.success('Image uploaded successfully');
        } catch (error) {
            console.error('Error uploading image:', error);
            toast.error('Failed to upload image. Ensure the bucket exists and policies are set.');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
        else if (e.type === "dragleave") setDragActive(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileInput = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleImageUpload(e.target.files[0]);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            // Auto generate slug if empty
            if (!formData.slug && formData.title) {
                formData.slug = formData.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)+/g, '');
            }

            if (editingPost) {
                const { error } = await supabase
                    .from('blogs')
                    .update(formData)
                    .eq('id', editingPost.id);

                if (error) throw error;
                toast.success('Blog post updated successfully');
            } else {
                const { error } = await supabase
                    .from('blogs')
                    .insert([formData]);

                if (error) throw error;
                toast.success('Blog post created successfully');
            }

            resetForm();
            fetchPosts();
        } catch (error) {
            console.error('Error saving post:', error);
            toast.error(`Failed to save post: ${error.message}`);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this blog post? This action cannot be undone.')) return;

        try {
            const { error } = await supabase
                .from('blogs')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Blog post deleted successfully');
            fetchPosts();
        } catch (error) {
            console.error('Error deleting post:', error);
            toast.error('Failed to delete post');
        }
    };

    // Filtering logic
    const filteredPosts = posts.filter(post => {
        const matchesSearch = (post.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (post.author?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        const matchesCategory = categoryFilter === 'All Categories' || post.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    // Pagination logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentPosts = filteredPosts.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(filteredPosts.length / itemsPerPage);

    return (
        <div className="space-y-6 relative">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold text-white">Blog Management</h2>
                    <p className="text-gray-400">Manage articles and news updates</p>
                </div>
                <button
                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                    className="flex items-center gap-2 bg-padel-green text-black px-6 py-3 rounded-xl font-bold hover:bg-white transition-colors"
                >
                    <Plus size={20} />
                    New Post
                </button>
            </div>

            {/* Search & Filter */}
            <div className="bg-[#1E293B]/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Search posts by title or author..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:border-padel-green focus:outline-none"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-black/50 border border-white/10 rounded-xl px-4 py-3 md:py-0 text-white focus:border-padel-green focus:outline-none"
                >
                    <option value="All Categories">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Posts List */}
            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="w-12 h-12 border-4 border-white/10 border-t-padel-green rounded-full animate-spin"></div>
                </div>
            ) : filteredPosts.length === 0 ? (
                <div className="text-center py-12 bg-[#1E293B]/50 rounded-2xl border border-white/10">
                    <FileText className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-400 font-medium">No blog posts found</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {currentPosts.map((post) => (
                        <motion.div
                            key={post.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1E293B]/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col md:flex-row md:items-center justify-between group hover:border-padel-green/30 transition-all gap-4 md:gap-0"
                        >
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 bg-white/5 rounded-xl flex items-center justify-center text-padel-green border border-white/10 flex-shrink-0 overflow-hidden">
                                    {post.image_url ? (
                                        <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <FileText size={32} />
                                    )}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white line-clamp-1">{post.title}</h3>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400 mt-1">
                                        <span className="font-medium text-padel-green/80">{post.category}</span>
                                        <span className="hidden md:inline">•</span>
                                        <span>{post.author}</span>
                                        <span className="hidden md:inline">•</span>
                                        <span>{post.date ? new Date(post.date).toLocaleDateString() : 'No date'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 md:w-auto w-full justify-between md:justify-end border-t border-white/10 pt-4 md:border-t-0 md:pt-0">
                                <div className="text-left md:text-right flex items-center md:flex-col gap-4 md:gap-0">
                                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold md:mb-1 ${post.status === 'Published' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                        }`}>
                                        {post.status}
                                    </div>
                                    <div className="flex items-center gap-1 text-gray-500 text-sm justify-end">
                                        <Eye size={14} /> {post.views || 0}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => openEditModal(post)}
                                        className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white transition-colors border border-white/10"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(post.id)}
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-500 transition-colors border border-red-500/20"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex justify-between items-center text-sm pt-4 border-t border-white/10">
                    <span className="text-gray-400 hidden md:inline">
                        Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredPosts.length)} of {filteredPosts.length} posts
                    </span>
                    <div className="flex gap-2 w-full justify-between md:w-auto">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 transition-colors font-medium border border-white/5"
                        >
                            Previous
                        </button>
                        <div className="flex gap-1">
                            {Array.from({ length: totalPages }, (_, i) => (
                                <button
                                    key={i + 1}
                                    onClick={() => setCurrentPage(i + 1)}
                                    className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors border ${currentPage === i + 1
                                        ? 'bg-padel-green text-black font-bold border-padel-green'
                                        : 'bg-white/5 text-white hover:bg-white/10 border-white/10'
                                        }`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-4 py-2 bg-white/10 rounded-lg text-white disabled:opacity-50 hover:bg-white/20 transition-colors font-medium border border-white/5"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Modal for Create/Edit */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-[#0F172A] border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                        >
                            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 sticky top-0 z-10">
                                <h3 className="text-2xl font-bold text-white">
                                    {editingPost ? 'Edit Blog Post' : 'Create New Post'}
                                </h3>
                                <button
                                    onClick={resetForm}
                                    className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto">
                                <form id="blog-form" onSubmit={handleSubmit} className="space-y-6">

                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="space-y-4">
                                            {/* Title */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Post Title</label>
                                                <input
                                                    type="text"
                                                    name="title"
                                                    required
                                                    value={formData.title}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter post title"
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>

                                            {/* Slug */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">URL Slug (Auto-generates if empty)</label>
                                                <input
                                                    type="text"
                                                    name="slug"
                                                    value={formData.slug}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. nutrition-tips"
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                />
                                            </div>

                                            {/* Author & Category */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Author</label>
                                                    <input
                                                        type="text"
                                                        name="author"
                                                        required
                                                        value={formData.author}
                                                        onChange={handleInputChange}
                                                        placeholder="Author Name"
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Category</label>
                                                    <input
                                                        type="text"
                                                        name="category"
                                                        required
                                                        value={formData.category}
                                                        onChange={handleInputChange}
                                                        placeholder="e.g. Coaching"
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Date & Status */}
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-padel-green mb-1 uppercase tracking-wider">Publish Date</label>
                                                    <input
                                                        type="date"
                                                        name="date"
                                                        required
                                                        value={formData.date}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-black/40 border border-padel-green/50 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">Status</label>
                                                    <select
                                                        name="status"
                                                        value={formData.status}
                                                        onChange={handleInputChange}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white focus:border-padel-green focus:outline-none transition-colors appearance-none"
                                                    >
                                                        <option value="Draft">Draft</option>
                                                        <option value="Published">Published</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Image Upload Zone */}
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Cover Image</label>

                                                <div
                                                    className={`relative border-2 border-dashed rounded-xl p-6 transition-colors text-center ${dragActive ? 'border-padel-green bg-padel-green/5' : 'border-white/20 hover:border-white/40 bg-black/20'}`}
                                                    onDragEnter={handleDrag}
                                                    onDragLeave={handleDrag}
                                                    onDragOver={handleDrag}
                                                    onDrop={handleDrop}
                                                >
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleFileInput}
                                                        disabled={isUploading}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                                                    />

                                                    {isUploading ? (
                                                        <div className="flex flex-col items-center justify-center py-4">
                                                            <Loader2 className="w-8 h-8 text-padel-green animate-spin mb-2" />
                                                            <span className="text-sm font-bold text-gray-300">Uploading...</span>
                                                        </div>
                                                    ) : formData.image_url ? (
                                                        <div className="relative rounded-lg overflow-hidden group">
                                                            <div className="h-40 w-full">
                                                                <img src={formData.image_url} alt="Cover Preview" className="w-full h-full object-cover" />
                                                            </div>
                                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="text-white font-bold bg-black/80 px-4 py-2 rounded-full text-sm border border-white/20 backdrop-blur-sm pointer-events-none">
                                                                    Click or Drag to Replace
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex flex-col items-center justify-center py-4 text-gray-400">
                                                            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-padel-green mb-3 border border-white/10 group-hover:scale-110 transition-transform">
                                                                <UploadCloud size={24} />
                                                            </div>
                                                            <p className="font-bold text-sm text-gray-300 mb-1">Click to upload or drag and drop</p>
                                                            <p className="text-xs">SVG, PNG, JPG or GIF (max. 5MB)</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Hidden input to still submit the URL with the form */}
                                                <input type="hidden" name="image_url" value={formData.image_url} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Content Editor */}
                                    <div>
                                        <label className="block text-xs font-bold text-padel-green mb-1 uppercase tracking-wider">Blog Content (HTML Supported)</label>
                                        <textarea
                                            name="content"
                                            required
                                            rows="10"
                                            value={formData.content}
                                            onChange={handleInputChange}
                                            placeholder="Write your blog post content here. You can use HTML tags like <h2>, <p>, <strong>..."
                                            className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-4 text-white focus:border-padel-green focus:outline-none transition-colors font-mono text-sm leading-relaxed"
                                        ></textarea>
                                    </div>

                                </form>
                            </div>

                            <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-4 mt-auto">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-6 py-3 text-white font-bold hover:bg-white/10 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    form="blog-form"
                                    className="flex items-center gap-2 bg-padel-green text-black px-8 py-3 rounded-xl font-bold hover:bg-white hover:scale-105 transition-all"
                                >
                                    <Save size={20} />
                                    {editingPost ? 'Save Changes' : 'Publish Post'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default BlogManager;
