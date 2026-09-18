import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { checkPadelAccess, createPadelReader, PadelCheckError } from './lib/padel-api-check.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: node scripts/check-padel-api.mjs\nReads PADEL_API_TOKEN from .env.local or the environment.\nMakes up to six GET requests (~35 seconds), prints a summary, and does not write to Supabase.');
} else {
  try {
    let local = {};
    try {
      local = parse(readFileSync(new URL('../.env.local', import.meta.url)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new PadelCheckError('Could not read .env.local. Check its permissions.');
    }
    const token = process.env.PADEL_API_TOKEN || local.PADEL_API_TOKEN;
    const read = createPadelReader(token);
    console.log('Checking Padel API access for the website. The token will not be printed.');
    const report = await checkPadelAccess({ read });
    console.log(JSON.stringify(report, null, 2));
    console.log('Connection check complete. This does not deploy or publish the website integration.');
  } catch (error) {
    console.error(error instanceof PadelCheckError ? error.message : 'The connection check failed unexpectedly. No credentials or raw responses have been logged.');
    process.exitCode = 1;
  }
}
