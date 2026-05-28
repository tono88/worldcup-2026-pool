import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout, Button, Card } from '../components';
import { isLocalBackend } from '../config';
import { useAuth, useToast } from '../hooks';
import { sanitizeUsername } from '../services';

type AuthMode = 'login' | 'register' | 'verify' | 'twoFactor';

export const SignIn = () => {
  const navigate = useNavigate();
  const {
    userData,
    loginWithPassword,
    registerWithPassword,
    verifyEmail,
    resendVerification,
    verifyTwoFactor,
  } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = React.useState<AuthMode>('login');
  const [identifier, setIdentifier] = React.useState('admin');
  const [email, setEmail] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [userName, setUserName] = React.useState('');
  const [password, setPassword] = React.useState('admin');
  const [code, setCode] = React.useState('');
  const [pendingEmail, setPendingEmail] = React.useState('');
  const [pendingUserId, setPendingUserId] = React.useState('');
  const [localCode, setLocalCode] = React.useState<string | undefined>();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (userData?.userName) {
      void navigate(`/${userData.userName}`, { replace: true });
    }
  }, [navigate, userData?.userName]);

  const handleAuthResult = async (
    result: Awaited<ReturnType<typeof loginWithPassword>>
  ) => {
    setLocalCode(undefined);
    setCode('');

    if (result.status === 'verificationRequired') {
      setPendingEmail(result.email);
      setLocalCode(result.verificationCode);
      setMode('verify');
      return;
    }

    if (result.status === 'twoFactorRequired') {
      setPendingEmail(result.email);
      setPendingUserId(result.userId);
      setLocalCode(result.verificationCode);
      setMode('twoFactor');
    }
  };

  const runSubmit = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (event: React.FormEvent) => {
    event.preventDefault();
    void runSubmit(async () => {
      await handleAuthResult(await loginWithPassword(identifier, password));
    });
  };

  const handleRegister = (event: React.FormEvent) => {
    event.preventDefault();
    void runSubmit(async () => {
      await handleAuthResult(
        await registerWithPassword({
          email,
          password,
          displayName,
          userName: sanitizeUsername(userName),
        })
      );
    });
  };

  const handleVerify = (event: React.FormEvent) => {
    event.preventDefault();
    void runSubmit(async () => {
      await verifyEmail(pendingEmail, code);
      showToast('Email verified');
    });
  };

  const handleTwoFactor = (event: React.FormEvent) => {
    event.preventDefault();
    void runSubmit(async () => {
      await verifyTwoFactor(pendingUserId, code);
      showToast('Login verified');
    });
  };

  const handleResend = () => {
    void runSubmit(async () => {
      const result = await resendVerification(pendingEmail);
      setLocalCode(result.verificationCode);
      showToast('Verification code sent');
    });
  };

  const inputClass =
    'w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-colors';
  const labelClass = 'block text-white/70 text-sm mb-2';
  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? 'bg-white/15 text-white'
        : 'text-white/60 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <AppLayout>
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md p-6">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">
            Account Access
          </h1>

          {(mode === 'login' || mode === 'register') && (
            <div className="mb-6 flex gap-2 rounded-xl bg-black/20 p-1">
              <button
                type="button"
                className={tabClass(mode === 'login')}
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                Login
              </button>
              <button
                type="button"
                className={tabClass(mode === 'register')}
                onClick={() => {
                  setMode('register');
                  setPassword('');
                  setError(null);
                }}
              >
                Register
              </button>
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label htmlFor="identifier" className={labelClass}>
                  Email or username
                </label>
                <input
                  id="identifier"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className={inputClass}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className={labelClass}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                  autoComplete="current-password"
                  required
                />
              </div>
              {isLocalBackend && (
                <p className="text-xs text-white/50">
                  Initial admin: username admin, password admin.
                </p>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? 'Checking...' : 'Login'}
              </Button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="flex flex-col gap-4">
              <div>
                <label htmlFor="email" className={labelClass}>
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={inputClass}
                  autoComplete="email"
                  required
                />
              </div>
              <div>
                <label htmlFor="displayName" className={labelClass}>
                  Display name
                </label>
                <input
                  id="displayName"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={inputClass}
                  autoComplete="name"
                  required
                />
              </div>
              <div>
                <label htmlFor="userName" className={labelClass}>
                  Username
                </label>
                <input
                  id="userName"
                  value={userName}
                  onChange={(event) =>
                    setUserName(sanitizeUsername(event.target.value))
                  }
                  className={inputClass}
                  autoComplete="username"
                  minLength={3}
                  required
                />
              </div>
              <div>
                <label htmlFor="newPassword" className={labelClass}>
                  Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
            </form>
          )}

          {mode === 'verify' && (
            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <p className="text-sm text-white/70">
                We sent a verification code to {pendingEmail}.
              </p>
              {localCode && (
                <p className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white">
                  Local verification code: {localCode}
                </p>
              )}
              <div>
                <label htmlFor="code" className={labelClass}>
                  Verification code
                </label>
                <input
                  id="code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={handleResend}>
                  Resend
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading ? 'Verifying...' : 'Verify Email'}
                </Button>
              </div>
            </form>
          )}

          {mode === 'twoFactor' && (
            <form onSubmit={handleTwoFactor} className="flex flex-col gap-4">
              <p className="text-sm text-white/70">
                Enter the login code sent to {pendingEmail}.
              </p>
              {localCode && (
                <p className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white">
                  Local login code: {localCode}
                </p>
              )}
              <div>
                <label htmlFor="twoFactorCode" className={labelClass}>
                  Login code
                </label>
                <input
                  id="twoFactorCode"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading}>
                {loading ? 'Verifying...' : 'Continue'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </AppLayout>
  );
};
