import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useRef, useState } from 'react';
import EventPlayerSearch from './EventPlayerSearch';
import './EventEntryForm.css';

const money = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
export default function EventEntryForm({ divisions, onReview, search, save, onBusy = () => {} }) {
  const [draft, setDraft] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const [team, setTeam] = useState(false), [player, setPlayer] = useState(null), [partner, setPartner] = useState(null);
  const [divisionId, setDivisionId] = useState(''), [note, setNote] = useState('');
  const division = divisions.find(row => String(row.id) === divisionId);
  const fee = division?.entry_fee == null ? null : Number(division.entry_fee);
  const validFee = fee !== null && Number.isFinite(fee) && fee >= 0;
  const duplicate = Boolean(team && player && partner && (String(player.id) === String(partner.id) || player.email.trim().toLowerCase() === partner.email.trim().toLowerCase()));
  const valid = player && (!team || partner) && !duplicate && division && validFee;
  if (draft) return <div className="ap-demo-form"><h3>Confirm pending registration</h3><p>{draft.players.map(row => row.name || row.email).join(' / ')}</p><p>{draft.division.name} · {money(draft.amountDue)} due</p>{draft.note && <p>Note: {draft.note}</p>}<p>This creates {draft.players.length} live registration{draft.players.length === 1 ? '' : 's'} and sends confirmation emails. Payment remains pending.</p>{error && <p role="alert">{error} Close and refresh before retrying if the result is uncertain.</p>}<div className="ap-player-payment-actions"><button className="ap-secondary" disabled={busy} onClick={()=>setDraft(null)}>Back</button><button className="ap-primary" disabled={busy || Boolean(error)} onClick={async()=>{if(saving.current)return;saving.current=true;setBusy(true);onBusy(true);try{const result=await save(draft);onReview({...draft,saved:true,warnings:result.warnings});}catch(err){setError(err.message || 'Could not save registration.');}finally{saving.current=false;setBusy(false);onBusy(false);}}}>{busy ? 'Saving registrations…' : 'Confirm and add pending'}</button></div></div>;
  return <form className="ap-demo-form" onSubmit={event => { event.preventDefault(); if (valid) { const next = { players: team ? [player, partner] : [player], division, note: note.trim(), payment_status: 'pending', amountDue: fee * (team ? 2 : 1) }; if (save) setDraft(next); else onReview(next); } }}>
    <div className="ap-player-payment-actions" role="group" aria-label="Entry type"><button type="button" className={team ? 'ap-secondary' : 'ap-primary'} aria-pressed={!team} onClick={() => setTeam(false)}>Single player</button><button type="button" className={team ? 'ap-primary' : 'ap-secondary'} aria-pressed={team} onClick={() => setTeam(true)}>Full team</button></div>
    <p>Add provisionally with payment pending. Mark paid or complimentary afterwards.</p>
    <div role="group" aria-label="First player"><EventPlayerSearch selected={player} onSelect={setPlayer} search={search}/></div>
    {team && <div role="group" aria-label="Second player"><h3>Partner</h3><EventPlayerSearch selected={partner} onSelect={setPartner} search={search}/></div>}
    {duplicate && <p role="alert">Choose two different players for the team.</p>}
    <label>Division<SearchableDropdown required value={divisionId} onChange={event => setDivisionId(event.target.value)}><option value="">Select a division</option>{divisions.map(row => <option key={row.id} value={row.id}>{row.name || row.division_name} · {row.entry_fee == null ? 'Fee unavailable' : money(Number(row.entry_fee))}</option>)}</SearchableDropdown></label>
    <section className="ap-entry-payment-summary" role="status" aria-label="Entry payment status">
      <span className="ap-entry-payment-label">Entry status</span>
      <strong>Pending payment{validFee ? ` · ${money(fee * (team ? 2 : 1))} due` : ''}</strong>
      {validFee && team && <span>{money(fee)} per player</span>}
      <p>{division && !validFee ? 'Entry fee is unavailable; check the division setup before continuing.' : !division ? 'Select a division to see the amount due.' : 'After adding, mark each player paid or complimentary from their registration.'}</p>
    </section>
    <label>Note (optional)<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} placeholder="Added for club — will pay later"/></label>
    <p>{save ? 'You will review the registration before saving and sending confirmation emails.' : 'Local preview only. Sign in with authorised access to save registrations.'}</p>
    <button className="ap-primary" type="submit" disabled={!valid}>Review {team ? 'team' : 'player'} (pending)</button>
  </form>;
}
