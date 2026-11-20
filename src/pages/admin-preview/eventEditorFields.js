// Field names and option values come from EventBuilder.blankForm/buildPayload.
export const EVENT_EDITOR_SECTIONS = {
  Details: { event_name: 'text', contact_details: 'text', organiser_name: 'text', organiser_email: 'email', organiser_phone: 'tel', organiser_website: 'url', start_date: 'date', end_date: 'date', start_time: 'time', end_time: 'time', city: 'text', venues: 'lines', address: 'text' },
  Registration: { registration_opens_at: 'datetime-local', registration_closes_at: 'datetime-local', entry_fee: 'number', early_bird_fee: 'number', early_bird_ends_at: 'datetime-local', entry_fee_notes: 'textarea', partner_requirement: ['Required', 'Optional', 'Not required'], max_teams_capacity: 'number', license_required_default: 'checkbox', allow_temporary_license: 'checkbox', payment_method: ['platform', 'eft', 'external', 'free'], payment_bank_name: 'text', payment_account_name: 'text', payment_account_number: 'text', payment_branch_code: 'text', payment_reference_note: 'text', external_payment_url: 'url' },
  Tournament: { tournament_director: 'text', referees: 'text', balls: 'text', courts_count: 'number', indoor_outdoor: ['Indoor', 'Outdoor', 'Panoramic', 'Mixed'], scoring_point: ['golden', 'silver', 'star', 'advantage'], default_match_format: ['TBC', 'Knockout', 'Groups', 'Groups + Knockout', 'Round Robin', 'Americano', 'Mexicano'], back_draw_options: 'text', prize_money_total: 'number', points_breakdown: 'richtext' },
  Content: { description: 'richtext', rules_regs: 'richtext', withdrawal_substitution: 'richtext', cut_off_times: 'textarea', draw_released: 'textarea' },
  'Media & branding': { custom_image_url: 'url', poster_image_url: 'url', poster_document_url: 'url', organiser_kit_url: 'url', organiser_logo_url: 'url', organiser_badge_text: 'text', media_gallery_urls: 'lines', sponsor_logos: 'lines' },
};
export const EVENT_FIELD_TYPES = Object.assign({}, ...Object.values(EVENT_EDITOR_SECTIONS));
EVENT_EDITOR_SECTIONS.Tournament.player_gift_types = 'gifts';
EVENT_FIELD_TYPES.player_gift_types = 'gifts';
export const PLAYER_GIFT_OPTIONS = { tshirt: 'Match T-shirt', cap: 'Cap', padel_bag: 'Padel bag', snack_drink: 'Snack & drink pack' };
export const fieldLabel = field => field === 'venues' ? 'Venues / Clubs' : field.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
export const DIVISION_EDITOR_FIELDS = { name: 'text', entry_fee: 'number', format: ['TBC', 'Knockout', 'Groups', 'Groups + Knockout', 'Round Robin', 'Americano', 'Mexicano'], entries_close_at: 'datetime-local', license_required: 'checkbox', scoring_point: ['golden', 'silver', 'star', 'advantage'], age_category: 'text', gender: ['', 'Men', 'Ladies', 'Mixed', 'Junior'], suggested_level: 'text', entry_limit: 'number', details: 'richtext' };
export function editorValue(value, type) {
  if (type === 'gifts') return Array.isArray(value) ? value : [];
  if (type === 'datetime-local' && value) return new Date(value).toLocaleString('sv-SE', { timeZone: 'Africa/Johannesburg' }).replace(' ', 'T').slice(0,16);
  if (type === 'lines') return Array.isArray(value) ? value.join('\n') : String(value || '');
  return value ?? (type === 'checkbox' ? false : '');
}
export function eventEditorDraft(event) {
  return Object.fromEntries(Object.entries(EVENT_FIELD_TYPES).map(([field, type]) => [field, editorValue(field === 'venues' ? (event.venues?.length ? event.venues : event.venue ? [event.venue] : []) : event[field], type)]));
}
