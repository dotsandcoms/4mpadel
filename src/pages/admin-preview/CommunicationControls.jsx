import { ArrowLeft, RefreshCw } from 'lucide-react';
import './CommunicationsWorkspace.css';

export function CommunicationHeading({ eyebrow, title, description, onRefresh, onBack, backLabel, refreshing }) {
  return (
    <header className="ap-page-heading">
      <div>
        <p className="ap-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="ap-comms-header-actions">
        {onBack && <button className="ap-secondary" type="button" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />{backLabel}</button>}
        {onRefresh && <button className="ap-secondary" type="button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} aria-hidden="true" />Refresh</button>}
      </div>
    </header>
  );
}

export function CommunicationFeedback({ error, message }) {
  return <>
    {error && <p className="ap-comms-error" role="alert">{error}</p>}
    {message && <p className="ap-comms-success" role="status">{message}</p>}
  </>;
}

export function CommunicationPages({ label, previous, next, pageNumber, children }) {
  return (
    <footer className="ap-comms-pager">
      <p>{children}</p>
      <nav className="ap-comms-actions" aria-label={label}>
        <button className="ap-secondary" type="button" disabled={!previous} onClick={previous}>Previous</button>
        <span aria-live="polite">Page {pageNumber}</span>
        <button className="ap-secondary" type="button" disabled={!next} onClick={next}>Next</button>
      </nav>
    </footer>
  );
}
