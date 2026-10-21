import React from 'react';
import { orderedScheduleDivisions } from '../../utils/divisionSchedulePlan';
import { scheduleDateLabel } from '../../utils/drawScheduleBoard';

export default function DivisionSchedulePlanner({ divisions, configs, days, matches, included, onInclude, onDayChange, onReorder, onSave, dirty, busy, error }) {
    const ordered = orderedScheduleDivisions(divisions, configs);
    const inputClass = 'w-full min-w-24 rounded-lg border border-white/20 bg-[#101010] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 [color-scheme:dark]';
    return <section aria-labelledby="division-schedule-title" className="rounded-xl border border-sky-300/25 bg-black/20">
        <div className="space-y-2 border-b border-white/10 p-4">
            <h3 id="division-schedule-title" className="font-bold text-white">Player rounds per day</h3>
            <p id="division-schedule-help" className="text-sm text-gray-300">Set each division’s priority, daily round limit and earliest start. Leave rounds empty for Max; enter 0 to skip a day. BYEs do not count as played rounds. All times are SAST.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-sky-200">{days.map(day => <p key={day.play_date}><strong>{scheduleDateLabel(day.play_date)}</strong> · {day.start_time.slice(0, 5)}–{day.end_time.slice(0, 5)} · {day.courts_count} courts · {day.match_duration_minutes} min matches · {day.minimum_break_minutes} min rest</p>)}</div>
        </div>
        <fieldset disabled={busy} aria-describedby="division-schedule-help" className="min-w-0">
            <legend className="sr-only">Division scheduling preferences</legend>
            <div className="max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300" tabIndex={0} aria-label="Division schedule table; scroll sideways for all days">
                <table className="w-full text-left text-sm">
                    <thead className="text-xs text-gray-400"><tr>
                        <th scope="col" className="p-3">Order</th><th scope="col" className="min-w-40 p-3">Division</th>
                        {days.map(day => <th key={day.play_date} scope="colgroup" colSpan={2} className="min-w-64 border-l border-white/10 p-3 text-center text-sky-200">{scheduleDateLabel(day.play_date)}</th>)}
                        <th scope="col" className="p-3 text-center">Draw rounds</th><th scope="col" className="p-3 text-center">Teams</th><th scope="col" className="p-3 text-center">Matches</th>
                    </tr></thead>
                    <tbody>{ordered.map((division, index) => {
                        const rows = matches.filter(match => match.draws?.division_id === division.id);
                        const teamCount = new Set(rows.flatMap(match => match.possible_entry_ids)).size;
                        const rounds = ['group', 'knockout'].reduce((total, stage) => total + Math.max(0, ...rows.filter(match => match.stage === stage).map(match => match.round_number || 0)), 0);
                        const matchCount = rows.filter(match => match.can_plan && match.status !== 'cancelled').length;
                        return <tr key={division.id} className="border-t border-white/10">
                            <td className="p-3"><div className="flex items-center gap-2"><span className="text-gray-400">{index + 1}</span><div className="flex flex-col gap-1">{[-1, 1].map(direction => <button key={direction} type="button" disabled={index + direction < 0 || index + direction >= ordered.length} aria-label={`Move ${division.name} ${direction < 0 ? 'earlier' : 'later'}`} onClick={() => { const next = ordered.map(d => d.id); [next[index], next[index + direction]] = [next[index + direction], next[index]]; onReorder(next); }} className="rounded border border-white/20 px-2 py-1 text-sky-200 hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-25">{direction < 0 ? '↑' : '↓'}</button>)}</div></div></td>
                            <th scope="row" className="p-3 font-medium text-white"><label className="flex items-center gap-2"><input type="checkbox" checked={included.includes(division.id)} onChange={event => onInclude(division.id, event.target.checked)} />{division.name}</label>{!rows.length && <span className="mt-1 block text-xs font-normal text-gray-400">Save a draw to schedule matches</span>}</th>
                            {days.map(day => {
                                const plan = configs[division.id]?.schedule_days?.[day.play_date] || {};
                                const allowed = !configs[division.id]?.play_dates || configs[division.id].play_dates.includes(day.play_date);
                                return <React.Fragment key={day.play_date}>
                                    <td className="border-l border-white/10 p-3"><label className="block text-xs text-gray-400">Rounds<input type="number" min="0" max="99" step="1" placeholder="Max" disabled={!allowed} aria-label={`${division.name} rounds on ${day.play_date}`} className={`${inputClass} mt-1 disabled:opacity-40`} value={plan.rounds ?? ''} onChange={event => onDayChange(division.id, day.play_date, { rounds: event.target.value })} /></label></td>
                                    <td className="p-3"><label className="block text-xs text-gray-400">Start<input type="time" disabled={!allowed} min={day.start_time.slice(0, 5)} max={day.end_time.slice(0, 5)} aria-label={`${division.name} start on ${day.play_date}`} className={`${inputClass} mt-1 disabled:opacity-40`} value={plan.start_time || day.start_time.slice(0, 5)} onChange={event => onDayChange(division.id, day.play_date, { start_time: event.target.value })} /></label>{!allowed && <span className="text-xs text-gray-400">Not a playing day</span>}</td>
                                </React.Fragment>;
                            })}
                            <td className="p-3 text-center tabular-nums text-gray-300">{rounds || '—'}</td><td className="p-3 text-center tabular-nums text-gray-300">{teamCount || '—'}</td><td className="p-3 text-center tabular-nums text-gray-300">{rows.length ? matchCount : '—'}</td>
                        </tr>;
                    })}</tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-white/10 p-4">
                <button type="button" onClick={onSave} disabled={!dirty} className="rounded-lg border border-sky-300/50 px-4 py-2 font-bold text-sky-200 disabled:opacity-40">{busy ? 'Saving plan…' : 'Save division plan'}</button>
                <p className="text-xs text-gray-400">{dirty ? 'Unsaved plan. Automatic scheduling uses these choices in preview.' : 'Saved preferences apply when you generate the next schedule.'} Match bookings change when you save the schedule.</p>
            </div>
        </fieldset>
        {error && <p role="alert" className="px-4 pb-4 text-sm text-red-200">{error}</p>}
    </section>;
}
