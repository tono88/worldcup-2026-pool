import React from 'react';
import { AppLayout, Button, Card } from '../components';
import { useAuth, useMatches, useToast } from '../hooks';
import {
  getTournamentStartAt,
  isScoringLocked,
  saveScoringSettings,
  subscribeToScoringSettings,
  type BonusRuleType,
  type BonusScoringRule,
  type ScoringSettings,
} from '../services';

type NumericScoringField =
  | 'exactScorePoints'
  | 'correctResultPoints'
  | 'scoreDifferencePenalty'
  | 'minimumCorrectResultPoints'
  | 'wrongResultPoints';

const bonusRuleOptions: Array<{ type: BonusRuleType; label: string }> = [
  { type: 'correctHomeScore', label: 'Correct home score' },
  { type: 'correctAwayScore', label: 'Correct away score' },
  { type: 'correctGoalDifference', label: 'Correct goal difference' },
];

const getWinner = (home: number, away: number): 'home' | 'away' | 'tied' => {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'tied';
};

const getBonusRulePoints = (
  rule: BonusScoringRule,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): number => {
  if (!rule.enabled) return 0;

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

const calculateExamplePoints = (
  settings: ScoringSettings,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): number => {
  let points = settings.wrongResultPoints;

  if (homeScore === homePrediction && awayScore === awayPrediction) {
    points = settings.exactScorePoints;
  } else if (
    getWinner(homeScore, awayScore) ===
    getWinner(homePrediction, awayPrediction)
  ) {
    const difference =
      Math.abs(homePrediction - homeScore) +
      Math.abs(awayPrediction - awayScore);
    points = Math.max(
      settings.minimumCorrectResultPoints,
      settings.correctResultPoints -
        difference * settings.scoreDifferencePenalty
    );
  }

  for (const rule of Object.values(settings.bonusRules)) {
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

const formatLockDate = (timestamp: number): string =>
  new Intl.DateTimeFormat([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));

export const Rules = () => {
  const { user, userData } = useAuth();
  const { matches } = useMatches();
  const { showToast } = useToast();
  const fallbackTournamentStartAt = React.useMemo(
    () => getTournamentStartAt(matches),
    [matches]
  );
  const [settings, setSettings] = React.useState<ScoringSettings | null>(null);
  const [form, setForm] = React.useState<ScoringSettings | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [newBonusType, setNewBonusType] =
    React.useState<BonusRuleType>('correctHomeScore');
  const [newBonusPoints, setNewBonusPoints] = React.useState(1);

  const isAdmin = userData?.admin === true;
  const locked = settings ? isScoringLocked(settings) : false;
  const activeBonusRules = settings
    ? Object.entries(settings.bonusRules).filter(([, rule]) => rule.enabled)
    : [];
  const formBonusRules = form ? Object.entries(form.bonusRules) : [];
  const exactExample = settings
    ? calculateExamplePoints(settings, 2, 1, 2, 1)
    : 0;
  const correctWinnerExample = settings
    ? calculateExamplePoints(settings, 2, 1, 3, 0)
    : 0;
  const correctDrawExample = settings
    ? calculateExamplePoints(settings, 2, 2, 0, 0)
    : 0;
  const wrongResultExample = settings
    ? calculateExamplePoints(settings, 2, 1, 0, 2)
    : 0;

  React.useEffect(() => {
    const unsubscribe = subscribeToScoringSettings((nextSettings) => {
      setSettings(nextSettings);
      setForm(nextSettings);
    }, fallbackTournamentStartAt);

    return () => unsubscribe();
  }, [fallbackTournamentStartAt]);

  const handleNumberChange = (key: NumericScoringField, value: string) => {
    const numericValue = Math.max(0, Math.floor(Number(value) || 0));
    setForm((current) =>
      current ? { ...current, [key]: numericValue } : current
    );
  };

  const handleAddBonusRule = () => {
    const option = bonusRuleOptions.find((item) => item.type === newBonusType);
    if (!option) return;

    const ruleId = `bonus-${Date.now()}`;
    setForm((current) =>
      current
        ? {
            ...current,
            bonusRules: {
              ...current.bonusRules,
              [ruleId]: {
                type: option.type,
                label: option.label,
                points: Math.max(0, Math.floor(newBonusPoints || 0)),
                enabled: true,
              },
            },
          }
        : current
    );
  };

  const handleBonusRuleChange = (
    ruleId: string,
    updates: Partial<BonusScoringRule>
  ) => {
    setForm((current) => {
      if (!current || !current.bonusRules[ruleId]) return current;

      return {
        ...current,
        bonusRules: {
          ...current.bonusRules,
          [ruleId]: {
            ...current.bonusRules[ruleId],
            ...updates,
          },
        },
      };
    });
  };

  const handleRemoveBonusRule = (ruleId: string) => {
    setForm((current) => {
      if (!current) return current;

      const bonusRules = { ...current.bonusRules };
      delete bonusRules[ruleId];
      return { ...current, bonusRules };
    });
  };

  const handleSave = async () => {
    if (!form || !user || locked) return;

    setSaving(true);
    setError(null);

    try {
      await saveScoringSettings(form, user.uid);
      showToast('Scoring rules saved');
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : 'Failed to save scoring rules'
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-24 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-right font-semibold focus:outline-none focus:border-white/40 disabled:opacity-50';

  return (
    <AppLayout>
      <div className="pt-8 px-4 pb-8 max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Rules</h1>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">
            Prediction Deadline
          </h2>
          <p className="text-white/80">
            Predictions must be submitted{' '}
            <span className="text-white font-semibold">
              at least 10 minutes before kickoff
            </span>
            . After that, predictions are locked and cannot be changed.
          </p>
        </Card>

        {settings && (
          <Card className="p-6 mb-6">
            <div className="flex flex-col gap-2 mb-6">
              <h2 className="text-xl font-semibold text-white">
                How Points Are Calculated
              </h2>
              <p className="text-sm text-white/50">
                Locked from {formatLockDate(settings.tournamentStartAt)}
              </p>
            </div>

            <div className="space-y-4 text-white/80">
              <div className="flex items-start gap-3">
                <span className="text-2xl">1</span>
                <div>
                  <h3 className="font-semibold text-white">
                    Exact Score - {settings.exactScorePoints} points
                  </h3>
                  <p className="text-sm">
                    Predict the exact final score of both teams.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">2</span>
                <div>
                  <h3 className="font-semibold text-white">
                    Correct Result - up to {settings.correctResultPoints} points
                  </h3>
                  <p className="text-sm">
                    Predict the correct winner or draw. Points lose{' '}
                    {settings.scoreDifferencePenalty} per missed goal, down to{' '}
                    {settings.minimumCorrectResultPoints}.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">0</span>
                <div>
                  <h3 className="font-semibold text-white">
                    Wrong Result - {settings.wrongResultPoints} points
                  </h3>
                  <p className="text-sm">
                    Predict the wrong winner or miss a draw.
                  </p>
                </div>
              </div>

              {activeBonusRules.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <h3 className="font-semibold text-white mb-2">
                    Bonus Rules
                  </h3>
                  <div className="space-y-2">
                    {activeBonusRules.map(([ruleId, rule]) => (
                      <div
                        key={ruleId}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span>{rule.label}</span>
                        <span className="font-semibold text-white">
                          +{rule.points}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <h2 className="mt-8 text-xl font-semibold text-white mb-4">
              Examples
            </h2>

            <div className="space-y-6">
              <div className="border-b border-white/10 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Actual Result</span>
                  <span className="text-white font-mono">
                    Mexico 2 - 1 South Africa
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Your Prediction</span>
                  <span className="text-white font-mono">
                    Mexico 2 - 1 South Africa
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <span className="text-white/60 text-sm">Points Earned</span>
                  <span className="text-green-400 font-bold">
                    {exactExample} points
                  </span>
                </div>
              </div>

              <div className="border-b border-white/10 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Actual Result</span>
                  <span className="text-white font-mono">
                    Brazil 2 - 1 Morocco
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Your Prediction</span>
                  <span className="text-white font-mono">
                    Brazil 3 - 0 Morocco
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <span className="text-white/60 text-sm">Points Earned</span>
                  <div className="md:text-right">
                    <span className="text-yellow-400 font-bold">
                      {correctWinnerExample} points
                    </span>
                    <div className="text-white/40 text-xs font-mono">
                      {settings.correctResultPoints} - 2 x{' '}
                      {settings.scoreDifferencePenalty}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-b border-white/10 pb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Actual Result</span>
                  <span className="text-white font-mono">
                    Netherlands 2 - 2 Japan
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Your Prediction</span>
                  <span className="text-white font-mono">
                    Netherlands 0 - 0 Japan
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <span className="text-white/60 text-sm">Points Earned</span>
                  <div className="md:text-right">
                    <span className="text-yellow-400 font-bold">
                      {correctDrawExample} points
                    </span>
                    <div className="text-white/40 text-xs font-mono">
                      {settings.correctResultPoints} - 4 x{' '}
                      {settings.scoreDifferencePenalty}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Actual Result</span>
                  <span className="text-white font-mono">
                    England 2 - 1 Croatia
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-2">
                  <span className="text-white/60 text-sm">Your Prediction</span>
                  <span className="text-white font-mono">
                    England 0 - 2 Croatia
                  </span>
                </div>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <span className="text-white/60 text-sm">Points Earned</span>
                  <span className="text-red-400 font-bold">
                    {wrongResultExample} points
                  </span>
                </div>
              </div>
            </div>
          </Card>
        )}

        {isAdmin && form && (
          <Card className="p-6">
            <div className="flex flex-col gap-2 mb-6">
              <h2 className="text-xl font-semibold text-white">
                Scoring Settings
              </h2>
              <p className="text-sm text-white/50">
                {locked
                  ? 'Scoring settings are locked.'
                  : 'Editable until tournament kickoff.'}
              </p>
            </div>

            <div className="space-y-4">
              {[
                ['exactScorePoints', 'Exact score points'],
                ['correctResultPoints', 'Correct result max points'],
                ['scoreDifferencePenalty', 'Penalty per missed goal'],
                ['minimumCorrectResultPoints', 'Minimum correct result points'],
                ['wrongResultPoints', 'Wrong result points'],
              ].map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-4 text-white/80"
                >
                  <span>{label}</span>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={form[key as NumericScoringField]}
                    onChange={(event) =>
                      handleNumberChange(
                        key as NumericScoringField,
                        event.target.value
                      )
                    }
                    disabled={locked || saving}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 pt-6 border-t border-white/10">
              <h3 className="font-semibold text-white mb-4">Bonus Rules</h3>

              <div className="flex flex-col md:flex-row gap-3">
                <select
                  value={newBonusType}
                  onChange={(event) =>
                    setNewBonusType(event.target.value as BonusRuleType)
                  }
                  disabled={locked || saving}
                  className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 disabled:opacity-50"
                >
                  {bonusRuleOptions.map((option) => (
                    <option key={option.type} value={option.type}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={newBonusPoints}
                  onChange={(event) =>
                    setNewBonusPoints(
                      Math.max(0, Math.floor(Number(event.target.value) || 0))
                    )
                  }
                  disabled={locked || saving}
                  className={inputClass}
                />
                <Button
                  type="button"
                  onClick={handleAddBonusRule}
                  disabled={locked || saving}
                >
                  Add
                </Button>
              </div>

              {formBonusRules.length > 0 && (
                <div className="mt-4 space-y-3">
                  {formBonusRules.map(([ruleId, rule]) => (
                    <div
                      key={ruleId}
                      className="flex flex-col md:flex-row md:items-center gap-3 text-white/80"
                    >
                      <label className="flex flex-1 items-center gap-3">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(event) =>
                            handleBonusRuleChange(ruleId, {
                              enabled: event.target.checked,
                            })
                          }
                          disabled={locked || saving}
                        />
                        <span>{rule.label}</span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        value={rule.points}
                        onChange={(event) =>
                          handleBonusRuleChange(ruleId, {
                            points: Math.max(
                              0,
                              Math.floor(Number(event.target.value) || 0)
                            ),
                          })
                        }
                        disabled={locked || saving}
                        className={inputClass}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRemoveBonusRule(ruleId)}
                        disabled={locked || saving}
                        className="text-sm"
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={locked || saving}
              >
                {saving ? 'Saving...' : 'Save Rules'}
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
};
