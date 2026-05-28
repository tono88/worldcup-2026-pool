import type * as admin from 'firebase-admin';
import {
  getScoringSettings,
  recalculateMatchPredictionPoints,
} from './scoreEngine';

const FIFA_API_URL = 'https://api.fifa.com/api/v3/calendar/matches';
const FIFA_COMPETITION_ID = '17';
const FIFA_SEASON_ID = '285023';

type Database = admin.database.Database;
type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

interface Match {
  game: number;
  fifaId: string;
  homeScore: number;
  awayScore: number;
  status?: MatchStatus;
}

export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'unknown';

interface FifaApiMatch {
  IdMatch: string;
  StageName?: Array<{ Description?: string }>;
  GroupName?: Array<{ Description?: string }> | null;
  Date: string;
  Stadium?: {
    Name?: Array<{ Description?: string }>;
    CityName?: Array<{ Description?: string }>;
    IdCountry?: string;
  };
  Home?: {
    Abbreviation?: string | null;
    ShortClubName?: string | null;
    Score?: number | null;
  };
  Away?: {
    Abbreviation?: string | null;
    ShortClubName?: string | null;
    Score?: number | null;
  };
  PlaceHolderA?: string;
  PlaceHolderB?: string;
  MatchStatus?: unknown;
  Status?: unknown;
  MatchTime?: unknown;
  Period?: unknown;
}

interface FifaApiResponse {
  Results: FifaApiMatch[];
}

export interface ScoreUpdateResult {
  changedMatches: string[];
  changedScores: number;
  changedPredictions: number;
}

const readStatusText = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(readStatusText).filter(Boolean).join(' ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [
      record.Description,
      record.Name,
      record.Status,
      record.MatchStatus,
      record.Phase,
    ]
      .map(readStatusText)
      .filter(Boolean)
      .join(' ');
  }

  return '';
};

const normalizeStatus = (fifaMatch: FifaApiMatch): MatchStatus => {
  const statusText = [
    fifaMatch.MatchStatus,
    fifaMatch.Status,
    fifaMatch.MatchTime,
    fifaMatch.Period,
  ]
    .map(readStatusText)
    .join(' ')
    .toLowerCase();

  if (
    /\b(finished|final|full.?time|completed|closed|ft|aet|pen)\b/.test(
      statusText
    )
  ) {
    return 'finished';
  }

  if (
    /\b(live|progress|half|halftime|1h|2h|extra|penalty|started)\b/.test(
      statusText
    )
  ) {
    return 'live';
  }

  if (/\b(scheduled|not started|fixture|ns|tbd)\b/.test(statusText)) {
    return 'scheduled';
  }

  return 'unknown';
};

const buildFifaUrl = (from?: Date, to?: Date): string => {
  const url = new URL(FIFA_API_URL);
  url.searchParams.set('idseason', FIFA_SEASON_ID);
  url.searchParams.set('idcompetition', FIFA_COMPETITION_ID);
  url.searchParams.set('count', '500');

  if (from) {
    url.searchParams.set('from', from.toISOString());
  }
  if (to) {
    url.searchParams.set('to', to.toISOString());
  }

  return url.toString();
};

const fetchFifaMatches = async (
  from?: Date,
  to?: Date
): Promise<FifaApiMatch[]> => {
  const response = await fetch(buildFifaUrl(from, to));

  if (!response.ok) {
    throw new Error(`FIFA API error: ${response.status}`);
  }

  const data = (await response.json()) as FifaApiResponse;
  return data.Results ?? [];
};

const transformFifaData = (results: FifaApiMatch[]): Record<string, unknown> => {
  const matches: Record<string, unknown> = {};

  results.forEach((item, index) => {
    const game = index + 1;
    const round = item.StageName?.[0]?.Description ?? '';
    const group =
      item.GroupName?.[0]?.Description?.replace('Group ', '') ?? null;
    const home = item.Home?.Abbreviation ?? item.PlaceHolderA ?? 'TBD';
    const homeName = item.Home?.ShortClubName ?? item.PlaceHolderA ?? 'TBD';
    const away = item.Away?.Abbreviation ?? item.PlaceHolderB ?? 'TBD';
    const awayName = item.Away?.ShortClubName ?? item.PlaceHolderB ?? 'TBD';

    matches[String(game)] = {
      game,
      fifaId: item.IdMatch,
      round,
      group,
      date: item.Date,
      timestamp: Math.floor(new Date(item.Date).getTime() / 1000),
      location: item.Stadium?.Name?.[0]?.Description ?? '',
      locationCity: item.Stadium?.CityName?.[0]?.Description ?? '',
      locationCountry: item.Stadium?.IdCountry ?? '',
      home,
      homeName,
      homeScore: item.Home?.Score ?? -1,
      away,
      awayName,
      awayScore: item.Away?.Score ?? -1,
      status: normalizeStatus(item),
    };
  });

  return matches;
};

export const initializeMatchesIfMissing = async (
  db: Database,
  logger: Logger = console
): Promise<boolean> => {
  const matchesSnapshot = await db.ref('matches').once('value');

  if (matchesSnapshot.exists()) {
    return false;
  }

  logger.info('No matches found. Initializing matches from FIFA API...');
  const fifaMatches = await fetchFifaMatches();
  await db.ref('matches').set(transformFifaData(fifaMatches));
  logger.info(`Initialized ${fifaMatches.length} matches`);
  return true;
};

export const updateMatchScoresFromFifa = async (
  db: Database,
  options?: {
    logger?: Logger;
    recalculatePredictions?: boolean;
  }
): Promise<ScoreUpdateResult> => {
  const logger = options?.logger ?? console;
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const fifaMatches = await fetchFifaMatches(startOfDay, endOfDay);
  const matchesSnapshot = await db.ref('matches').once('value');
  const matches = matchesSnapshot.val() as Record<string, Match> | null;

  if (!matches) {
    logger.warn('No matches found in database');
    return { changedMatches: [], changedScores: 0, changedPredictions: 0 };
  }

  const updates: Record<string, number | MatchStatus> = {};
  const changedMatches = new Set<string>();

  for (const fifaMatch of fifaMatches) {
    for (const [gameId, match] of Object.entries(matches)) {
      if (match.fifaId !== fifaMatch.IdMatch) {
        continue;
      }

      const homeScore = fifaMatch.Home?.Score ?? -1;
      const awayScore = fifaMatch.Away?.Score ?? -1;
      const status = normalizeStatus(fifaMatch);

      if (homeScore >= 0 && match.homeScore !== homeScore) {
        updates[`matches/${gameId}/homeScore`] = homeScore;
        changedMatches.add(gameId);
      }

      if (awayScore >= 0 && match.awayScore !== awayScore) {
        updates[`matches/${gameId}/awayScore`] = awayScore;
        changedMatches.add(gameId);
      }

      if (status !== 'unknown' && match.status !== status) {
        updates[`matches/${gameId}/status`] = status;
        changedMatches.add(gameId);
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  let changedPredictions = 0;

  if (options?.recalculatePredictions && changedMatches.size > 0) {
    const settings = await getScoringSettings(db);

    for (const matchId of changedMatches) {
      const matchSnapshot = await db.ref(`matches/${matchId}`).once('value');
      const match = matchSnapshot.val() as Match | null;

      if (!match) {
        continue;
      }

      changedPredictions += await recalculateMatchPredictionPoints(
        db,
        matchId,
        match,
        settings,
        { updateUserTotals: true }
      );
    }
  }

  return {
    changedMatches: Array.from(changedMatches),
    changedScores: Object.keys(updates).length,
    changedPredictions,
  };
};
