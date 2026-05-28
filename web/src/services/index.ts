export { fetchMatches, getMatch, refreshMatches } from './matchService';
export type { Match, MatchesData } from './matchService';

export {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_TOURNAMENT_START_AT,
  getScoringSettings,
  getTournamentStartAt,
  isFormulaRuleType,
  isScoringLocked,
  normalizeScoringSettings,
  saveScoringSettings,
  subscribeToScoringSettings,
} from './scoringService';
export type {
  BonusRuleType,
  BonusScoringRule,
  ScoringFormulaRule,
  ScoringFormulaRuleType,
  ScoringSettings,
} from './scoringService';

export {
  checkUsernameAvailable,
  deleteUserAccount,
  getAdminUsers,
  getUserByUsername,
  handleUserLogin,
  isReservedUsername,
  sanitizeUsername,
  subscribeToLeaderboard,
  updateUserRole,
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
