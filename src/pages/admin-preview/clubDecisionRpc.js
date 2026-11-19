import { verifyClubCreationAccess } from './clubCreation.js';
import { clubClaimDecisionArguments } from './clubManagementData.js';

export const CLUB_DECISION_STAGING_URL = 'https://cefmzkwabdqqoagxhekc.supabase.co';
const environment = () => ({ enable: import.meta.env?.VITE_ENABLE_CLUB_DECISIONS });
export function isClubDecisionEnabled(client, config = environment()) {
  return config?.enable === 'staging' && client?.supabaseUrl === CLUB_DECISION_STAGING_URL;
}
function requireStaging(client, config) {
  if (!isClubDecisionEnabled(client, config)) throw new Error('Club decisions are enabled only on the verified staging project.');
}
export function applicationDecisionArguments(record, decision, notes = '') {
  if (!record?.id || !['pending', 'in_review'].includes(record.status)) throw new Error('Only a pending club application can be reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Choose approval or rejection.');
  if (typeof notes !== 'string' || notes.trim().length > 2000) throw new Error('Feedback must be text of at most 2000 characters.');
  const feedback = notes.trim();
  if (decision === 'rejected' && !feedback) throw new Error('Rejection feedback is required.');
  if (decision === 'approved' && feedback) throw new Error('Approval cannot include rejection feedback.');
  const keys = ['name', 'status', 'contact_email', 'contacts', 'created_by'];
  if (keys.some(key => !Object.hasOwn(record, key))) throw new Error('Reload the complete application before reviewing.');
  return { p_club_id: record.id, p_decision: decision, p_rejection_notes: feedback || null,
    p_expected_application: structuredClone(Object.fromEntries(keys.map(key => [key, record[key]]))) };
}
export function claimDecisionArguments(record, decision, notes = '') {
  const args = clubClaimDecisionArguments(record, decision, notes);
  if (!record.club_id || !Object.hasOwn(record, 'requester_player_id') || !record.requester_email) throw new Error('Reload the complete claim before reviewing.');
  const keys = ['club_id', 'requester_email', 'requester_player_id', 'status', 'full_name', 'contact_phone', 'primary_role', 'notes', 'created_at'];
  return { ...args, p_expected_club_id: record.club_id,
    p_expected_claim: structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]))) };
}
export async function loadClubApplicationReview({ client, scopeId, userId, clubId, config }) {
  requireStaging(client, config);
  await verifyClubCreationAccess(client, scopeId, userId);
  requireStaging(client, config);
  const { data, error } = await client.from('clubs').select('id,name,status,contact_email,contacts,created_by').eq('id', clubId).single();
  if (error || !data) throw new Error(error?.message || 'Application is unavailable.');
  applicationDecisionArguments(data, 'approved');
  return data;
}
export async function submitClubDecision({ client, scopeId, userId, kind, args, isCurrent = () => true, config }) {
  requireStaging(client, config);
  if (!['claim', 'application'].includes(kind)) throw new Error('Unknown club decision.');
  await verifyClubCreationAccess(client, scopeId, userId);
  requireStaging(client, config);
  if (!isCurrent()) throw new Error('The reviewed club context changed. Reopen the decision.');
  const { data, error } = await client.rpc(kind === 'claim' ? 'preview_decide_club_claim' : 'preview_decide_club_application', args);
  if (error) throw new Error(error.message || 'The decision could not be confirmed.');
  if (!data || !['approved', 'rejected', 'published'].includes(data.status)) throw new Error('The decision response was not recognised. Reload before retrying.');
  return data;
}
export const clubDecisionApi = { enabled: isClubDecisionEnabled, load: loadClubApplicationReview, submit: submitClubDecision };
