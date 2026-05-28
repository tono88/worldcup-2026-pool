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

type Winner = 'home' | 'away' | 'tied';

const BONUS_RULE_LABELS: Record<BonusRuleType, string> = {
  correctHomeScore: 'Correct home score',
  correctAwayScore: 'Correct away score',
  correctGoalDifference: 'Correct goal difference',
};

export const getWinner = (home: number, away: number): Winner => {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'tied';
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

export const normalizeScoringSettings = (
  settings: Partial<ScoringSettings> | null | undefined
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
    DEFAULT_SCORING_SETTINGS.tournamentStartAt
  ),
  ...(settings?.updatedAt !== undefined && {
    updatedAt: toFiniteNumber(settings.updatedAt, 0),
  }),
  ...(settings?.updatedBy && { updatedBy: settings.updatedBy }),
});

const getBonusRulePoints = (
  rule: BonusScoringRule,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): number => {
  if (!rule.enabled) {
    return 0;
  }

  switch (rule.type) {
    case 'correctHomeScore':
      return homeScore === homePrediction ? rule.points : 0;
    case 'correctAwayScore':
      return awayScore === awayPrediction ? rule.points : 0;
    case 'correctGoalDifference':
      return homeScore - awayScore === homePrediction - awayPrediction
        ? rule.points
        : 0;
    default:
      return 0;
  }
};

export const isScoringLocked = (
  settings: Partial<ScoringSettings> | null | undefined,
  now = Date.now()
): boolean => now >= normalizeScoringSettings(settings).tournamentStartAt;

export const calculatePoints = (
  homeScore: number,
  awayScore: number,
  homePrediction: number | null,
  awayPrediction: number | null,
  settings?: Partial<ScoringSettings> | null
): number => {
  const scoringSettings = normalizeScoringSettings(settings);

  if (
    homeScore < 0 ||
    awayScore < 0 ||
    homePrediction === null ||
    awayPrediction === null
  ) {
    return 0;
  }

  let points = scoringSettings.wrongResultPoints;

  if (homeScore === homePrediction && awayScore === awayPrediction) {
    points = scoringSettings.exactScorePoints;
  } else if (
    getWinner(homeScore, awayScore) ===
    getWinner(homePrediction, awayPrediction)
  ) {
    const difference =
      Math.abs(homePrediction - homeScore) +
      Math.abs(awayPrediction - awayScore);
    const penalty = difference * scoringSettings.scoreDifferencePenalty;
    points = Math.max(
      scoringSettings.minimumCorrectResultPoints,
      scoringSettings.correctResultPoints - penalty
    );
  }

  for (const rule of Object.values(scoringSettings.bonusRules)) {
    points += getBonusRulePoints(
      rule,
      homeScore,
      awayScore,
      homePrediction,
      awayPrediction
    );
  }

  return points;
};
