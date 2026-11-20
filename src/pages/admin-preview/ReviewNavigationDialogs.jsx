import { useEffect, useRef } from 'react';
import { CalendarDays, X, Zap } from 'lucide-react';
import { useAdminFeedNotifications } from '../../hooks/useAdminFeedNotifications';

export function ReviewDialog({ title, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="ap-payment-dialog" aria-label={title} onCancel={event => {
    event.preventDefault();
    onClose();
  }}>
    <header>
      <h2>{title}</h2>
      <button type="button" className="ap-icon-button" onClick={onClose} aria-label={`Close ${title.toLowerCase()}`}><X size={19} /></button>
    </header>
    {children}
  </dialog>;
}

export function CreateEventMenu({ onClose, onSelect }) {
  return <ReviewDialog title="Create an event" onClose={onClose}>
    <div className="ap-export-options">
      <button type="button" onClick={() => onSelect('full')}>
        <CalendarDays size={21} /><span><b>Full event</b><small>Set up divisions, registration and payments</small></span>
      </button>
      <button type="button" onClick={() => onSelect('quick')}>
        <Zap size={21} /><span><b>Quick event</b><small>Open a simple registration for one date</small></span>
      </button>
    </div>
  </ReviewDialog>;
}

export function ReviewNotifications({ onClose, canOpen, go }) {
  const { notifications, loading } = useAdminFeedNotifications();
  const destinations = { payment: 'payments', player: 'players', event: 'calendar' };
  return <ReviewDialog title="Notifications" onClose={onClose}>
    {loading ? <p role="status">Loading notifications…</p> : !notifications.length ? <p>No recent notifications.</p> :
      <div className="ap-export-options">
        {notifications.map(item => <div key={item.id}>
          <p><strong>{item.title}</strong><br />{item.subtitle} · {item.timeAgo}</p>
          {canOpen(destinations[item.type]) && <button className="ap-secondary" type="button" onClick={() => {
            go(destinations[item.type]);
            onClose();
          }}>Open {item.type === 'payment' ? 'payments' : item.type === 'player' ? 'players' : 'calendar'}</button>}
        </div>)}
      </div>}
  </ReviewDialog>;
}
