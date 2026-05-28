import React from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { isLocalBackend } from '../config';
import { auth, googleProvider } from '../firebase';
import {
  handleUserLogin,
  isLeagueMember,
  joinLeague,
  type UserData,
} from '../services';
import { localApi, type LocalUser } from '../services/localApi';
import { AuthContext, type AppUser } from './AuthContext';

const JOIN_INTENT_KEY = 'pendingJoinLeague';
const PENDING_LEAGUE_KEY = 'pendingSelectedLeague';
const LOCAL_USER_KEY = 'worldcupLocalUserId';

type JoinIntent = {
  leagueId: string;
  slug: string;
  inviteCode: string;
};

const getJoinIntent = (): JoinIntent | null => {
  const stored = localStorage.getItem(JOIN_INTENT_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as JoinIntent;
  } catch {
    return null;
  }
};

const clearJoinIntent = (): void => {
  localStorage.removeItem(JOIN_INTENT_KEY);
};

export const setPendingSelectedLeague = (leagueId: string): void => {
  localStorage.setItem(PENDING_LEAGUE_KEY, leagueId);
};

export const getPendingSelectedLeague = (): string | null => {
  return localStorage.getItem(PENDING_LEAGUE_KEY);
};

export const clearPendingSelectedLeague = (): void => {
  localStorage.removeItem(PENDING_LEAGUE_KEY);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [userData, setUserData] = React.useState<UserData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const processJoinIntent = React.useCallback(async (currentUser: AppUser) => {
    const joinIntent = getJoinIntent();
    if (!joinIntent) return;

    try {
      const alreadyMember = await isLeagueMember(
        joinIntent.leagueId,
        currentUser.uid
      );
      if (!alreadyMember) {
        await joinLeague(joinIntent.leagueId, currentUser.uid);
      }
      setPendingSelectedLeague(joinIntent.leagueId);
      window.location.href = `/league/${joinIntent.slug}`;
    } catch (err) {
      console.error('Error processing join intent:', err);
    } finally {
      clearJoinIntent();
    }
  }, []);

  const setLocalSession = React.useCallback(
    async (session: { user: LocalUser; userData: UserData }) => {
      localStorage.setItem(LOCAL_USER_KEY, session.user.uid);
      setUser(session.user);
      setUserData(session.userData);
      await processJoinIntent(session.user);
    },
    [processJoinIntent]
  );

  React.useEffect(() => {
    if (isLocalBackend) {
      const userId = localStorage.getItem(LOCAL_USER_KEY);

      if (!userId) {
        setLoading(false);
        return;
      }

      localApi
        .getSession(userId)
        .then(setLocalSession)
        .catch(() => {
          localStorage.removeItem(LOCAL_USER_KEY);
          setUser(null);
          setUserData(null);
        })
        .finally(() => setLoading(false));
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        handleUserLogin(currentUser)
          .then(async (data) => {
            setUserData(data);
            await processJoinIntent(currentUser);
          })
          .catch((error: unknown) => {
            console.error('Error fetching user data:', error);
            setUserData(null);
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [processJoinIntent, setLocalSession]);

  const signIn = React.useCallback(
    async (displayName?: string) => {
      if (isLocalBackend) {
        const name = displayName?.trim() || window.prompt('Display name') || '';
        if (!name.trim()) return;
        const session = await localApi.signIn(name.trim());
        await setLocalSession(session);
        return;
      }

      await signInWithPopup(auth, googleProvider);
    },
    [setLocalSession]
  );

  const signOut = React.useCallback(async () => {
    if (isLocalBackend) {
      localStorage.removeItem(LOCAL_USER_KEY);
      setUser(null);
      setUserData(null);
      return;
    }

    await firebaseSignOut(auth);
  }, []);

  const value = {
    user,
    userData,
    loading,
    signIn,
    signOut,
    setUserData,
  };

  return <AuthContext value={value}>{!loading && children}</AuthContext>;
};
