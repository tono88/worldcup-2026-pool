import { createContext } from 'react';
import { type UserData } from '../services';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AuthContextType {
  user: AppUser | null;
  userData: UserData | null;
  loading: boolean;
  signIn: (displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setUserData: (data: UserData | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  userData: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  setUserData: () => {},
});
