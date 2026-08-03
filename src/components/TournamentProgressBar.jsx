import React, { useMemo, useState, useEffect } from 'react';
import {
    Zap, Users, UserX, LayoutList, CircleDot, Trophy, BarChart3, Info,
} from 'lucide-react';
import { isEarlyBirdActive, parseEventDate } from '../utils/eventEntryFee';

const startOfLocalDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

const endOfLocalDay = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
};

const formatStepDate = (date, { withTime = false, rangeEnd = null } = {}) => {
    if (!date) return null;
    const opts = withTime
        ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
        : { day: 'numeric', month: 'short' };
    const start = date.toLocaleDateString('en-GB', opts).toUpperCase().replace(',', '');
    if (!rangeEnd) return start;
    const sameDay = date.toDateString() === rangeEnd.toDateString();
    if (sameDay) return start;
    const end = rangeEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
    return `${start} – ${end}`;
};

/**
 * Build visible tournament progress steps from event dates.
 * Steps without a date are omitted.
 */
/**
 * @param {object} event
 * @param {Date} [now]
 * @param {{ drawPublished?: boolean }} [options] When Rankedin already has published draws,
 * mark the Draw Published step complete even if draw_released is still in the future.
 */
export function buildTournamentProgressSteps(event, now = new Date(), options = {}) {
    if (!event) return [];

    const { drawPublished = false } = options;
    const opens = parseEventDate(event.registration_opens_at);
    const earlyBird = parseEventDate(event.early_bird_ends_at);
    const closes = parseEventDate(event.registration_closes_at);
    const draw = parseEventDate(event.draw_released);
    const start = parseEventDate(event.start_date);
    const end = parseEventDate(event.end_date || event.start_date);
    const rankings = parseEventDate(event.rankings_updated_at);

    const steps = [];

    if (opens) {
        steps.push({
            id: 'registration_open',
            label: 'Registration Open',
            icon: Users,
            at: opens,
            liveUntil: closes || null,
            dateLabel: null,
        });
    }

    const earlyBirdFee = event.early_bird_fee;
    const hasEarlyBirdFee = earlyBirdFee !== null && earlyBirdFee !== undefined && earlyBirdFee !== '';
    if (earlyBird && hasEarlyBirdFee) {
        // Live from registration open (or immediately if no open date) until early bird ends.
        const earlyBirdStart = opens && opens.getTime() < earlyBird.getTime()
            ? opens
            : new Date(0);
        steps.push({
            id: 'early_bird',
            label: 'Early Bird Entries',
            icon: Zap,
            at: earlyBirdStart,
            liveUntil: earlyBird,
            dateLabel: formatStepDate(earlyBird, { withTime: true }),
        });
    }

    if (closes) {
        steps.push({
            id: 'registration_closed',
            label: 'Registration Closed',
            icon: UserX,
            at: closes,
            dateLabel: formatStepDate(closes, { withTime: true }),
        });
    }

    if (draw) {
        steps.push({
            id: 'draw_published',
            label: 'Draw Published',
            icon: LayoutList,
            at: draw,
            dateLabel: formatStepDate(draw, { withTime: draw.getHours() !== 0 || draw.getMinutes() !== 0 }),
        });
    }

    if (start) {
        const endDay = end || start;
        steps.push({
            id: 'tournament_live',
            label: 'Tournament Live',
            icon: CircleDot,
            at: startOfLocalDay(start),
            liveUntil: endOfLocalDay(endDay),
            dateLabel: formatStepDate(start, { rangeEnd: endDay }),
        });
    }

    if (end) {
        steps.push({
            id: 'tournament_finished',
            label: 'Tournament Finished',
            icon: Trophy,
            at: endOfLocalDay(end),
            dateLabel: formatStepDate(end),
        });
    }

    if (rankings) {
        steps.push({
            id: 'rankings_updated',
            label: 'Rankings Updated',
            icon: BarChart3,
            at: rankings,
            dateLabel: formatStepDate(rankings),
        });
    }

    if (steps.length === 0) return [];

    let activeIndex = -1;
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (step.liveUntil) {
            if (now.getTime() >= step.at.getTime() && now.getTime() <= step.liveUntil.getTime()) {
                activeIndex = i;
            }
        } else if (now.getTime() >= step.at.getTime()) {
            activeIndex = i;
        }
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.liveUntil) continue;
        if (now.getTime() >= step.at.getTime() && now.getTime() <= step.liveUntil.getTime()) {
            activeIndex = i;
            break;
        }
    }

    // Prefer early bird as the illuminated active step while pricing is in effect
    // (otherwise Registration Open keeps the spotlight for the whole window).
    const earlyBirdIndex = steps.findIndex((s) => s.id === 'early_bird');
    if (earlyBirdIndex >= 0 && isEarlyBirdActive(event, now)) {
        const earlyStep = steps[earlyBirdIndex];
        if (now.getTime() >= earlyStep.at.getTime()) {
            activeIndex = earlyBirdIndex;
        }
    }

    return steps.map((step, index) => {
        let status = 'upcoming';
        if (activeIndex === index) status = 'live';
        else if (activeIndex > index) status = 'done';
        // Timed windows (early bird, registration open, tournament live): once past liveUntil, stay highlighted as done
        // even when a later-overlapping step (e.g. Registration Open) is still LIVE.
        else if (step.liveUntil && now.getTime() > step.liveUntil.getTime()) status = 'done';
        else if (now.getTime() >= step.at.getTime() && !step.liveUntil) status = 'done';

        // Rankedin may publish earlier than the scheduled draw_released datetime
        if (step.id === 'draw_published' && drawPublished && status === 'upcoming') {
            status = 'done';
        }

        const showLive = status === 'live' && (
            step.id === 'registration_open'
            || step.id === 'tournament_live'
            || step.id === 'early_bird'
        );

        let label = step.label;
        let sublabel = showLive ? 'LIVE' : step.dateLabel;
        if (step.id === 'early_bird') {
            if (status === 'live') {
                label = 'Early Bird Entries';
                sublabel = 'LIVE';
            } else if (status === 'done') {
                label = 'Early Bird Entries';
                sublabel = 'Ended';
            } else {
                label = 'Early Bird Entries';
            }
        }

        return {
            ...step,
            label,
            status,
            sublabel,
            showLiveDot: showLive,
        };
    });
}

/**
 * Full-width tournament timeline for EventDetails.
 * Steps share the row evenly; on very narrow screens with many steps, the track scrolls.
 */
export default function TournamentProgressBar({
    event,
    accentColor = '#CCFF00',
    drawPublished = false,
}) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    const steps = useMemo(
        () => buildTournamentProgressSteps(event, new Date(now), { drawPublished }),
        [event, now, drawPublished],
    );

    if (!steps.length) return null;

    return (
        <div className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-sm px-3 py-4 sm:px-5 sm:py-5">
            <div className="flex items-center gap-2 mb-4 sm:mb-5">
                <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
                <h3 className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.18em] text-white">
                    Tournament Progress
                </h3>
            </div>

            <div className="w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div
                    className="grid w-full items-start"
                    style={{
                        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
                    }}
                >
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        const isLive = step.status === 'live';
                        const isDone = step.status === 'done';
                        const isActive = isLive || isDone;
                        const next = steps[index + 1];
                        const connectorActive = isDone || (isLive && next && (next.status === 'live' || next.status === 'done'));
                        const isLast = index === steps.length - 1;

                        return (
                            <div key={step.id} className="relative flex flex-col items-center min-w-0 px-1 sm:px-2">
                                {/* Connector behind the icon row so it spans between columns */}
                                {!isLast && (
                                    <div
                                        className="pointer-events-none absolute top-4 sm:top-5 z-0 flex items-center"
                                        style={{
                                            left: 'calc(50% + 16px)',
                                            right: 'calc(-50% + 16px)',
                                        }}
                                        aria-hidden
                                    >
                                        <div
                                            className="flex-1 h-px"
                                            style={{
                                                backgroundColor: connectorActive ? accentColor : 'rgba(255,255,255,0.15)',
                                            }}
                                        />
                                        <div
                                            className="w-0 h-0 border-y-[3px] border-y-transparent border-l-[4px] sm:border-l-[5px] shrink-0"
                                            style={{
                                                borderLeftColor: connectorActive ? accentColor : 'rgba(255,255,255,0.15)',
                                            }}
                                        />
                                    </div>
                                )}

                                <div
                                    className="relative z-10 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border transition-colors shrink-0"
                                    style={
                                        isActive
                                            ? {
                                                backgroundColor: `${accentColor}22`,
                                                borderColor: accentColor,
                                                color: accentColor,
                                            }
                                            : {
                                                backgroundColor: 'rgba(10,10,10,0.9)',
                                                borderColor: 'rgba(255,255,255,0.12)',
                                                color: 'rgba(255,255,255,0.35)',
                                            }
                                    }
                                >
                                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                </div>

                                <p
                                    className="mt-2 text-[9px] sm:text-[10px] md:text-[11px] font-bold text-center leading-snug w-full"
                                    style={{ color: isLive ? accentColor : isDone ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}
                                >
                                    {step.label}
                                </p>

                                {step.sublabel && (
                                    <p
                                        className="mt-1 text-[8px] sm:text-[9px] md:text-[10px] font-semibold uppercase tracking-wide text-center flex items-center justify-center gap-1 leading-tight w-full"
                                        style={{ color: step.showLiveDot ? accentColor : 'rgba(255,255,255,0.4)' }}
                                    >
                                        {step.showLiveDot && (
                                            <span
                                                className="inline-block w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
                                                style={{ backgroundColor: accentColor }}
                                            />
                                        )}
                                        <span>{step.sublabel}</span>
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <p className="mt-3 sm:mt-4 flex items-center gap-1.5 text-[9px] sm:text-[10px] text-white/35">
                <Info className="w-3 h-3 shrink-0" />
                Dates and times are subject to change
            </p>
        </div>
    );
}
