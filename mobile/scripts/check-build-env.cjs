// EAS supplies these values before bundling. Never print their contents.
const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
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
