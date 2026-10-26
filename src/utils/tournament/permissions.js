export const CAPABILITIES = {
    settings: 'Event settings', players: 'Players & eligibility', seeds: 'Seeding & formats',
    draws: 'Draws & publication', schedule: 'Schedule & publication', results: 'Enter results',
    corrections: 'Correct results & finalise', finance: 'Finances', access: 'Manage access',
};
export const ROLE_PRESETS = {
    administrator: { label: 'Tournament administrator', capabilities: Object.keys(CAPABILITIES) },
    operations: { label: 'Draw & schedule operator', capabilities: ['settings', 'players', 'seeds', 'draws', 'schedule'] },
    results: { label: 'Results operator', capabilities: ['results'] },
    finance: { label: 'Finance operator', capabilities: ['finance'] },
};
export const WORKSPACES = [
    ['overview', 'Overview', null], ['details', 'Event details', 'settings'],
    ['players', 'Players', 'players'], ['divisions', 'Divisions', 'seeds'],
    ['draws', 'Draws', 'draws'], ['schedule', 'Schedule', 'schedule'],
    ['results', 'Results', 'results'], ['finances', 'Finances', 'finance'],
    ['activity', 'Activity log', null], ['access', 'Access', 'access'],
];
export const can = (capabilities, capability) => capabilities?.includes(capability) || false;
export const visibleWorkspaces = capabilities => WORKSPACES.filter(([id, , capability]) =>
    !capability || can(capabilities, capability) || (id === 'results' && can(capabilities, 'corrections')));
export const defaultWorkspace = capabilities => capabilities.length === 1 && capabilities[0] === 'results' ? 'results' : 'overview';
