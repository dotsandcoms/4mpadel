import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubApplicationDecision from '../../src/pages/admin-preview/ClubApplicationDecision';
import { Dialog } from '../../src/pages/admin-preview/PlayersWorkspace';
import { CLUB_DECISION_STAGING_URL, clubDecisionApi } from '../../src/pages/admin-preview/clubDecisionRpc';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const params = new URLSearchParams(location.search), config = { enable: 'staging' };
const state = window.clubDecisionQA = { calls: [], role: 'super_admin', busy: false };
const application = { id: 'club-qa', name: 'Synthetic staging application', status: 'in_review', contact_email: 'qa@example.invalid', contacts: [], created_by: null };
const claim = { id: 'claim-qa', club_id: 'club-qa', status: 'pending', requester_email: 'qa@example.invalid', requester_player_id: null, full_name: 'Synthetic claimant' };
const client = { supabaseUrl: CLUB_DECISION_STAGING_URL,
  auth: { getUser: async () => { if (params.has('context')) await new Promise(resolve => setTimeout(resolve, 300)); return { data: { user: { id: 'actor', email: 'qa@example.invalid' } } }; } },
  from() { return { select() { return this; }, ilike() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { role: state.role } }), single: async () => ({ data: application }) }; },
  rpc: async (name, args) => {if(name==='account_is_active')return{data:true};if(name==='is_super_admin')return{data:state.role==='super_admin'}; state.calls.push({ name, args }); await new Promise(resolve => setTimeout(resolve, 600)); return params.has('failure') ? { error: new Error('Synthetic record changed since review') } : { data: { status: args.p_decision === 'rejected' ? 'rejected' : params.has('claim') ? 'approved' : 'published', notification: 'pending' } }; },
};
const api = { enabled: value => clubDecisionApi.enabled(value, config), load: args => clubDecisionApi.load({ ...args, config }), submit: args => clubDecisionApi.submit({ ...args, config }) };
function App() {
  const [busy, setBusy] = React.useState(false), [closed, setClosed] = React.useState(false), [userId, setUserId] = React.useState('actor');
  state.changeContext = () => setUserId('different');
  return <div className="ap-root" style={{ display: 'block' }}>{!closed && <Dialog title="Synthetic club decision" className="fo-root clubs-root" busy={busy} onClose={() => { if (!state.busy) { state.closed = true; setClosed(true); } }}><ClubApplicationDecision kind={params.has('claim') ? 'claim' : 'application'} record={params.has('claim') ? claim : application} client={client} session={{ user: { id: userId } }} scopeId="all" decisionApi={params.has('preview') ? clubDecisionApi : api} onBusyChange={value => { state.busy = value; setBusy(value); }} onSaved={outcome => { state.saved = outcome; }}/></Dialog>}</div>;
}
createRoot(document.getElementById('root')).render(<App/>);
