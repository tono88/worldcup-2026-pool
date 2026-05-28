import type * as admin from 'firebase-admin';
import {
  calculatePoints,
  normalizeScoringSettings,
  type ScoringSettings,
} from './scoring';

interface Match {
  homeScore: number;
  awayScore: number;
}

interface Prediction {
  homePrediction: number;
  awayPrediction: number;
  points: number;
}

type Database = admin.database.Database;

export const getScoringSettings = async (
  db: Database
): Promise<ScoringSettings> => {
  const snapshot = await db.ref('settings/scoring').once('value');
  return normalizeScoringSettings(
    snapshot.exists() ? (snapshot.val() as Partial<ScoringSettings>) : null
  );
};

export const recalculateUserScores = async (
  db: Database,
  userIds?: string[]
): Promise<number> => {
  const predictionsSnapshot = await db.ref('predictions').once('value');
  const predictions =
    (predictionsSnapshot.val() as Record<string, Record<string, Prediction>>) ??
    {};

  const targetUserIds = userIds ?? Object.keys(predictions);
  const updates: Record<string, number> = {};

  for (const userId of targetUserIds) {
    const userPredictions = predictions[userId] ?? {};
    const score = Object.values(userPredictions).reduce(
      (total, prediction) => total + (prediction.points ?? 0),
      0
    );
    updates[`users/${userId}/score`] = score;
  }

  if (Object.keys(updates).length === 0) {
    return 0;
  }

  await db.ref().update(updates);
  return Object.keys(updates).length;
};

export const recalculateMatchPredictionPoints = async (
  db: Database,
  matchId: string,
  match: Match,
  settings?: ScoringSettings,
  options?: { updateUserTotals?: boolean }
): Promise<number> => {
  if (match.homeScore < 0 || match.awayScore < 0) {
    return 0;
  }

  const scoringSettings = settings ?? (await getScoringSettings(db));
  const predictionsSnapshot = await db.ref('predictions').once('value');
  const predictions =
    (predictionsSnapshot.val() as Record<string, Record<string, Prediction>>) ??
    {};

  const updates: Record<string, number> = {};
  const touchedUserIds = new Set<string>();

  for (const [userId, userPredictions] of Object.entries(predictions)) {
    const prediction = userPredictions[matchId];

    if (!prediction) {
      continue;
    }

    const points = calculatePoints(
      match.homeScore,
      match.awayScore,
      prediction.homePrediction,
      prediction.awayPrediction,
      scoringSettings
    );

    if (prediction.points !== points) {
      updates[`predictions/${userId}/${matchId}/points`] = points;
      touchedUserIds.add(userId);
    }
  }

  if (Object.keys(updates).length === 0) {
    return 0;
  }

  await db.ref().update(updates);

  if (options?.updateUserTotals) {
    await recalculateUserScores(db, Array.from(touchedUserIds));
  }

  return Object.keys(updates).length;
};

export const recalculateAllPredictionPoints = async (
  db: Database,
  options?: { updateUserTotals?: boolean }
): Promise<number> => {
  const settings = await getScoringSettings(db);
  const matchesSnapshot = await db.ref('matches').once('value');
  const matches = (matchesSnapshot.val() as Record<string, Match>) ?? {};
  let changedPredictions = 0;

  for (const [matchId, match] of Object.entries(matches)) {
    changedPredictions += await recalculateMatchPredictionPoints(
      db,
      matchId,
      match,
      settings
    );
  }

  if (options?.updateUserTotals) {
    await recalculateUserScores(db);
  }

  return changedPredictions;
};
