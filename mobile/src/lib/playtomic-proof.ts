import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { PROOF_BUCKET } from './profile-details';
import { supabase } from './supabase';

/** Keep the whole screenshot readable; convert camera/HEIC images to bounded JPEG. */
export async function choosePlaytomicProof(playerId?: number, signupUserId?: string): Promise<string | null> {
  const prefix = playerId ? String(playerId) : signupUserId ? `signup/${signupUserId}` : '';
  if (!prefix) throw new Error('Sign in before uploading a screenshot.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, allowsEditing: false, quality: 1 });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const context = ImageManipulator.manipulate(asset.uri);
  let rendered: ImageRef | undefined;
  let file: File | undefined;
  try {
    if (Math.max(asset.width, asset.height) > 2048) context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
    rendered = await context.renderAsync();
    const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
    if (Platform.OS !== 'web') file = new File(image.uri);
    const bytes = file ? await file.arrayBuffer() : await (await fetch(image.uri)).arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) throw new Error('Choose a smaller image (up to 5 MB).');
    const path = `${prefix}/${Crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
    if (error) throw new Error('Your screenshot could not be uploaded. Please try again.');
    return path;
  } finally {
    context.release();
    rendered?.release();
    try { if (file?.exists) file.delete(); } catch { /* The OS may already clear its cache. */ }
  }
}
