import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppLayout,
  Card,
  Button,
  LinkButton,
  ProfilePicture,
  useConfirm,
} from '../components';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import {
  checkUsernameAvailable,
  deleteUserAccount,
  getLeaguesOwnedByUser,
  isReservedUsername,
  sanitizeUsername,
  updateUserProfile,
  uploadProfilePicture,
} from '../services';

export const EditProfile = () => {
  const navigate = useNavigate();
  const { user, userData, setUserData, signOut } = useAuth();
  const { showToast } = useToast();
  const { showConfirm, ConfirmDialogComponent } = useConfirm();
  const [userName, setUserName] = React.useState(userData?.userName ?? '');
  const [displayName, setDisplayName] = React.useState(
    userData?.displayName ?? ''
  );
  const [twoFactorEnabled, setTwoFactorEnabled] = React.useState(
    userData?.twoFactorEnabled ?? false
  );
  const [newPassword, setNewPassword] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = React.useState<
    'idle' | 'checking' | 'available' | 'taken' | 'reserved'
  >('idle');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const originalUserName = userData?.userName ?? '';

  // Sync form state when userData changes (e.g., new user signs in)
  React.useEffect(() => {
    setUserName(userData?.userName ?? '');
    setDisplayName(userData?.displayName ?? '');
    setTwoFactorEnabled(userData?.twoFactorEnabled ?? false);
  }, [userData?.userName, userData?.displayName, userData?.twoFactorEnabled]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  const handleRemovePhoto = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Debounced username availability check
  React.useEffect(() => {
    if (userName === originalUserName) {
      setUsernameStatus('idle');
      return;
    }

    if (userName.length < 3) {
      setUsernameStatus('idle');
      return;
    }

    // Check reserved immediately (no network call needed)
    if (isReservedUsername(userName)) {
      setUsernameStatus('reserved');
      return;
    }

    setUsernameStatus('checking');

    const timeoutId = setTimeout(() => {
      checkUsernameAvailable(userName, user?.uid)
        .then((available) => {
          setUsernameStatus(available ? 'available' : 'taken');
        })
        .catch(() => {
          setUsernameStatus('idle');
        });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [userName, originalUserName, user?.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (usernameStatus === 'taken' || usernameStatus === 'reserved') return;

    // Sanitize username before saving (removes trailing dots)
    const finalUserName = sanitizeUsername(userName);

    setSaving(true);
    setError(null);

    try {
      let newPhotoURL = userData?.photoURL ?? '';

      // Upload new profile picture if selected
      if (selectedFile) {
        newPhotoURL = await uploadProfilePicture(user.uid, selectedFile);
      }

      await updateUserProfile(
        user.uid,
        {
          userName: finalUserName,
          displayName,
          twoFactorEnabled,
          password: newPassword || undefined,
        },
        originalUserName
      );

      if (userData) {
        setUserData({
          ...userData,
          userName: finalUserName,
          displayName,
          photoURL: newPhotoURL,
          twoFactorEnabled,
        });
      }
      setNewPassword('');
      void navigate(`/${finalUserName}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !userData) return;

    // Check if user owns any leagues
    const ownedLeagues = await getLeaguesOwnedByUser(user.uid);
    if (ownedLeagues.length > 0) {
      const leagueNames = ownedLeagues.map((l) => l.name).join(', ');
      showToast(
        `You must delete or transfer ownership of your leagues first: ${leagueNames}`,
        'error'
      );
      return;
    }

    const confirmed = await showConfirm({
      title: 'Delete Account',
      message:
        'Are you sure you want to permanently delete your account? This will remove all your data, predictions, and league memberships. This action cannot be undone.',
      confirmText: 'Delete Account',
    });

    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteUserAccount(user.uid, userData.userName);
      await signOut();
      showToast('Account deleted successfully', 'success');
      void navigate('/', { replace: true });
    } catch (err) {
      console.error('Error deleting account:', err);
      showToast('Failed to delete account', 'error');
      setDeleting(false);
    }
  };

  const isFormValid =
    userName.length >= 3 &&
    (newPassword.length === 0 || newPassword.length >= 6) &&
    usernameStatus !== 'taken' &&
    usernameStatus !== 'reserved' &&
    usernameStatus !== 'checking';

  const inputClass =
    'w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-colors';
  const labelClass = 'block text-white/70 text-sm mb-2';

  return (
    <AppLayout>
      <div className="md:min-h-screen flex items-center justify-center px-4 py-8">
        <div className="max-w-md">
          <Card className="p-6">
            <h1 className="text-2xl font-bold text-white mb-6 text-center">
              Edit Profile
            </h1>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="flex flex-col gap-4"
            >
              {/* Profile Picture */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <ProfilePicture
                    src={previewUrl ?? userData?.photoURL}
                    name={userData?.displayName}
                    size="xl"
                    className="border-2 border-white/20"
                  />
                  {previewUrl && (
                    <Button
                      onClick={handleRemovePhoto}
                      className="absolute px-0! -top-1 -right-1 rounded-full w-8 h-8 backdrop-blur-lg border-none opacity-70 hover:opacity-100"
                      title="Undo"
                    >
                      <span className="text-sm">↩️</span>
                    </Button>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className="text-sm text-white/60 hover:text-white cursor-pointer transition-colors"
                >
                  Change Photo
                </label>
              </div>

              <div>
                <label htmlFor="displayName" className={labelClass}>
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className={inputClass}
                  required
                />
              </div>

              <div>
                <label htmlFor="userName" className={labelClass}>
                  Username
                </label>
                <div className="relative">
                  <input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) =>
                      setUserName(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9._-]/g, '')
                          .replace(/^\./, '')
                          .replace(/\.{2,}/g, '.')
                      )
                    }
                    onBlur={(e) =>
                      setUserName(sanitizeUsername(e.target.value))
                    }
                    placeholder="your-username"
                    className={`${inputClass} ${usernameStatus === 'taken' || usernameStatus === 'reserved' ? 'border-red-400' : usernameStatus === 'available' ? 'border-green-400' : ''}`}
                    required
                    minLength={3}
                  />
                  {usernameStatus === 'checking' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 text-sm">
                      Checking...
                    </span>
                  )}
                  {usernameStatus === 'available' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-sm">
                      ✓ Available
                    </span>
                  )}
                  {usernameStatus === 'taken' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">
                      ✗ Taken
                    </span>
                  )}
                  {usernameStatus === 'reserved' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">
                      ✗ Reserved
                    </span>
                  )}
                </div>
                <p className="text-white/50 text-xs mt-1">
                  Letters, numbers, periods, hyphens, and underscores only.
                </p>
              </div>

              <div>
                <label htmlFor="newPassword" className={labelClass}>
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className={inputClass}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-white/80">
                <input
                  type="checkbox"
                  checked={twoFactorEnabled}
                  onChange={(event) =>
                    setTwoFactorEnabled(event.target.checked)
                  }
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold text-white">
                    Require login code
                  </span>
                  <span className="text-sm text-white/55">
                    Send a second verification code when this account logs in.
                  </span>
                </span>
              </label>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <div className="flex gap-3 mt-4">
                <LinkButton
                  to={`/${userData?.userName ?? ''}`}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </LinkButton>
                <Button
                  type="submit"
                  disabled={saving || !isFormValid}
                  className="flex-1"
                >
                  {saving ? (
                    'Saving...'
                  ) : (
                    <>
                      <span className="sm:hidden">Save</span>
                      <span className="hidden sm:inline">Save Changes</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Delete Account */}
              <div className="mt-6 pt-6 border-t border-white/10 text-center">
                <button
                  type="button"
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleting}
                  className="text-red-500/70 hover:text-red-400 text-sm transition-colors disabled:opacity-50 hover:cursor-pointer"
                >
                  {deleting ? 'Deleting...' : 'Delete my account'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      </div>
      {ConfirmDialogComponent}
    </AppLayout>
  );
};
