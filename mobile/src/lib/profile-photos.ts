import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { galleryOf, updateGallery } from './profile';
import { supabase } from './supabase';

export const MAX_PLAYER_GALLERY_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
type PhotoKind = 'profile' | 'gallery';

async function pickPhoto(kind: PhotoKind) {
  // Image-only system pickers do not need access to the entire photo library.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    allowsEditing: kind === 'profile',
    aspect: [1, 1],
    quality: 1,
  });
  return result.canceled ? null : result.assets[0] ?? null;
}

/** Convert HEIC and large camera images to a bounded JPEG before uploading. */
async function uploadPhoto(playerId: number, asset: ImagePicker.ImagePickerAsset, kind: PhotoKind) {
  const maxEdge = kind === 'profile' ? 1024 : 2048;
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: ImageRef | undefined;
  let file: File | undefined;
  try {
    if (Math.max(asset.width, asset.height) > maxEdge) {
      context.resize(asset.width >= asset.height ? { width: maxEdge } : { height: maxEdge });
    }
    rendered = await context.renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    let bytes: ArrayBuffer;
    if (Platform.OS === 'web') {
      bytes = await (await fetch(image.uri)).arrayBuffer();
    } else {
      file = new File(image.uri);
      bytes = await file.arrayBuffer();
    }
    if (!bytes.byteLength) throw new Error('That photo could not be read. Please choose another.');
    if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('Please choose a smaller photo (under 5MB).');

    // Use the same player folder as the website, with a fresh URL for image caches.
    const path = `${playerId}/${kind}_${Crypto.randomUUID()}.jpg`;
    const storage = supabase.storage.from('profile-pics');
    const { error } = await storage.upload(path, bytes, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw new Error(error.message);
    return storage.getPublicUrl(path).data.publicUrl;
  } finally {
    context.release();
    rendered?.release();
    // Only remove the compressed cache copy that this function created.
    try { if (file?.exists) file.delete(); } catch { /* The OS can clear its cache later. */ }
  }
}

/** Saves independently of the details form, including on incomplete profiles. */
export async function changeProfilePhoto(playerId: number): Promise<string | null> {
  const asset = await pickPhoto('profile');
  if (!asset) return null;
  const url = await uploadPhoto(playerId, asset, 'profile');
  const { data, error } = await supabase.from('players').update({ image_url: url })
    .eq('id', playerId).select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Unable to save your profile photo. Please try again.');
  return url;
}

export async function addGalleryPhoto(playerId: number): Promise<string[] | null> {
  const asset = await pickPhoto('gallery');
  if (!asset) return null;
  // The picker may have been open for a while; append to the current saved gallery.
  const { data, error } = await supabase.from('players').select('additional_images')
    .eq('id', playerId).single();
  if (error) throw new Error(error.message);
  const gallery = galleryOf(data);
  if (gallery.length >= MAX_PLAYER_GALLERY_PHOTOS) {
    throw new Error('Your gallery is full. Remove a photo before adding another.');
  }
  const url = await uploadPhoto(playerId, asset, 'gallery');
  const next = [...gallery, url];
  await updateGallery(playerId, next);
  return next;
}
