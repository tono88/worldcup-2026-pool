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
  formulaRules: Record<string, ScoringFormulaRule>;
  predictionDeadlineMinutes: number;
  tournamentStartAt: number;
  updatedAt?: number;
  updatedBy?: string;
}

export type ScoringFormulaRuleType =
  | 'correctWinner'
  | 'correctGoalDifference'
  | 'exactScore'
  | 'correctDraw';

export interface ScoringFormulaRule {
  type: ScoringFormulaRuleType;
  label: string;
  points: number;
  enabled: boolean;
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
  formulaRules: {
    'correct-winner': {
      type: 'correctWinner',
      label: 'Adivinar equipo ganador',
      points: 1,
      enabled: true,
    },
    'goal-difference': {
      type: 'correctGoalDifference',
      label: 'Predecir distancia de goles',
      points: 2,
      enabled: true,
    },
    'exact-score': {
      type: 'exactScore',
      label: 'Resultado exacto',
      points: 3,
      enabled: true,
    },
    'correct-draw': {
      type: 'correctDraw',
      label: 'Empate correcto',
      points: 3,
      enabled: true,
    },
  },
  predictionDeadlineMinutes: 10,
  tournamentStartAt: DEFAULT_TOURNAMENT_START_AT,
};

const BONUS_RULE_LABELS: Record<BonusRuleType, string> = {
  correctHomeScore: 'Correct home score',
  correctAwayScore: 'Correct away score',
  correctGoalDifference: 'Correct goal difference',
};

const FORMULA_RULE_LABELS: Record<ScoringFormulaRuleType, string> = {
  correctWinner: 'Adivinar equipo ganador',
  correctGoalDifference: 'Predecir distancia de goles',
  exactScore: 'Resultado exacto',
  correctDraw: 'Empate correcto',
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

export const isFormulaRuleType = (
  value: unknown
): value is ScoringFormulaRuleType =>
  value === 'correctWinner' ||
  value === 'correctGoalDifference' ||
  value === 'exactScore' ||
  value === 'correctDraw';

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

const normalizeFormulaRules = (
  rules: unknown
): Record<string, ScoringFormulaRule> => {
  if (!rules || typeof rules !== 'object') {
    return DEFAULT_SCORING_SETTINGS.formulaRules;
  }

  const normalizedRules: Record<string, ScoringFormulaRule> = {};

  for (const [ruleId, rule] of Object.entries(
    rules as Record<string, Partial<ScoringFormulaRule>>
  )) {
    if (!ruleId || !isFormulaRuleType(rule.type)) {
      continue;
    }

    const label =
      typeof rule.label === 'string' && rule.label.trim()
        ? rule.label.trim().slice(0, 80)
        : FORMULA_RULE_LABELS[rule.type];

    normalizedRules[ruleId] = {
      type: rule.type,
      label,
      points: toFiniteNumber(rule.points, 0),
      enabled: rule.enabled !== false,
    };
  }

  return Object.keys(normalizedRules).length > 0
    ? normalizedRules
    : DEFAULT_SCORING_SETTINGS.formulaRules;
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
  formulaRules: normalizeFormulaRules(settings?.formulaRules),
  predictionDeadlineMinutes: toFiniteNumber(
    settings?.predictionDeadlineMinutes,
    DEFAULT_SCORING_SETTINGS.predictionDeadlineMinutes
  ),
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
    formulaRules: settings.formulaRules,
    predictionDeadlineMinutes: settings.predictionDeadlineMinutes,
    tournamentStartAt: settings.tournamentStartAt,
    updatedAt: Date.now(),
    updatedBy: userId,
  });
};
