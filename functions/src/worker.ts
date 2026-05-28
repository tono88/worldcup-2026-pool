import { getDatabase } from './firebaseAdmin';
import {
  initializeMatchesIfMissing,
  updateMatchScoresFromFifa,
} from './matchData';

const DEFAULT_INTERVAL_SECONDS = 60;

const getIntervalMs = (): number => {
  const interval = Number(process.env.FIFA_UPDATE_INTERVAL_SECONDS);

  if (!Number.isFinite(interval) || interval < 15) {
    return DEFAULT_INTERVAL_SECONDS * 1000;
  }

  return Math.floor(interval) * 1000;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const runOnce = async (): Promise<void> => {
  const db = getDatabase();
  await initializeMatchesIfMissing(db);

  const result = await updateMatchScoresFromFifa(db, {
    recalculatePredictions: true,
  });

  if (result.changedScores > 0 || result.changedPredictions > 0) {
    console.info(
      `Updated ${result.changedScores} match fields and ${result.changedPredictions} predictions`
    );
  } else {
    console.info('No live score changes found');
  }
};

const main = async (): Promise<void> => {
  const intervalMs = getIntervalMs();
  console.info(`Starting score worker. Poll interval: ${intervalMs / 1000}s`);

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error('Score worker update failed:', error);
    }

    await sleep(intervalMs);
  }
};

void main();
