import { useLocation, useNavigate } from 'react-router-dom';
import AccountSecurity from '../../../components/admin/AccountSecurity';
import EventMessaging from '../../../components/admin/EventMessaging';
import HelpRequestsAdmin from '../../../components/admin/HelpRequestsAdmin';
import { useHelpUnread } from '../../../components/admin/useHelpUnread';
import { helpTicketFromSearch } from '../../../utils/helpLinks';

const moduleSurface = 'min-w-0 rounded-2xl bg-[#0D1112] p-4 text-white [color-scheme:dark] sm:p-6';

export function CurrentMessaging({ session }) {
  const actor = session?.user;
  if (!actor?.id) return null;

  return (
    <div className={moduleSurface}>
      <EventMessaging key={`${actor.id}:${actor.email}`} />
    </div>
  );
}

function HelpQueue() {
  const location = useLocation();
  const navigate = useNavigate();
  const { unread, revision, refresh } = useHelpUnread();

  const closeTicket = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has('ticket')) return;
    params.delete('ticket');
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, {
      replace: true,
      state: location.state,
    });
  };

  return (
    <div className="min-w-0 [color-scheme:dark]">
      <HelpRequestsAdmin
        initialTicket={helpTicketFromSearch(location.search)}
        unread={unread}
        revision={revision}
        onChange={refresh}
        onCloseTicket={closeTicket}
      />
    </div>
  );
}

export function CurrentHelp({ session }) {
  const actor = session?.user;
  if (!actor?.id) return null;
  return <HelpQueue key={`${actor.id}:${actor.email}`} />;
}

export function CurrentSecurity({ session, permissions, targetEmail }) {
  const actor = session?.user;
  if (!actor?.id) return null;

  const isOwnAccount = actor.email && (!targetEmail || targetEmail.toLowerCase() === actor.email.toLowerCase());
  const canRecover = Boolean(isOwnAccount && permissions?.role === 'super_admin');

  return (
    <div className={moduleSurface}>
      <AccountSecurity key={`${actor.id}:${actor.email}`} userId={actor.id} canRecover={canRecover} />
    </div>
  );
}
