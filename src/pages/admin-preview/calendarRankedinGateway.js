import { extractRankedinId } from '../../utils/rankedinLink.js';
import { publicRankedinClasses, publicRankedinMatches } from '../../utils/rankedinDrawPublication.js';
import { areRankedinResultsPublished, rankedinWinnersFromStandings } from '../../utils/rankedinTournamentResults.js';

const API_ROOT = 'https://api.rankedin.com/v1';

function list(value, subject) {
  if (!Array.isArray(value)) throw new Error('RankedIn did not return ' + subject + '.');
  return value;
}

export function createCalendarRankedinGateway(fetcher = (...args) => fetch(...args)) {
  async function request(path, params, signal) {
    const response = await fetcher(API_ROOT + path + '?' + new URLSearchParams(params), { signal, cache: 'no-store' });
    if (!response.ok) throw new Error('RankedIn returned HTTP ' + response.status + '.');
    return response;
  }

  async function json(path, params, signal) {
    return (await request(path, params, signal)).json();
  }

  const validatedId = value => {
    const id = extractRankedinId(value);
    if (!id || !/^[1-9]\d*$/.test(id)) throw new Error('Invalid RankedIn event ID.');
    return id;
  };

  return {
    async events(organisationId, signal) {
      const id = validatedId(organisationId);
      const batches = await Promise.all(['true', 'false'].map(async isFinished => {
        const data = await json('/Organization/GetOrganisationEventsAsync', {
          organisationId: id, IsFinished: isFinished, Language: 'en', skip: '0', take: '100',
        }, signal);
        return list(data?.payload, 'an event list');
      }));
      return batches.flat();
    },
    async details(id, isLeague, signal) {
      const family = isLeague ? '/ClubLeague/' : '/tournament/';
      const [info, regulations] = await Promise.all([
        json(family + (isLeague ? 'GetClubleagueInfoAsync' : 'GetInfoAsync'), { id, language: 'en' }, signal),
        request(family + 'GetRegulationsAsync', { id }, signal).then(response => response.text()).catch(error => {
          if (signal?.aborted) throw error;
          return '';
        }),
      ]);
      const sidebar = info?.TournamentSidebarModel || info?.ClubleagueSidebarModel || info || {};
      const logosModel = info?.EventLogosModel || info?.ClubleagueLogosModel || info?.Logos || info || {};
      const logos = logosModel.LogoUrls || logosModel.logoUrls;
      let description = regulations;
      if (description.startsWith('"')) {
        try { description = JSON.parse(description); } catch { description = ''; }
      }
      const registered = sidebar.TotalUniquePersonsInTournament ?? sidebar.PlayersCount;
      return {
        ...(typeof description === 'string' && description.trim() ? { description } : {}),
        ...(sidebar.LocationName || sidebar.locationName ? { venue: sidebar.LocationName || sidebar.locationName } : {}),
        ...(sidebar.Address || sidebar.address ? { address: sidebar.Address || sidebar.address } : {}),
        ...(Number.isInteger(registered) && registered >= 0 ? { registered_players: registered } : {}),
        ...(logosModel.PosterUrl || logosModel.posterUrl || logos?.[0] ? { image_url: logosModel.PosterUrl || logosModel.posterUrl || logos[0] } : {}),
        ...(Array.isArray(logos) && logos.length ? { sponsor_logos: logos } : {}),
      };
    },
    async draws(id, signal) {
      const classes = await json('/tournament/GetClassesAndDrawNamesAsync/', { tournamentId: validatedId(id) }, signal);
      return publicRankedinClasses(id, list(classes, 'the tournament classes'));
    },
    async participantClasses(id, signal) {
      return list(await json('/tournament/GetPlayersTabAsync', { id: validatedId(id), language: 'en' }, signal), 'participant divisions');
    },
    async classParticipants(id, classId, signal) {
      const payload = await json('/tournament/GetPlayersForClassAsync', {
        tournamentId: validatedId(id), tournamentClassId: validatedId(classId), language: 'en',
      }, signal);
      if (Array.isArray(payload?.Teams) && payload.Teams.length) return payload.Teams;
      if (Array.isArray(payload?.Participants)) return payload.Participants.map(row => row?.Participant || row);
      return list(payload?.Teams, 'participants for division ' + classId);
    },
    async upcoming(id, classes, signal) {
      const payload = await json('/tournament/GetMatchesSectionAsync', {
        Id: validatedId(id), LanguageCode: 'en', IsReadonly: 'true', isFinished: 'false',
      }, signal);
      if (!Array.isArray(payload?.Matches)) throw new Error('RankedIn did not return the upcoming matches.');
      return publicRankedinMatches(id, payload, classes);
    },
    async winners(id, signal) {
      const standings = await json('/tournament/GetStandingsAsync', { id: validatedId(id) }, signal);
      if (typeof standings?.IsFinished !== 'boolean') throw new Error('RankedIn did not return the tournament publication state.');
      if (!areRankedinResultsPublished(standings)) return [];
      const rankingId = standings.Rankings?.[0]?.Id || 0;
      const divisions = list(standings.Classes, 'the standings divisions').slice(0, 24);
      const winners = await Promise.all(divisions.map(async division => {
        const results = await json('/tournament/GetResultsAsync', {
          tournamentId: id, classId: division.Id, rankingId, language: 'en',
        }, signal);
        list(results?.Data, 'published standings for ' + division.Name);
        return rankedinWinnersFromStandings(standings, division, results);
      }));
      return winners.filter(Boolean);
    },
  };
}
