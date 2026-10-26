import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function PayoutDetails({ row, onClose }) {
  const dialogRef = useRef(null), heading = useRef(null), titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden'; heading.current.focus({ preventScroll: true });
    return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={dialogRef} className="fo-ledger-drawer" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="fo-heading fo-drawer-header"><div><h2 ref={heading} id={titleId} tabIndex={-1}>Recorded payout details</h2><p>{row.eventName}</p></div><button className="ap-icon-button" aria-label="Close payout details" onClick={onClose}><X size={22}/></button></header>
    <div className="fo-drawer-body" tabIndex={0} aria-label="Payout details content">
      <p className="fo-note">Read-only event record. This does not confirm that a bank transfer was made. No request, approval, edit or transfer is performed here.</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(100px,1fr) minmax(0,3fr)', gap: '16px 24px', margin: 0, overflowWrap: 'anywhere' }}>{[
        ['Event', row.eventName], ['Event ID', row.eventId], ['Organiser', row.organiserName], ['Record ID', row.recordId || 'Unavailable'],
        ['Payment date', row.paidAt || 'Unavailable'], ['Recorded amount', row.amountCents == null ? 'Unavailable — review required' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(row.amountCents / 100)],
      ].map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></React.Fragment>)}</dl>
      <section><h3>Recorded note</h3><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.note || 'No note recorded.'}</p></section>
      <section><h3>Record quality</h3>{row.warnings.length ? <ul>{row.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : <p>No structural warnings were found in this record. Bank verification is still not established.</p>}</section>
    </div>
  </dialog>;
}
