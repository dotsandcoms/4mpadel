// A partner can be recorded without a separate registration row.
export function isSoloTeam(team) {
  return team.length === 1 && !String(team[0].partner_name || '').trim()
    && !String(team[0].partner_email || '').trim();
}
