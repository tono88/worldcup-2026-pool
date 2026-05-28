import React from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
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
import { AuthContext, type AppUser, type AuthFlowResult } from './AuthContext';

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
    async () => {
      if (isLocalBackend) {
        window.location.href = '/signin';
        return;
      }

      await signInWithPopup(auth, googleProvider);
    },
    []
  );

  const finishLocalAuth = React.useCallback(
    async (result: Awaited<ReturnType<typeof localApi.login>>) => {
      if (result.status === 'authenticated') {
        await setLocalSession({
          user: result.user,
          userData: result.userData,
        });
        return { status: 'authenticated' } satisfies AuthFlowResult;
      }

      return result satisfies AuthFlowResult;
    },
    [setLocalSession]
  );

  const loginWithPassword = React.useCallback(
    async (
      identifier: string,
      password: string
    ): Promise<AuthFlowResult> => {
      if (isLocalBackend) {
        return finishLocalAuth(await localApi.login(identifier, password));
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        identifier,
        password
      );
      if (!credential.user.emailVerified) {
        await sendEmailVerification(credential.user);
        await firebaseSignOut(auth);
        return {
          status: 'verificationRequired',
          email: credential.user.email || identifier,
        };
      }
      return { status: 'authenticated' };
    },
    [finishLocalAuth]
  );

  const registerWithPassword = React.useCallback(
    async (data: {
      email: string;
      password: string;
      displayName: string;
      userName: string;
    }): Promise<AuthFlowResult> => {
      if (isLocalBackend) {
        return finishLocalAuth(await localApi.register(data));
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      await updateProfile(credential.user, { displayName: data.displayName });
      await sendEmailVerification(credential.user);
      await firebaseSignOut(auth);
      return { status: 'verificationRequired', email: data.email };
    },
    [finishLocalAuth]
  );

  const verifyEmail = React.useCallback(
    async (email: string, code: string) => {
      if (!isLocalBackend) {
        throw new Error('Use the verification link sent by Firebase');
      }
      await setLocalSession(await localApi.verifyEmail(email, code));
    },
    [setLocalSession]
  );

  const resendVerification = React.useCallback(async (email: string) => {
    if (!isLocalBackend) {
      throw new Error('Try logging in again to resend the verification email');
    }
    return localApi.resendVerification(email);
  }, []);

  const verifyTwoFactor = React.useCallback(
    async (userId: string, code: string) => {
      if (!isLocalBackend) {
        throw new Error('Two-factor verification is only available locally');
      }
      await setLocalSession(await localApi.verifyTwoFactor(userId, code));
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
    loginWithPassword,
    registerWithPassword,
    verifyEmail,
    resendVerification,
    verifyTwoFactor,
    signOut,
    setUserData,
  };

  return <AuthContext value={value}>{!loading && children}</AuthContext>;
};
