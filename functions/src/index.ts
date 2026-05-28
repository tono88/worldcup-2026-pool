import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onValueWritten } from 'firebase-functions/v2/database';
import { logger } from 'firebase-functions';
import { getDatabase } from './firebaseAdmin';
import {
  initializeMatchesIfMissing,
  updateMatchScoresFromFifa,
} from './matchData';
import {
  recalculateAllPredictionPoints,
  recalculateMatchPredictionPoints,
  recalculateUserScores,
} from './scoreEngine';

interface Match {
  homeScore: number;
  awayScore: number;
}

/**
 * Scheduled function to fetch and update match scores from FIFA API.
 * Runs every 1 minute during the tournament.
 */
export const updateMatchScores = onSchedule('every 1 minutes', async () => {
  logger.info('Updating match scores from FIFA API...');

  try {
    const db = getDatabase();
    await initializeMatchesIfMissing(db, logger);
    const result = await updateMatchScoresFromFifa(db, { logger });
    logger.info(
      `Applied ${result.changedScores} match field updates across ${result.changedMatches.length} matches`
    );
  } catch (error) {
    logger.error('Error updating match scores:', error);
  }
});

/**
 * Triggered when a match is updated.
 * Recalculates prediction points for all users for that match.
 */
export const updatePredictionPoints = onValueWritten(
  'matches/{matchId}',
  async (event) => {
    const matchId = event.params.matchId;
    const match = event.data.after.val() as Match | null;

    if (!match) {
      logger.warn(`Match ${matchId} was deleted`);
      return;
    }

    if (match.homeScore < 0 || match.awayScore < 0) {
      return;
    }

    logger.info(`Updating prediction points for match ${matchId}`);

    try {
      const updatedPredictions = await recalculateMatchPredictionPoints(
        getDatabase(),
        matchId,
        match
      );
      logger.info(
        `Updated ${updatedPredictions} prediction points for match ${matchId}`
      );
    } catch (error) {
      logger.error('Error updating prediction points:', error);
    }
  }
);

/**
 * Triggered when scoring settings change before the tournament starts.
 * Recalculates any already-scored predictions with the new rules.
 */
export const updateAllPredictionPoints = onValueWritten(
  'settings/scoring',
  async () => {
    logger.info('Scoring settings changed. Recalculating prediction points...');

    try {
      const updatedPredictions = await recalculateAllPredictionPoints(
        getDatabase()
      );
      logger.info(
        `Recalculated scoring settings for ${updatedPredictions} predictions`
      );
    } catch (error) {
      logger.error('Error recalculating all prediction points:', error);
    }
  }
);

/**
 * Triggered when prediction points change.
 * Rebuilds the user's total from all prediction points to avoid drift.
 */
export const updateUserScore = onValueWritten(
  'predictions/{userId}/{matchId}/points',
  async (event) => {
    const { userId } = event.params;
    const beforePoints = event.data.before.val() as number | null ?? 0;
    const afterPoints = event.data.after.val() as number | null ?? 0;

    if (beforePoints === afterPoints) {
      return;
    }

    try {
      await recalculateUserScores(getDatabase(), [userId]);
      logger.info(`Recalculated total score for user ${userId}`);
    } catch (error) {
      logger.error('Error updating user score:', error);
    }
  }
);
