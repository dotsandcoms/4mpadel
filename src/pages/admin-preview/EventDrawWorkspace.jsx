import { ChevronRight, ExternalLink, RefreshCw, Trophy } from 'lucide-react';

export default function EventDrawWorkspace({
  event, divisions, draws, registrationCount, tournamentWorkspaces = [], onOpenTournament, onDrawDetails,
  onGroupDraw, onNativeOperations, onRehearsal, onRankedinSync,
}) {
  const canOpen = workspace => onOpenTournament && tournamentWorkspaces.includes(workspace);
  const findDraw = division => {
    const inDivision = draws.filter(draw => String(draw.division_id) === String(division.id) && draw.status !== 'archived');
    return inDivision.find(draw => draw.draw_kind === 'main') || inDivision[0];
  };
  const firstPending = divisions.find(division => division.is_active !== false && !findDraw(division));

  return <>
    <div className="ap-tab-heading">
      <div><h2>Draws</h2><p>Choose a division to generate a draft or manage its saved draw.</p></div>
      <div className="ap-heading-actions">
        {canOpen('draws') && <button className="ap-primary" onClick={() => onOpenTournament(firstPending, 'draws')}><Trophy size={16} /> Draw generator</button>}
        {canOpen('schedule') && <button className="ap-secondary" onClick={() => onOpenTournament(undefined, 'schedule')}>Open court schedule</button>}
        {canOpen('results') && <button className="ap-secondary" onClick={() => onOpenTournament(undefined, 'results')}>Open results</button>}
        {onNativeOperations && <button className="ap-secondary" onClick={onNativeOperations}>Manage native draw</button>}
        {onRehearsal && <button className="ap-secondary" onClick={onRehearsal}>Private rehearsal</button>}
        {event.rankedin_url && <a className="ap-secondary" href={event.rankedin_url} target="_blank" rel="noreferrer">Open RankedIn <ExternalLink size={15} /></a>}
      </div>
    </div>
    <div className="ap-draw-layout">
      <section className="ap-section">
        <div className="ap-section-heading"><h2>Competition draws</h2><span className="ap-section-count">{draws.length} records</span></div>
        <div className="ap-draw-list">{divisions.map(division => {
          const draw = findDraw(division);
          const name = division.name || division.division_name;
          const canGenerate = !draw && division.is_active !== false && canOpen('draws');
          const open = () => {
            if (onGroupDraw && ['group_only', 'group_knockout'].includes(draw?.format)) onGroupDraw(division, draw);
            else if (canGenerate || (draw && canOpen('draws'))) onOpenTournament(division, 'draws');
            else onDrawDetails(division, draw);
          };
          return <button key={division.id} onClick={open}>
            <span className="ap-row-icon"><Trophy size={16} /></span>
            <span><b>{name}</b><small>{canGenerate ? 'Generate draw' : draw?.format || division.format || 'Tournament draw'} · {registrationCount(division)} entries</small></span>
            <span className={'ap-status ap-status--' + (draw?.status === 'completed' ? 'positive' : draw ? 'warning' : 'neutral')}>{draw?.status || 'Not generated'}</span>
            <ChevronRight size={16} />
          </button>;
        })}</div>
        {divisions.length === 0 && <p className="ap-empty-inline">Add a division in Tournament Manager before generating a draw.</p>}
      </section>
      <aside className="ap-section ap-draw-source">
        <div className="ap-section-heading"><h2>Draw source</h2></div>
        <dl className="ap-details-list"><div><dt>Provider</dt><dd>{event.rankedin_id ? 'RankedIn' : '4M native draws'}</dd></div>
          <div><dt>Tournament ID</dt><dd>{event.rankedin_id || 'Not linked'}</dd></div><div><dt>Last sync</dt><dd>Available on request</dd></div></dl>
        {onRankedinSync && <button className="ap-primary" onClick={onRankedinSync}><RefreshCw size={16} /> Sync to RankedIn</button>}
      </aside>
    </div>
  </>;
}
