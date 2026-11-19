export const organisationFields = [
  'name', 'short_name', 'org_type', 'linked_status', 'linked_club_name', 'sapa_intent', 'coverage',
  'year_established', 'about', 'brand_color', 'logo_url', 'cover_image_url', 'contact_email',
  'contact_phone', 'whatsapp_number', 'website_url', 'socials', 'contacts', 'sponsors',
];

export const socialFields = ['instagram', 'facebook', 'tiktok', 'youtube'];
export const organisationCollections = {
  contacts: {
    singular: 'contact', label: 'Contact directory', fields: { name: 'Name', role: 'Role', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp' },
  },
  sponsors: {
    singular: 'sponsor', label: 'Sponsors and partners', fields: { name: 'Name', tier: 'Tier', logo_url: 'Logo URL' },
  },
};

export const organisationLabels = {
  name: 'Name', short_name: 'Short name', org_type: 'Organisation type', linked_status: 'Club relationship',
  linked_club_name: 'Linked club name', sapa_intent: 'SAPA sanction intent', coverage: 'Coverage area',
  year_established: 'Year established', about: 'About', brand_color: 'Brand colour',
  logo_url: 'Logo URL', cover_image_url: 'Cover image URL', contact_email: 'Contact email', contact_phone: 'Contact phone',
  whatsapp_number: 'WhatsApp number', website_url: 'Website', socials: 'Social links', contacts: 'Contact directory',
  sponsors: 'Sponsors and partners',
};

const text = value => String(value ?? '').trim();
const safeUrl = (value, label) => {
  if (!text(value)) return null;
  try {
    const url = new URL(value);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    // Show a field-specific validation message.
  }
  throw new Error(`Enter a valid web address for ${label}.`);
};

export function normaliseOrganisationField(key, raw) {
  if (key === 'socials') return Object.fromEntries(socialFields.map(platform => [platform, text(raw?.[platform])]));
  if (Object.hasOwn(organisationCollections, key)) {
    const fields = Object.keys(organisationCollections[key].fields);
    return (Array.isArray(raw) ? raw : []).filter(row => row && fields.some(field => text(row[field]))).map(row => {
      const result = Object.fromEntries(fields.map(field => [field, text(row[field])]));
      if (key === 'contacts' && Object.hasOwn(row, 'is_primary')) result.is_primary = Boolean(row.is_primary);
      if (key === 'sponsors') result.logo_url = safeUrl(result.logo_url, 'the sponsor logo') || '';
      return result;
    });
  }
  const value = text(raw);
  if (key === 'year_established') {
    if (!value) return null;
    const year = Number(value);
    if (!Number.isInteger(year) || year < 1800 || year > new Date().getFullYear()) throw new Error('Enter a valid year established.');
    return year;
  }
  if (key === 'brand_color' && value && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Use a six-digit hex brand colour.');
  if (key.endsWith('_url')) return safeUrl(value, organisationLabels[key]);
  return value || null;
}

export function organisationImageExtension(field, file) {
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const limit = field === 'logo_url' ? 2 : 5;
  if (!['logo_url', 'cover_image_url'].includes(field) || !Object.hasOwn(extensions, file?.type)
    || !Number.isFinite(file?.size) || file.size <= 0 || file.size > limit * 1024 * 1024) {
    throw new Error(`Choose a JPEG, PNG or WebP image up to ${limit} MB.`);
  }
  return extensions[file.type];
}
