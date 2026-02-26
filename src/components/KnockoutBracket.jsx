import React from 'react';
import { motion } from 'framer-motion';

const KnockoutBracket = ({ matches }) => {
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
        return <div className="text-gray-400 p-10 text-center">No bracket data available.</div>;
    }

    const cleanPlayerName = (name) => {
        if (!name) return name;
        return name.replace(/\s+[\d\(].*$/, '').trim();
    };

    const getTeamPlayers = (participant) => {
        if (!participant) return [{ name: "TBD", country: null, rating: null }];
        const p1 = participant.FirstPlayer;
        const p2 = participant.SecondPlayer;

        const players = [];
        if (p1) players.push({ name: cleanPlayerName(p1.Name), country: p1.CountryShort, rating: p1.RatingBegin });
        if (p2) players.push({ name: cleanPlayerName(p2.Name), country: p2.CountryShort, rating: p2.RatingBegin });

        if (players.length > 0) return players;
        return [{ name: cleanPlayerName(participant.Name) || "TBD", country: null, rating: null }];
    };

    const getFlagEmoji = (countryCode) => {
        if (!countryCode) return null;
        // z=122 -> Z=90 -> 90+127397 = 127487 (🇿)
        return countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));
    };

    const getScoreString = (scoreObj, isFirst) => {
        if (!scoreObj) return '-';
        if (scoreObj.DetailedScoring && scoreObj.DetailedScoring.length > 0) {
            return scoreObj.DetailedScoring.map(s => isFirst ? s.FirstParticipantScore : s.SecondParticipantScore).join(' ');
        }
        return isFirst ? scoreObj.FirstParticipantScore : scoreObj.SecondParticipantScore;
    };

    let eliminationCount = 0;

    return (
        <div className="flex flex-col gap-16">
            {matches.map((bracket, bracketIndex) => {
                if (bracket.BaseType === 'RoundRobin') {
                    const pool = bracket.RoundRobin;
                    if (!pool) return null;
                    return (
                        <div key={`rr-${bracketIndex}`} className="bg-[#131C2F] rounded-2xl border border-white/5 overflow-hidden shadow-xl">
                            <div className="bg-padel-green/10 border-b border-padel-green/20 p-4">
                                <h3 className="text-white font-bold font-display tracking-wide">{pool.Name || 'Group Stage'}</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-black/20 text-xs uppercase tracking-wider text-gray-400 border-b border-white/5">
                                            <th className="p-4 font-bold">Pos</th>
                                            <th className="p-4 font-bold">Team</th>
                                            <th className="p-4 font-bold text-center">P</th>
                                            <th className="p-4 font-bold text-center">W</th>
                                            <th className="p-4 font-bold text-center">L</th>
                                            <th className="p-4 font-bold text-center">Pts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pool.Standings?.sort((a, b) => a.Standing - b.Standing).map((row, rowIdx) => (
                                            <tr key={rowIdx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                <td className="p-4">
                                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${row.Standing === 1 ? 'bg-padel-green text-black' : 'bg-white/10 text-white'}`}>
                                                        {row.Standing}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <div className="font-bold text-white text-sm">{cleanPlayerName(row.DoublesPlayer1Model?.Name) || 'Player 1'}</div>
                                                    <div className="text-gray-400 text-xs">{cleanPlayerName(row.DoublesPlayer2Model?.Name) || 'Player 2'}</div>
                                                </td>
                                                <td className="p-4 text-center text-gray-300 font-medium">{row.Played}</td>
                                                <td className="p-4 text-center text-padel-green font-bold">{row.Wins}</td>
                                                <td className="p-4 text-center text-red-400 font-medium">{row.Losses}</td>
                                                <td className="p-4 text-center text-white font-display text-lg">{row.MatchPoints}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    );
                }

                if (bracket.BaseType === 'Elimination') {
                    eliminationCount++;
                    if (eliminationCount > 1) return null;

                    const drawData = bracket.Elimination?.DrawData || [];
                    if (drawData.length === 0) return null;

                    // 1. Group matches by Round and dedup by MatchId
                    const roundsMap = {};
                    drawData.forEach(row => {
                        row.forEach(cell => {
                            if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;

                            // Sometimes matches are in MatchCell, sometimes flattened
                            const m = cell.MatchCell || cell;
                            const round = m.Round;
                            if (typeof round === 'undefined') return;

                            if (!roundsMap[round]) roundsMap[round] = [];

                            const matchId = m.MatchId;
                            if (!roundsMap[round].some(existing => (existing.MatchCell || existing).MatchId === matchId)) {
                                roundsMap[round].push(cell);
                            }
                        });
                    });

                    // 2. Sort rounds numerically, then sort matches inside by MatchOrder
                    const sortedRounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b).map(roundKey => {
                        return roundsMap[roundKey].sort((a, b) => {
                            const ordA = (a.MatchCell || a).MatchOrder || 0;
                            const ordB = (b.MatchCell || b).MatchOrder || 0;
                            return ordA - ordB;
                        });
                    });

                    return (
                        <div key={`elim-${bracketIndex}`} className="w-full">
                            <div className="flex gap-8 overflow-x-auto pb-10 pt-4 custom-scrollbar" style={{ minWidth: "100%" }}>
                                {sortedRounds.map((roundMatches, roundIndex) => (
                                    <div key={roundIndex} className="flex flex-col justify-around min-w-[260px] relative gap-4">
                                        <h3 className="text-center font-bold text-padel-green mb-6 tracking-widest uppercase text-xs min-h-[16px]">
                                            {roundIndex === sortedRounds.length - 1 && sortedRounds.length > 1 ? 'Final' :
                                                roundIndex === sortedRounds.length - 2 && sortedRounds.length > 2 ? 'Semi Finals' :
                                                    ''}
                                        </h3>

                                        <div className="flex flex-col justify-around h-full gap-6">
                                            {roundMatches.map((cell, cellIndex) => {
                                                const m = cell.MatchCell || cell;
                                                const scoreObj = m.MatchResults?.Score || m.MatchViewModel?.Score || m.Score;
                                                const hasScore = m.MatchResults?.HasScore || m.MatchViewModel?.HasScore || m.HasScore || (scoreObj && scoreObj.FirstParticipantScore !== null);

                                                const isFirstWinner = scoreObj?.IsFirstParticipantWinner || m.MatchViewModel?.IsFirstParticipantWinner || false;
                                                const isSecondWinner = scoreObj ? !scoreObj.IsFirstParticipantWinner : (!m.MatchViewModel?.IsFirstParticipantWinner && hasScore);

                                                const team1Players = getTeamPlayers(cell.ChallengerParticipant || m.ChallengerParticipant);
                                                const team2Players = getTeamPlayers(cell.ChallengedParticipant || m.ChallengedParticipant);

                                                return (
                                                    <motion.div
                                                        key={m.MatchId || cellIndex}
                                                        initial={{ opacity: 0, scale: 0.95 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ delay: (roundIndex * 0.1) + (cellIndex * 0.05) }}
                                                        className="relative bg-[#131C2F] rounded-xl border border-white/5 p-4 shadow-xl hover:border-padel-green/50 transition-colors z-10 w-full"
                                                    >
                                                        {/* Participant 1 */}
                                                        <div className={`flex justify-between items-center pb-3 border-b border-white/5 mb-3 ${hasScore && isFirstWinner ? 'text-white font-bold' : 'text-gray-400'}`}>
                                                            <div className="flex items-center gap-3">
                                                                {roundIndex === 0 ? (
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-display text-xs shrink-0 ${hasScore && isFirstWinner ? 'bg-padel-green text-black' : 'bg-[#1e293b] text-white'}`}>
                                                                        {(cellIndex * 2) + 1}
                                                                    </div>
                                                                ) : (
                                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${hasScore && isFirstWinner ? 'bg-padel-green' : 'bg-gray-600'}`} />
                                                                )}
                                                                <div className="flex flex-col gap-1">
                                                                    {team1Players.map((player, idx) => (
                                                                        <div key={idx} className="flex items-center gap-1.5 leading-none">
                                                                            {player.country && <span className="text-xs">{getFlagEmoji(player.country)}</span>}
                                                                            <span className="truncate max-w-[140px] text-sm font-medium">{player.name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Participant 2 */}
                                                        <div className={`flex justify-between items-center ${hasScore && isSecondWinner ? 'text-white font-bold' : 'text-gray-400'}`}>
                                                            <div className="flex items-center gap-3">
                                                                {roundIndex === 0 ? (
                                                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-display text-xs shrink-0 ${hasScore && isSecondWinner ? 'bg-padel-green text-black' : 'bg-[#1e293b] text-white'}`}>
                                                                        {(cellIndex * 2) + 2}
                                                                    </div>
                                                                ) : (
                                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${hasScore && isSecondWinner ? 'bg-padel-green' : 'bg-gray-600'}`} />
                                                                )}
                                                                <div className="flex flex-col gap-1">
                                                                    {team2Players.map((player, idx) => (
                                                                        <div key={idx} className="flex items-center gap-1.5 leading-none">
                                                                            {player.country && <span className="text-xs">{getFlagEmoji(player.country)}</span>}
                                                                            <span className="truncate max-w-[140px] text-sm font-medium">{player.name}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Connecting Line Logic - Simplified since dynamic lines in transposed matrix are extremely complex */}
                                                        {true && ( // Always show line to the right when we have a Winner column
                                                            <div className="absolute top-1/2 -right-8 w-8 border-b-2 border-white/5" />
                                                        )}
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                {/* Winner Column */}
                                {sortedRounds.length > 0 && (() => {
                                    const finalRound = sortedRounds[sortedRounds.length - 1];
                                    const finalMatch = finalRound.length > 0 ? finalRound[0] : null;
                                    let finalWinnerPlayers = null;

                                    if (finalMatch) {
                                        const fm = finalMatch.MatchCell || finalMatch;
                                        const scoreObj = fm.MatchResults?.Score || fm.MatchViewModel?.Score || fm.Score;
                                        const hasScore = fm.MatchResults?.HasScore || fm.MatchViewModel?.HasScore || fm.HasScore || (scoreObj && scoreObj.FirstParticipantScore !== null);
                                        if (hasScore) {
                                            const isFirstWinner = scoreObj?.IsFirstParticipantWinner || fm.MatchViewModel?.IsFirstParticipantWinner || false;
                                            const isSecondWinner = scoreObj ? !scoreObj.IsFirstParticipantWinner : (!fm.MatchViewModel?.IsFirstParticipantWinner && hasScore);
                                            if (isFirstWinner) finalWinnerPlayers = getTeamPlayers(finalMatch.ChallengerParticipant || fm.ChallengerParticipant);
                                            else if (isSecondWinner) finalWinnerPlayers = getTeamPlayers(finalMatch.ChallengedParticipant || fm.ChallengedParticipant);
                                        }
                                    }

                                    return (
                                        <div className="flex flex-col justify-around min-w-[260px] relative gap-4">
                                            <h3 className="text-center font-bold text-[#FFD700] mb-6 tracking-widest uppercase text-xs font-display">
                                                Winner
                                            </h3>
                                            <div className="flex flex-col justify-around h-full gap-6">
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    transition={{ delay: sortedRounds.length * 0.1 }}
                                                    className={`relative bg-[#131C2F] rounded-xl border p-4 shadow-xl z-10 w-full flex flex-col justify-center gap-3 ${finalWinnerPlayers ? 'border-[#FFD700] shadow-[#FFD700]/10' : 'border-white/5 text-gray-500'
                                                        }`}
                                                >
                                                    {/* Left Connecting Line that meets the last match's right line */}
                                                    <div className="absolute top-1/2 -left-8 w-8 border-b-2 border-white/5" />

                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-[#FFD700]/10 text-[#FFD700] flex items-center justify-center shrink-0">
                                                            <span className="text-xl">🏆</span>
                                                        </div>
                                                        <div className="flex flex-col gap-1 w-full">
                                                            {finalWinnerPlayers ? (
                                                                finalWinnerPlayers.map((player, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2 leading-none text-white">
                                                                        {player.country && <span className="text-sm">{getFlagEmoji(player.country)}</span>}
                                                                        <span className="truncate max-w-[140px] text-lg font-bold font-display">{player.name}</span>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <span className="font-medium italic text-gray-400">TBD</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                }
                return null;
            })}
        </div>
    );
};

export default KnockoutBracket;
