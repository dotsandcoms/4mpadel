import { ArrowRight, CalendarDays, CreditCard, Mail, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import './ReviewSettingsWorkspace.css';

const services = [
  { route: 'payments', title: 'Paystack', description: 'Find gateway transactions and review saved checkouts.', icon: CreditCard, action: 'Open Payments' },
  { route: 'calendar', title: 'RankedIn', description: 'Review event sources and refresh linked event records.', icon: CalendarDays, action: 'Open Calendar' },
  { route: 'email', title: 'Email delivery', description: 'Review recipients and delivery before sending an email broadcast.', icon: Mail, action: 'Open Email broadcast' },
  { route: 'security', title: 'Authenticator', description: 'Manage the devices used to verify sensitive actions.', icon: ShieldCheck, action: 'Open Account Security' },
];

export default function ReviewIntegrationsWorkspace({ canOpen }) {
  return <>
    <header className="ap-page-heading"><div><p className="ap-kicker">System</p><h1>Integrations</h1><p className="ap-lede">Open the workspace that manages each connected service.</p></div></header>
    <div className="ap-settings-workspace">{services.filter(service => canOpen(service.route)).map(({ route, title, description, action, icon: Icon }) =>
      <section className="ap-section" key={route}>
        <header className="ap-section-heading"><h2><Icon size={17} aria-hidden="true" /> {title}</h2></header>
        <div className="ap-settings-content"><p>{description}</p><div><Link className="ap-secondary" to={`/admin-preview/${route}`}>{action} <ArrowRight size={15}/></Link></div></div>
      </section>
    )}</div>
  </>;
}
