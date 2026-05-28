import { apiBaseUrl } from '../config';
import type { LeagueWithId } from './leagueService';
import type { Match, MatchesData } from './matchService';
import type { Prediction, UserPredictions } from './predictionService';
import type { ScoringSettings } from './scoringService';
import type { UserData, UserWithId } from './userService';

export interface LocalUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
}

const request = async <T>(
  path: string,
  options?: RequestInit
): Promise<T> => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const poll = <T>(
  load: () => Promise<T>,
  callback: (value: T) => void,
  intervalMs = 5000
): (() => void) => {
  let active = true;
  let timeoutId: number | undefined;

  const tick = () => {
    load()
      .then((value) => {
        if (active) callback(value);
      })
      .catch(console.error)
      .finally(() => {
        if (active) timeoutId = window.setTimeout(tick, intervalMs);
      });
  };

  void tick();

  return () => {
    active = false;
    if (timeoutId) window.clearTimeout(timeoutId);
  };
};

export const localApi = {
  signIn: (displayName: string) =>
    request<{ user: LocalUser; userData: UserData }>('/auth/local', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),

  getSession: (userId: string) =>
    request<{ user: LocalUser; userData: UserData }>(
      `/auth/local/${encodeURIComponent(userId)}`
    ),

  getMatches: () => request<MatchesData>('/matches'),
  refreshMatches: () =>
    request<MatchesData>('/matches/refresh', { method: 'POST' }),
  getMatch: (gameNumber: string) =>
    request<Match | null>(`/matches/${encodeURIComponent(gameNumber)}`),

  getUserPredictions: (userId: string) =>
    request<UserPredictions>(`/users/${encodeURIComponent(userId)}/predictions`),
  getPrediction: (userId: string, gameId: number) =>
    request<Prediction | null>(
      `/users/${encodeURIComponent(userId)}/predictions/${gameId}`
    ),
  savePrediction: (
    userId: string,
    gameId: number,
    homePrediction: number,
    awayPrediction: number
  ) =>
    request<void>(`/users/${encodeURIComponent(userId)}/predictions/${gameId}`, {
      method: 'PUT',
      body: JSON.stringify({ homePrediction, awayPrediction }),
    }),

  getLeaderboard: () => request<UserWithId[]>('/users'),
  checkUsername: (userName: string, currentUid?: string) => {
    const params = new URLSearchParams({ userName });
    if (currentUid) params.set('currentUid', currentUid);
    return request<{ available: boolean }>(`/usernames/check?${params}`);
  },
  updateUserProfile: (
    userId: string,
    data: { userName?: string; displayName?: string; photoURL?: string }
  ) =>
    request<UserData>(`/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getUserByUsername: (userName: string) =>
    request<{ id: string; data: UserData } | null>(
      `/users/by-username/${encodeURIComponent(userName)}`
    ),
  deleteUserAccount: (userId: string) =>
    request<void>(`/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  checkSlugAvailable: (slug: string) =>
    request<{ available: boolean }>(
      `/leagues/slugs/check?slug=${encodeURIComponent(slug)}`
    ),
  createLeague: (
    name: string,
    ownerId: string,
    options?: { slug?: string; description?: string }
  ) =>
    request<LeagueWithId>('/leagues', {
      method: 'POST',
      body: JSON.stringify({ name, ownerId, ...options }),
    }),
  getLeagueBySlug: (slug: string) =>
    request<LeagueWithId | null>(`/leagues/by-slug/${encodeURIComponent(slug)}`),
  getLeagueByInviteCode: (inviteCode: string) =>
    request<LeagueWithId | null>(
      `/leagues/by-code/${encodeURIComponent(inviteCode)}`
    ),
  joinLeague: (leagueId: string, userId: string) =>
    request<void>(`/leagues/${encodeURIComponent(leagueId)}/members/${userId}`, {
      method: 'PUT',
    }),
  leaveLeague: (leagueId: string, userId: string) =>
    request<void>(`/leagues/${encodeURIComponent(leagueId)}/members/${userId}`, {
      method: 'DELETE',
    }),
  getLeagueMembers: (leagueId: string) =>
    request<string[]>(`/leagues/${encodeURIComponent(leagueId)}/members`),
  isLeagueMember: (leagueId: string, userId: string) =>
    request<{ member: boolean }>(
      `/leagues/${encodeURIComponent(leagueId)}/members/${userId}`
    ),
  getUserLeagues: (userId: string) =>
    request<LeagueWithId[]>(`/users/${encodeURIComponent(userId)}/leagues`),
  regenerateInviteCode: (leagueId: string) =>
    request<{ inviteCode: string }>(
      `/leagues/${encodeURIComponent(leagueId)}/invite-code`,
      { method: 'POST' }
    ),
  updateLeague: (
    leagueId: string,
    updates: {
      name?: string;
      description?: string;
      imageURL?: string;
      slug?: string;
      oldSlug?: string;
    }
  ) =>
    request<void>(`/leagues/${encodeURIComponent(leagueId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),
  getLeaguesOwnedByUser: (userId: string) =>
    request<LeagueWithId[]>(`/users/${encodeURIComponent(userId)}/owned-leagues`),
  deleteLeague: (leagueId: string) =>
    request<void>(`/leagues/${encodeURIComponent(leagueId)}`, {
      method: 'DELETE',
    }),

  getScoringSettings: () => request<ScoringSettings>('/settings/scoring'),
  saveScoringSettings: (settings: ScoringSettings, userId: string) =>
    request<void>('/settings/scoring', {
      method: 'PUT',
      body: JSON.stringify({ ...settings, updatedBy: userId }),
    }),
};
