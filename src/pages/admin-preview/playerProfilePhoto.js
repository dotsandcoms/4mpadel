import { verifyPlayerEditAccess } from './playerProfileEdit.js';

// Match CURRENT MAIN PlayerManager.resizeImage: preserve proportions, shrink
// only widths over 1200px, and encode JPEG at quality 0.8. No profile row is saved.
function resizeProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const reader = new FileReader(), image = new Image();
    const settle = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reader.onload = reader.onerror = reader.onabort = null;
      image.onload = image.onerror = null;
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => settle(new Error('Image processing timed out. Choose another image and try again.')), 30000);
    reader.onerror = reader.onabort = () => settle(new Error('The selected image could not be read.'));
    image.onerror = () => settle(new Error('The selected file could not be decoded as an image.'));
    reader.onload = () => { if (!finished) image.src = reader.result; };
    image.onload = () => {
      if (finished) return;
      try {
        let width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('The image has invalid dimensions.');
        if (width > 1200) { height = Math.max(1, Math.round(height * 1200 / width)); width = 1200; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Image processing is unavailable in this browser.');
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(blob => {
          if (!blob || !blob.size) settle(new Error('The image could not be converted to JPEG.'));
          else settle(null, blob);
        }, 'image/jpeg', 0.8);
      } catch (error) { settle(error); }
    };
    try { reader.readAsDataURL(file); } catch (error) { settle(error); }
  });
}

export async function uploadPlayerProfilePhoto(client, playerId, file, context) {
  if (!/^[a-zA-Z0-9_-]+$/.test(String(playerId ?? ''))) throw new Error('Select a saved player before uploading a profile photo.');
  if (!file || !/^image\//i.test(file.type || '') || !Number.isFinite(file.size) || file.size <= 0) throw new Error('Choose a non-empty image file.');
  await verifyPlayerEditAccess(client, context);
  const jpeg = await resizeProfilePhoto(file);
  // Permission may have changed while decoding a large image.
  await verifyPlayerEditAccess(client, context);
  const path = `players/${playerId}_${Date.now()}.jpg`;
  const bucket = client.storage.from('profile-pics');
  const { error } = await bucket.upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(`Profile photo upload failed: ${error.message || 'Storage did not confirm the upload.'}`);
  const { data, error: urlError } = bucket.getPublicUrl(path);
  if (urlError || !data?.publicUrl) throw new Error('Photo uploaded, but its URL could not be confirmed. The player profile has not been changed.');
  return data.publicUrl;
}
