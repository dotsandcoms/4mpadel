import { useEffect, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { addEventPlayDay } from '../../utils/nativeDrawScheduler.js';
import { loadNativeCalendarPlan, loadNativeDivisionPlan } from './nativeDrawOperations.js';
import { prepareNativeDivisionSchedule, prepareNativePlayDays } from './nativeDrawPlayPlan.js';

const hourFields = [
  ['start_time', 'Opening time', 'time'], ['end_time', 'Closing time', 'time'],
  ['courts_count', 'Courts', 'number', 1], ['match_duration_minutes', 'Match minutes', 'number', 1],
  ['minimum_break_minutes', 'Rest minutes', 'number', 0],
];

export default function NativeDrawPlayPlan({ client, session, scopeId, event, activeDivisionId, previous, onReview }) {
  const [mode, setMode] = useState(previous?.type === 'division-plan' ? 'division' : previous ? 'days' : null);
  const [loaded, setLoaded] = useState(null);
  const [days, setDays] = useState([]);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [divisionId, setDivisionId] = useState(previous?.divisionId || '');
  const [division, setDivision] = useState(null);
  const [priority, setPriority] = useState('');
  const [dayPlans, setDayPlans] = useState({});
  const userId = session?.user?.id;

  useEffect(() => {
    if (!mode || loaded) return;
    const controller = new AbortController();
    loadNativeCalendarPlan({ client, event, expectedUserId: userId, scopeId, signal: controller.signal, isCurrent: () => !controller.signal.aborted })
      .then(result => {
        if (controller.signal.aborted) return;
        setLoaded(previous?.type === 'play-days' ? { ...result, expected: { ...result.expected, ...previous.versions } } : result);
        setDays(previous?.type === 'play-days' ? previous.days : result.days);
        setDivisionId(current => current || (result.divisions.some(item => item.id === activeDivisionId)
          ? activeDivisionId : result.divisions[0]?.id || ''));
      })
      .catch(issue => { if (!controller.signal.aborted) setError(issue.message); });
    return () => controller.abort();
  }, [mode, loaded, client, event, userId, scopeId, activeDivisionId, previous]);

  useEffect(() => {
    if (mode !== 'division' || !divisionId) return;
    const controller = new AbortController();
    setDivision(null);
    loadNativeDivisionPlan({ client, event, divisionId, expectedUserId: userId, scopeId, signal: controller.signal, isCurrent: () => !controller.signal.aborted })
      .then(result => {
        if (controller.signal.aborted) return;
        setDivision(result);
        setPriority(previous?.divisionId === divisionId ? previous.priority : result.workflow.schedule_priority ?? '');
        setDayPlans(previous?.divisionId === divisionId ? previous.dayPlans : result.workflow.schedule_days || {});
      })
      .catch(issue => { if (!controller.signal.aborted) setError(issue.message); });
    return () => controller.abort();
  }, [mode, divisionId, client, event, userId, scopeId, previous]);

  const show = next => { setError(''); setMode(next); };
  const setDay = (selectedDate, field, value) => setDays(old =>
    old.map(day => day.play_date === selectedDate ? { ...day, [field]: value } : day));
  const setDivisionDay = (selectedDate, field, value) =>
    setDayPlans(old => ({ ...old, [selectedDate]: { ...old[selectedDate], [field]: value } }));

  const addDay = () => {
    try {
      setDays(addEventPlayDay(days, date, event));
      setDate('');
      setError('');
    } catch (issue) { setError(issue.message); }
  };
  const removeDay = day => {
    if (!loaded.days.some(initial => initial.play_date === day.play_date) && !(day.play_date in loaded.expected)) {
      setDays(old => old.filter(item => item.play_date !== day.play_date));
      return;
    }
    onReview({ type: 'remove-day', day: day.play_date, expected: loaded.expected[day.play_date] ?? null,
      heading: 'Remove play day', summary: day.play_date + ' will be removed from the event schedule.' });
  };
  const review = () => {
    try {
      const operation = mode === 'days'
        ? { type: 'play-days', ...prepareNativePlayDays(days, loaded.expected), heading: 'Review play days', summary: 'Confirm the event’s dates, opening hours and courts.' }
        : { type: 'division-plan', divisionId, priority, dayPlans, expected: previous?.divisionId === divisionId ? previous.expected : division.expected,
          plan: prepareNativeDivisionSchedule(division.division, loaded.days, priority, dayPlans, division.workflow),
          heading: 'Review division schedule', summary: division.division.name };
      setError('');
      onReview(operation);
    } catch (issue) { setError(issue.message); }
  };
  const plannedDays = loaded?.days.filter(day => day.is_active && (!division?.workflow.play_dates || division.workflow.play_dates.includes(day.play_date))) || [];

  return <section className="ap-native-court-setup" aria-label="Play days and division plans">
    <div className="ap-modal-actions">
      <button type="button" className="ap-secondary" aria-pressed={mode === 'days'} onClick={() => show('days')}>Play days &amp; courts</button>
      <button type="button" className="ap-secondary" aria-pressed={mode === 'division'} onClick={() => show('division')}>Division schedule</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {mode && !loaded && !error && <p role="status">Loading event planning records…</p>}
    {mode === 'days' && loaded && <>
      <label>Additional play date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" className="ap-secondary" disabled={!date} onClick={addDay}>Add play day</button>
      {days.map(day => <fieldset className="ap-native-court-setup" key={day.play_date}><legend>{day.play_date}</legend>
        <label className="ap-draw-pinned"><input type="checkbox" checked={day.is_active} onChange={event => setDay(day.play_date, 'is_active', event.target.checked)} />Use this play day</label>
        {hourFields.map(([field, label, type, min]) => <label key={field}>{label}
          <input type={type} min={min} value={type === 'time' ? String(day[field] || '').slice(0, 5) : day[field]} onChange={event => setDay(day.play_date, field, event.target.value)} />
        </label>)}
        <button type="button" className="ap-text-button" onClick={() => removeDay(day)}>Remove {day.play_date}</button>
      </fieldset>)}
      <button type="button" className="ap-secondary" disabled={!days.length} onClick={review}>Review playing hours</button>
    </>}
    {mode === 'division' && loaded && <>
      {loaded.divisions.length ? <label>Division to schedule<SearchableDropdown value={divisionId} onChange={event => { setDivisionId(event.target.value); setError(''); }}>
        {loaded.divisions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </SearchableDropdown></label> : <p>Add an active division before setting a division schedule.</p>}
      {divisionId && !division && !error && <p role="status">Loading division plan…</p>}
      {division && <>
        <label>Scheduling priority<input type="number" min="0" value={priority} onChange={event => setPriority(event.target.value)} /></label>
        <p>Lower positions are booked first. Empty rounds allow as many as fit.</p>
        {plannedDays.map(day => <fieldset className="ap-native-court-setup" key={day.play_date}><legend>{day.play_date}</legend>
          <label>Earliest start<input type="time" value={dayPlans[day.play_date]?.start_time || ''} onChange={event => setDivisionDay(day.play_date, 'start_time', event.target.value)} /></label>
          <label>Rounds<input type="number" min="0" max="99" value={dayPlans[day.play_date]?.rounds ?? ''} onChange={event => setDivisionDay(day.play_date, 'rounds', event.target.value)} /></label>
        </fieldset>)}
        <button type="button" className="ap-secondary" onClick={review}>Review division plan</button>
      </>}
    </>}
  </section>;
}

export function NativeDrawPlayPlanReview({ action }) {
  if (action.type === 'remove-day') return <p>Existing matches on this day must be moved before it can be removed.</p>;
  if (action.type === 'play-days') return <ul className="ap-native-court-review">{action.days.map(day => <li key={day.play_date}>
    <b>{day.play_date}</b> · {day.is_active ? day.start_time + '–' + day.end_time + ' SAST · ' + day.courts_count + ' courts · ' + day.match_duration_minutes + ' min matches' : 'Inactive'}
  </li>)}</ul>;
  return <ul className="ap-native-court-review">
    {action.priority !== '' && <li>Scheduling priority {action.priority}</li>}
    {Object.entries(action.plan.schedule_days).map(([day, plan]) => <li key={day}><b>{day}</b> · {plan.start_time || 'Event opening'} · {plan.rounds === '' || plan.rounds == null ? 'Rounds as available' : plan.rounds + ' rounds'}</li>)}
  </ul>;
}
