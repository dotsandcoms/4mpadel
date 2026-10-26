import { buildAccessEmail } from './accessEmail.js';

const moduleNames = {
  federations: 'Federations', organisations: 'Organisations', clubs: 'Clubs',
  players: 'Players', coaches: 'Coaches', calendar: 'Calendar',
  'event-mgmt': 'Event Manager', finance: 'Finance', gallery: 'Gallery',
  'email-broadcast': 'Email broadcast', blog: 'Blog', settings: 'Settings',
  'admin-mgmt': 'Access & permissions',
};

export function permissionNotificationGate(trustedService, enabled) {
  if (!trustedService) return { status: 403, error: 'Forbidden: trusted permission workflow required' };
  if (enabled !== 'true') return { status: 409, error: 'Permission notifications are not enabled' };
  return null;
}

// Called only after send-email's trusted-service and feature-enable checks.
// Never use a browser's draft or caller-supplied scope summary.
export async function buildSavedPermissionNotification(client, to, bcc) {
  if (typeof to !== 'string' || !to.trim() || /[\r\n,;]/.test(to) || bcc) throw new Error('Permission notifications require one recipient and no BCC');
  const email = to.trim().toLowerCase();
  const { data: record, error } = await client.from('admin_sidebar_permissions')
    .select('email,role,allowed_tabs,module_permissions').eq('email', email).maybeSingle();
  if (error) throw error;
  if (!record || record.email?.toLowerCase() !== email) throw new Error('Saved permission record not found');
  if (!['super_admin', 'custom'].includes(record.role)) throw new Error('Unsupported permission role');
  const tabs = Array.isArray(record.allowed_tabs) ? record.allowed_tabs : [];
  const selected = key => {
    const values = record.module_permissions?.[key]?.allowedEvents;
    return Array.isArray(values) ? values.map(id => `Event #${id}`) : [];
  };
  return buildAccessEmail({ name: '', modules: tabs.map(id => moduleNames[id] || id),
    superAdmin: record.role === 'super_admin', eventNames: selected('event-mgmt'),
    financeEventNames: tabs.includes('finance') ? selected('finance') : [],
  });
}
