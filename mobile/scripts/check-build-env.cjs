// EAS supplies these values before bundling. Never print their contents.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const android = JSON.parse(fs.readFileSync(path.resolve(root, app.android.googleServicesFile), 'utf8'));
  const ios = fs.readFileSync(path.resolve(root, app.ios.googleServicesFile), 'utf8');
  const plistString = key => ios.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`))?.[1];
  if (android.project_info.project_id !== 'm-padel-e3fec' || plistString('PROJECT_ID') !== android.project_info.project_id ||
      plistString('BUNDLE_ID') !== app.ios.bundleIdentifier || !plistString('GOOGLE_APP_ID') ||
      !android.client.some(client => client.client_info.android_client_info?.package_name === app.android.package)) {
    throw new Error('mismatch');
  }
} catch {
  console.error('Firebase client configuration is missing or does not match this app. Include google-services.json and GoogleService-Info.plist for the 4M Padel Firebase project.');
  process.exit(1);
}
const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
if (process.env.EAS_BUILD_PLATFORM === 'android') required.push('EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY');
const missing = required.filter(name => !process.env[name]?.trim());
if (missing.length) {
  console.error(`Build configuration missing: ${missing.join(', ')}. Configure these in the EAS environment selected by eas.json before rebuilding.`);
  process.exit(1);
}
try {
  const url = new URL(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
} catch {
  console.error('EXPO_PUBLIC_SUPABASE_URL must be a valid HTTP(S) URL.');
  process.exit(1);
}
console.log('Required app build configuration is present.');
