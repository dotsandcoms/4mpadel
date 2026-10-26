import React from 'react';
import { ChevronDown } from 'lucide-react';
import './EventTeamDivisions.css';

export default function EventTeamDivisions({ groups, renderTeam, formatMoney }) {
  return <div className="ap-team-divisions">
    {groups.length === 0 && <p className="ap-empty-inline">No teams match these filters.</p>}
    {groups.map(group => <details className="ap-section ap-team-division" key={group.name}>
      <summary>
        <span className="ap-team-division-title"><strong>{group.name}</strong><span>
          {group.division.entry_fee != null && <small>Entry fee {formatMoney(Number(group.division.entry_fee))}</small>}
          {group.division.license_required && <small>Licence required</small>}
        </span></span>
        <span className="ap-team-division-count">{group.teams.length === group.total ? group.total : `${group.teams.length} of ${group.total}`} {group.total === 1 ? 'team' : 'teams'}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="ap-event-demo-table">
        {group.teams.length ? <><div className="ap-team-row ap-event-demo-head"><span>Seed</span><span>Players</span><span>Payment</span><span>Amount paid</span><span>Licence status</span><span>Manage</span></div>{group.teams.map(renderTeam)}</>
          : <p className="ap-empty-inline">No teams in this division.</p>}
      </div>
    </details>)}
  </div>;
}
