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

type Winner = 'home' | 'away' | 'tied';

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

const isFormulaRuleType = (value: unknown): value is ScoringFormulaRuleType =>
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
  formulaRules: normalizeFormulaRules(settings?.formulaRules),
  predictionDeadlineMinutes: toFiniteNumber(
    settings?.predictionDeadlineMinutes,
    DEFAULT_SCORING_SETTINGS.predictionDeadlineMinutes
  ),
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

const formulaRuleMatches = (
  rule: ScoringFormulaRule,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): boolean => {
  if (!rule.enabled) {
    return false;
  }

  switch (rule.type) {
    case 'correctWinner':
      return (
        getWinner(homeScore, awayScore) !== 'tied' &&
        getWinner(homeScore, awayScore) ===
          getWinner(homePrediction, awayPrediction)
      );
    case 'correctGoalDifference':
      return homeScore - awayScore === homePrediction - awayPrediction;
    case 'exactScore':
      return homeScore === homePrediction && awayScore === awayPrediction;
    case 'correctDraw':
      return (
        getWinner(homeScore, awayScore) === 'tied' &&
        getWinner(homePrediction, awayPrediction) === 'tied'
      );
    default:
      return false;
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

  if (scoringSettings.formulaRules) {
    return Object.values(scoringSettings.formulaRules).reduce(
      (formulaPoints, rule) => {
        if (
          !formulaRuleMatches(
            rule,
            homeScore,
            awayScore,
            homePrediction,
            awayPrediction
          )
        ) {
          return formulaPoints;
        }
        return Math.max(formulaPoints, rule.points);
      },
      0
    );
  }

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
