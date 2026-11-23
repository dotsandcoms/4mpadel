import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { clubGoogleScan } from '../_shared/club-google-scan.ts';

serve(clubGoogleScan(true));
