import { ACCESS_MODULES } from './permissionsData';
import { buildAccessEmail } from './accessEmail';

export default function AccessEmailPreview({ draft, name, events }) {
  const eventNames = key => (draft.module_permissions[key]?.allowedEvents || []).map(id => events.find(event => String(event.id) === String(id))?.event_name || `Event #${id}`);
  const email = buildAccessEmail({ name, superAdmin: draft.role === 'super_admin', modules: draft.allowed_tabs.map(id => ACCESS_MODULES.find(module => module[0] === id)?.[1] || id), eventNames: eventNames('event-mgmt'), financeEventNames: eventNames('finance') });
  return <details className="ax-action-group ax-email-preview"><summary>Permission notification email · preview only</summary>
    <p>No email will be sent. This shows the proposed template after a successful access update; action-level proposals are excluded because they are not implemented on the live system.</p>
    <p><strong>To:</strong> {draft.email}<br /><strong>Subject:</strong> {email.subject}</p>
    <p className="ax-note">Scroll inside the email below to review the full message, or open the plain-text version underneath.</p>
    <iframe title="Permission notification email design" sandbox="" srcDoc={email.html} />
    <details><summary>Plain-text version</summary><pre>{email.text}</pre></details>
    <p className="ax-note">Sending, delivery status and retry protection will be connected only after secure permission saving is implemented. The button uses the current deployed admin route, not admin-preview.</p>
  </details>;
}
