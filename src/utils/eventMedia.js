import { supabase } from '../supabaseClient';

export const resizeImage = (file, maxWidth = 1200, quality = 0.8, preserveAlpha = false) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (ev) => {
            const img = new Image();
            img.src = ev.target.result;
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (preserveAlpha) {
                    ctx.clearRect(0, 0, width, height);
                }
                ctx.drawImage(img, 0, 0, width, height);
                const mime = preserveAlpha ? 'image/png' : 'image/jpeg';
                canvas.toBlob(
                    (blob) => {
                        const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
                        resolve(new File(
                            [blob],
                            `${baseName}.${preserveAlpha ? 'png' : 'jpg'}`,
                            { type: mime, lastModified: Date.now() }
                        ));
                    },
                    mime,
                    quality
                );
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });

export const uploadToGallery = async (file, prefix, beforeWrite = async () => {}) => {
    const preserveAlpha = prefix === 'sponsors' || prefix === 'org-logos';
    const resized = await resizeImage(file, 1200, 0.8, preserveAlpha);
    const ext = preserveAlpha ? 'png' : 'jpg';
    const fileName = `${prefix}_${Math.random().toString(36).slice(2)}_${Date.now()}.${ext}`;
    const filePath = `${prefix}/${fileName}`;
    await beforeWrite();
    const { error } = await supabase.storage.from('gallery').upload(filePath, resized);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);
    return publicUrl;
};

export const uploadEventAsset = async (file, prefix, maxBytes = 10 * 1024 * 1024, beforeWrite = async () => {}) => {
    if (!file) throw new Error('Choose a file to upload');
    if (file.size > maxBytes) throw new Error(`File must be smaller than ${Math.round(maxBytes / (1024 * 1024))} MB`);
    const safeName = String(file.name || 'asset')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const filePath = `${prefix}/${Date.now()}_${Math.random().toString(36).slice(2)}_${safeName}`;
    await beforeWrite();
    const { error } = await supabase.storage.from('gallery').upload(filePath, file, {
        contentType: file.type || undefined,
        upsert: false,
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('gallery').getPublicUrl(filePath);
    return publicUrl;
};

