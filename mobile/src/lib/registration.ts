/** Values mirrored from the website AuthModal player-registration form. */

export const SA_REGIONS = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
] as const;

export const REGION_BADGE: Record<(typeof SA_REGIONS)[number], string> = {
  'Eastern Cape': 'EC',
  'Free State': 'FS',
  Gauteng: 'GP',
  'KwaZulu-Natal': 'KZN',
  Limpopo: 'LP',
  Mpumalanga: 'MP',
  'Northern Cape': 'NC',
  'North West': 'NW',
  'Western Cape': 'WC',
};

export const NATIONALITIES = [
  { label: 'South Africa', value: 'South Africa', badge: 'ZA' },
  { label: 'Namibia', value: 'Namibia', badge: 'NA' },
  { label: 'Zimbabwe', value: 'Zimbabwe', badge: 'ZW' },
  { label: 'Botswana', value: 'Botswana', badge: 'BW' },
  { label: 'Mozambique', value: 'Mozambique', badge: 'MZ' },
  { label: 'Lesotho', value: 'Lesotho', badge: 'LS' },
  { label: 'Eswatini', value: 'Eswatini', badge: 'SZ' },
  { label: 'Portugal', value: 'Portugal', badge: 'PT' },
  { label: 'Spain', value: 'Spain', badge: 'ES' },
  { label: 'Argentina', value: 'Argentina', badge: 'AR' },
  { label: 'Brazil', value: 'Brazil', badge: 'BR' },
  { label: 'France', value: 'France', badge: 'FR' },
  { label: 'Italy', value: 'Italy', badge: 'IT' },
  { label: 'United Kingdom', value: 'United Kingdom', badge: 'GB' },
  { label: 'Germany', value: 'Germany', badge: 'DE' },
  { label: 'Netherlands', value: 'Netherlands', badge: 'NL' },
  { label: 'United States', value: 'United States', badge: 'US' },
  { label: 'Australia', value: 'Australia', badge: 'AU' },
] as const;

export const GENDERS = ['Male', 'Female'] as const;

export const CATEGORIES = [
  { group: "Men's", options: ["Men's Open (Pro/Elite)", "Men's Advanced", "Men's Intermediate"] },
  { group: 'Ladies', options: ['Ladies Open (Pro/Elite)', 'Ladies Advanced', 'Ladies Intermediate'] },
] as const;

export const RACKET_BRANDS = [
  'Adidas',
  'Babolat',
  'Bull Padel',
  'Nox',
  'Varlion',
  'Oxdog',
  'Wilson',
  'Head',
  'Siux',
  'Other',
] as const;

export type ClubOption = { id: string; name: string };
