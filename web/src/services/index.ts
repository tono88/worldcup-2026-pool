export { fetchMatches, getMatch, refreshMatches } from './matchService';
export type { Match, MatchesData } from './matchService';

export {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_TOURNAMENT_START_AT,
  getScoringSettings,
  getTournamentStartAt,
  isScoringLocked,
  normalizeScoringSettings,
  saveScoringSettings,
  subscribeToScoringSettings,
} from './scoringService';
export type {
  BonusRuleType,
  BonusScoringRule,
  ScoringSettings,
} from './scoringService';

export {
  checkUsernameAvailable,
  deleteUserAccount,
  getUserByUsername,
  handleUserLogin,
  isReservedUsername,
  sanitizeUsername,
  subscribeToLeaderboard,
  updateUserProfile,
  uploadProfilePicture,
} from './userService';
export type { UserData, UserWithId } from './userService';

export {
  getPrediction,
  getUserPredictions,
  savePrediction,
  subscribeToPredictions,
} from './predictionService';
export type { Prediction, UserPredictions } from './predictionService';

export {
  checkSlugAvailable,
  createLeague,
  deleteLeague,
  generateSlug,
  getLeagueBySlug,
  getLeagueByInviteCode,
  getLeagueMembers,
  getLeaguesOwnedByUser,
  isLeagueMember,
  joinLeague,
  leaveLeague,
  regenerateInviteCode,
  subscribeToLeagueMembers,
  subscribeToUserLeagues,
  updateLeague,
  uploadLeagueImage,
} from './leagueService';
export type { League, LeagueWithId } from './leagueService';
