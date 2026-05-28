import React from 'react';
import { AppLayout, Button, Card } from '../components';
import { useAuth, useMatches, useToast } from '../hooks';
import {
  getTournamentStartAt,
  isFormulaRuleType,
  isScoringLocked,
  saveScoringSettings,
  subscribeToScoringSettings,
  type ScoringFormulaRule,
  type ScoringFormulaRuleType,
  type ScoringSettings,
} from '../services';

const formulaRuleOptions: Array<{
  type: ScoringFormulaRuleType;
  label: string;
}> = [
  { type: 'correctWinner', label: 'Adivinar equipo ganador' },
  { type: 'correctGoalDifference', label: 'Predecir distancia de goles' },
  { type: 'exactScore', label: 'Resultado exacto' },
  { type: 'correctDraw', label: 'Empate correcto' },
];

const getWinner = (home: number, away: number): 'home' | 'away' | 'tied' => {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'tied';
};

const ruleMatches = (
  rule: ScoringFormulaRule,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): boolean => {
  if (!rule.enabled) return false;

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

const calculateExamplePoints = (
  settings: ScoringSettings,
  homeScore: number,
  awayScore: number,
  homePrediction: number,
  awayPrediction: number
): number =>
  Object.values(settings.formulaRules).reduce((points, rule) => {
    if (!ruleMatches(rule, homeScore, awayScore, homePrediction, awayPrediction)) {
      return points;
    }
    return Math.max(points, rule.points);
  }, 0);

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
  const [newRuleType, setNewRuleType] =
    React.useState<ScoringFormulaRuleType>('correctWinner');
  const [newRulePoints, setNewRulePoints] = React.useState(1);

  const isAdmin = userData?.admin === true;
  const locked = settings ? isScoringLocked(settings) : false;
  const activeRules = settings
    ? Object.entries(settings.formulaRules).filter(([, rule]) => rule.enabled)
    : [];
  const formRules = form ? Object.entries(form.formulaRules) : [];
  const exactExample = settings
    ? calculateExamplePoints(settings, 2, 1, 2, 1)
    : 0;
  const winnerExample = settings
    ? calculateExamplePoints(settings, 2, 1, 3, 1)
    : 0;
  const differenceExample = settings
    ? calculateExamplePoints(settings, 2, 1, 1, 0)
    : 0;
  const drawExample = settings
    ? calculateExamplePoints(settings, 1, 1, 0, 0)
    : 0;

  React.useEffect(() => {
    const unsubscribe = subscribeToScoringSettings((nextSettings) => {
      setSettings(nextSettings);
      setForm(nextSettings);
    }, fallbackTournamentStartAt);

    return () => unsubscribe();
  }, [fallbackTournamentStartAt]);

  const updateRule = (
    ruleId: string,
    updates: Partial<ScoringFormulaRule>
  ) => {
    setForm((current) => {
      if (!current || !current.formulaRules[ruleId]) return current;

      const currentRule = current.formulaRules[ruleId];
      const nextType = updates.type ?? currentRule.type;
      if (!isFormulaRuleType(nextType)) return current;

      return {
        ...current,
        formulaRules: {
          ...current.formulaRules,
          [ruleId]: {
            ...currentRule,
            ...updates,
            type: nextType,
          },
        },
      };
    });
  };

  const removeRule = (ruleId: string) => {
    setForm((current) => {
      if (!current) return current;
      const formulaRules = { ...current.formulaRules };
      delete formulaRules[ruleId];
      return { ...current, formulaRules };
    });
  };

  const addRule = () => {
    const option = formulaRuleOptions.find((item) => item.type === newRuleType);
    if (!option) return;

    const ruleId = `rule-${Date.now()}`;
    setForm((current) =>
      current
        ? {
            ...current,
            formulaRules: {
              ...current.formulaRules,
              [ruleId]: {
                type: option.type,
                label: option.label,
                points: Math.max(0, Math.floor(newRulePoints || 0)),
                enabled: true,
              },
            },
          }
        : current
    );
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
    'w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 disabled:opacity-50';
  const numberInputClass = `${inputClass} text-right font-semibold`;

  return (
    <AppLayout>
      <div className="pt-8 px-4 pb-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8">Rules</h1>

        {settings && (
          <>
            <Card className="p-6 mb-6">
              <div className="flex flex-col gap-2 mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Points Formula
                </h2>
                <p className="text-sm text-white/60">
                  The highest matching rule wins. Predictions close{' '}
                  {settings.predictionDeadlineMinutes} minutes before kickoff.
                </p>
                <p className="text-xs text-white/40">
                  Rule edits lock from {formatLockDate(settings.tournamentStartAt)}.
                </p>
              </div>

              <div className="space-y-3 text-white/80">
                {activeRules.map(([ruleId, rule]) => (
                  <div
                    key={ruleId}
                    className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"
                  >
                    <span>{rule.label}</span>
                    <span className="font-bold text-white">{rule.points}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">
                Examples
              </h2>
              <div className="grid gap-3 text-sm text-white/75 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="font-mono text-white">2-1 predicted 2-1</div>
                  <div className="mt-1 text-emerald-300">{exactExample} pts</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="font-mono text-white">2-1 predicted 3-1</div>
                  <div className="mt-1 text-emerald-300">{winnerExample} pts</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="font-mono text-white">2-1 predicted 1-0</div>
                  <div className="mt-1 text-emerald-300">
                    {differenceExample} pts
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 p-3">
                  <div className="font-mono text-white">1-1 predicted 0-0</div>
                  <div className="mt-1 text-emerald-300">{drawExample} pts</div>
                </div>
              </div>
            </Card>
          </>
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
                  : 'Remove rules, add rules, and adjust the deadline.'}
              </p>
            </div>

            <label className="mb-6 block text-white/80">
              <span className="mb-2 block text-sm text-white/70">
                Prediction deadline before kickoff, in minutes
              </span>
              <input
                type="number"
                min={0}
                max={10080}
                value={form.predictionDeadlineMinutes}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? {
                          ...current,
                          predictionDeadlineMinutes: Math.max(
                            0,
                            Math.floor(Number(event.target.value) || 0)
                          ),
                        }
                      : current
                  )
                }
                disabled={locked || saving}
                className={numberInputClass}
              />
            </label>

            <div className="space-y-3">
              {formRules.map(([ruleId, rule]) => (
                <div
                  key={ruleId}
                  className="grid gap-3 rounded-lg border border-white/10 p-3 md:grid-cols-[auto_1fr_1fr_5rem_auto]"
                >
                  <label className="flex items-center gap-2 text-white/80">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) =>
                        updateRule(ruleId, { enabled: event.target.checked })
                      }
                      disabled={locked || saving}
                    />
                    On
                  </label>
                  <select
                    value={rule.type}
                    onChange={(event) =>
                      updateRule(ruleId, {
                        type: event.target.value as ScoringFormulaRuleType,
                      })
                    }
                    disabled={locked || saving}
                    className={inputClass}
                  >
                    {formulaRuleOptions.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={rule.label}
                    onChange={(event) =>
                      updateRule(ruleId, { label: event.target.value })
                    }
                    disabled={locked || saving}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={rule.points}
                    onChange={(event) =>
                      updateRule(ruleId, {
                        points: Math.max(
                          0,
                          Math.floor(Number(event.target.value) || 0)
                        ),
                      })
                    }
                    disabled={locked || saving}
                    className={numberInputClass}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => removeRule(ruleId)}
                    disabled={locked || saving}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-3 border-t border-white/10 pt-6 md:grid-cols-[1fr_6rem_auto]">
              <select
                value={newRuleType}
                onChange={(event) =>
                  setNewRuleType(event.target.value as ScoringFormulaRuleType)
                }
                disabled={locked || saving}
                className={inputClass}
              >
                {formulaRuleOptions.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={99}
                value={newRulePoints}
                onChange={(event) =>
                  setNewRulePoints(
                    Math.max(0, Math.floor(Number(event.target.value) || 0))
                  )
                }
                disabled={locked || saving}
                className={numberInputClass}
              />
              <Button
                type="button"
                onClick={addRule}
                disabled={locked || saving}
              >
                Add Rule
              </Button>
            </div>

            {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={locked || saving || formRules.length === 0}
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
