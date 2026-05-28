import { createContext } from 'react';
import { type UserData } from '../services';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type AuthFlowResult =
  | { status: 'authenticated' }
  | {
      status: 'verificationRequired';
      email: string;
      verificationCode?: string;
    }
  | {
      status: 'twoFactorRequired';
      userId: string;
      email: string;
      verificationCode?: string;
    };

export interface AuthContextType {
  user: AppUser | null;
  userData: UserData | null;
  loading: boolean;
  signIn: (displayName?: string) => Promise<void>;
  loginWithPassword: (
    identifier: string,
    password: string
  ) => Promise<AuthFlowResult>;
  registerWithPassword: (data: {
    email: string;
    password: string;
    displayName: string;
    userName: string;
  }) => Promise<AuthFlowResult>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (
    email: string
  ) => Promise<{ verificationCode?: string }>;
  verifyTwoFactor: (userId: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserData: (data: UserData | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signIn: async () => {},
  loginWithPassword: async () => ({ status: 'authenticated' }),
  registerWithPassword: async () => ({ status: 'authenticated' }),
  verifyEmail: async () => {},
  resendVerification: async () => ({}),
  verifyTwoFactor: async () => {},
  signOut: async () => {},
  setUserData: () => {},
});
