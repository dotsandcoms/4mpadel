import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export const MAX_SPONSOR_LOGO_BYTES = 2 * 1024 * 1024;
export function validateSponsorLogo(type: string | undefined, size: number) {
  if (!type?.startsWith('image/')) throw new Error('Please choose an image file (PNG, JPG, or SVG).');
  if (!Number.isFinite(size) || size <= 0) throw new Error('That image could not be read. Please choose another file.');
  if (size > MAX_SPONSOR_LOGO_BYTES) throw new Error('Logo must be smaller than 2MB.');
}

/** Same bucket, event folder and image/2MB rules as the website registration. */
export async function pickSponsorLogo(eventId: number, email: string): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = asset.file || new File(asset.uri);
  const type = asset.mimeType || file.type;
  validateSponsorLogo(type, file.size);
  const bytes = await file.arrayBuffer();
  validateSponsorLogo(type, bytes.byteLength);
  const ext = (asset.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
  const safeEmail = email.replace(/[^a-z0-9@._-]/gi, '_').slice(0, 80);
  const path = `tshirt-logos/${eventId}/${safeEmail}_${Crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('profile-pics').upload(path, bytes, { contentType: type, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return supabase.storage.from('profile-pics').getPublicUrl(path).data.publicUrl;
}
