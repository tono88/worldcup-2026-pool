import { get, onValue, ref, set, type Unsubscribe } from 'firebase/database';
import { db } from '../firebase';
import { isLocalBackend } from '../config';
import { localApi, poll } from './localApi';
import type { MatchesData } from './matchService';

export interface ScoringSettings {
  exactScorePoints: number;
  correctResultPoints: number;
  scoreDifferencePenalty: number;
  minimumCorrectResultPoints: number;
  wrongResultPoints: number;
  bonusRules: Record<string, BonusScoringRule>;
  tournamentStartAt: number;
  updatedAt?: number;
  updatedBy?: string;
}

export type BonusRuleType =
  | 'correctHomeScore'
  | 'correctAwayScore'
  | 'correctGoalDifference';

export interface BonusScoringRule {
  type: BonusRuleType;
  label: string;
  points: number;
  enabled: boolean;
}

export const DEFAULT_TOURNAMENT_START_AT = Date.parse(
  '2026-06-11T19:00:00.000Z'
);

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  exactScorePoints: 15,
  correctResultPoints: 10,
  scoreDifferencePenalty: 1,
  minimumCorrectResultPoints: 0,
  wrongResultPoints: 0,
  bonusRules: {},
  tournamentStartAt: DEFAULT_TOURNAMENT_START_AT,
};

const BONUS_RULE_LABELS: Record<BonusRuleType, string> = {
  correctHomeScore: 'Correct home score',
  correctAwayScore: 'Correct away score',
  correctGoalDifference: 'Correct goal difference',
};

const toFiniteNumber = (
  value: unknown,
  fallback: number,
  minimum = 0
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(value));
};

const isBonusRuleType = (value: unknown): value is BonusRuleType =>
  value === 'correctHomeScore' ||
  value === 'correctAwayScore' ||
  value === 'correctGoalDifference';

const normalizeBonusRules = (
  rules: unknown
): Record<string, BonusScoringRule> => {
  if (!rules || typeof rules !== 'object') {
    return {};
  }

  const normalizedRules: Record<string, BonusScoringRule> = {};

  for (const [ruleId, rule] of Object.entries(
    rules as Record<string, Partial<BonusScoringRule>>
  )) {
    if (!ruleId || !isBonusRuleType(rule.type)) {
      continue;
    }

    const label =
      typeof rule.label === 'string' && rule.label.trim()
        ? rule.label.trim().slice(0, 60)
        : BONUS_RULE_LABELS[rule.type];

    normalizedRules[ruleId] = {
      type: rule.type,
      label,
      points: toFiniteNumber(rule.points, 0),
      enabled: rule.enabled !== false,
    };
  }

  return normalizedRules;
};

export const getTournamentStartAt = (
  matches?: MatchesData | null
): number => {
  if (!matches) {
    return DEFAULT_TOURNAMENT_START_AT;
  }

  const timestamps = Object.values(matches)
    .map((match) => match.timestamp * 1000)
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0);

  if (timestamps.length === 0) {
    return DEFAULT_TOURNAMENT_START_AT;
  }

  return Math.min(...timestamps);
};

export const normalizeScoringSettings = (
  settings: Partial<ScoringSettings> | null | undefined,
  fallbackTournamentStartAt = DEFAULT_TOURNAMENT_START_AT
): ScoringSettings => ({
  exactScorePoints: toFiniteNumber(
    settings?.exactScorePoints,
    DEFAULT_SCORING_SETTINGS.exactScorePoints
  ),
  correctResultPoints: toFiniteNumber(
    settings?.correctResultPoints,
    DEFAULT_SCORING_SETTINGS.correctResultPoints
  ),
  scoreDifferencePenalty: toFiniteNumber(
    settings?.scoreDifferencePenalty,
    DEFAULT_SCORING_SETTINGS.scoreDifferencePenalty
  ),
  minimumCorrectResultPoints: toFiniteNumber(
    settings?.minimumCorrectResultPoints,
    DEFAULT_SCORING_SETTINGS.minimumCorrectResultPoints
  ),
  wrongResultPoints: toFiniteNumber(
    settings?.wrongResultPoints,
    DEFAULT_SCORING_SETTINGS.wrongResultPoints
  ),
  bonusRules: normalizeBonusRules(settings?.bonusRules),
  tournamentStartAt: toFiniteNumber(
    settings?.tournamentStartAt,
    fallbackTournamentStartAt
  ),
  ...(settings?.updatedAt !== undefined && {
    updatedAt: toFiniteNumber(settings.updatedAt, 0),
  }),
  ...(settings?.updatedBy && { updatedBy: settings.updatedBy }),
});

export const isScoringLocked = (
  settings: Partial<ScoringSettings> | null | undefined,
  now = Date.now()
): boolean => now >= normalizeScoringSettings(settings).tournamentStartAt;

export const getScoringSettings = async (
  fallbackTournamentStartAt?: number
): Promise<ScoringSettings> => {
  if (isLocalBackend) {
    return normalizeScoringSettings(
      await localApi.getScoringSettings(),
      fallbackTournamentStartAt
    );
  }

  const snapshot = await get(ref(db, 'settings/scoring'));
  return normalizeScoringSettings(
    snapshot.exists() ? (snapshot.val() as Partial<ScoringSettings>) : null,
    fallbackTournamentStartAt
  );
};

export const subscribeToScoringSettings = (
  callback: (settings: ScoringSettings) => void,
  fallbackTournamentStartAt?: number
): Unsubscribe => {
  if (isLocalBackend) {
    return poll(
      async () =>
        normalizeScoringSettings(
          await localApi.getScoringSettings(),
          fallbackTournamentStartAt
        ),
      callback,
      10000
    );
  }

  return onValue(ref(db, 'settings/scoring'), (snapshot) => {
    callback(
      normalizeScoringSettings(
        snapshot.exists() ? (snapshot.val() as Partial<ScoringSettings>) : null,
        fallbackTournamentStartAt
      )
    );
  });
};

export const saveScoringSettings = async (
  settings: ScoringSettings,
  userId: string
): Promise<void> => {
  if (isLocalBackend) {
    await localApi.saveScoringSettings(settings, userId);
    return;
  }

  await set(ref(db, 'settings/scoring'), {
    exactScorePoints: settings.exactScorePoints,
    correctResultPoints: settings.correctResultPoints,
    scoreDifferencePenalty: settings.scoreDifferencePenalty,
    minimumCorrectResultPoints: settings.minimumCorrectResultPoints,
    wrongResultPoints: settings.wrongResultPoints,
    bonusRules: settings.bonusRules ?? {},
    tournamentStartAt: settings.tournamentStartAt,
    updatedAt: Date.now(),
    updatedBy: userId,
  });
};
