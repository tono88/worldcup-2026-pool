import React from 'react';
import { AppLayout, Button, Card } from '../components';
import { useAuth, useToast } from '../hooks';
import { getAdminUsers, updateUserRole, type UserWithId } from '../services';

export const Admin = () => {
  const { user, userData } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = React.useState<UserWithId[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isAdmin = Boolean(userData?.admin);

  const loadUsers = React.useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      setUsers(await getAdminUsers(user.uid));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user]);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (targetUserId: string, role: 'admin' | 'user') => {
    if (!user) return;
    setSavingUserId(targetUserId);
    setError(null);
    try {
      setUsers(await updateUserRole(user.uid, targetUserId, role));
      showToast('Role updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <AppLayout>
      <div className="pt-8 px-4 pb-8 max-w-4xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin</h1>
            <p className="mt-1 text-sm text-white/60">
              Manage the single admin role and player access.
            </p>
          </div>
          <Button type="button" onClick={() => void loadUsers()} disabled={loading}>
            Refresh
          </Button>
        </div>

        {!isAdmin && (
          <Card className="p-6 text-white/70">
            Admin access is required.
          </Card>
        )}

        {isAdmin && (
          <Card className="overflow-hidden">
            {loading ? (
              <div className="p-6 text-white/70">Loading users...</div>
            ) : (
              <div className="divide-y divide-white/10">
                {users.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 p-4 text-white md:grid-cols-[1fr_auto_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{item.displayName}</span>
                        <span className="text-xs text-white/50">
                          @{item.userName}
                        </span>
                        {item.admin && (
                          <span className="rounded-full border border-emerald-400/40 px-2 py-0.5 text-xs text-emerald-200">
                            admin
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-white/55">
                        {item.email || 'No email'} ·{' '}
                        {item.emailVerified ? 'verified' : 'not verified'} ·{' '}
                        {item.twoFactorEnabled ? '2FA on' : '2FA off'}
                      </div>
                    </div>

                    <select
                      value={item.admin ? 'admin' : 'user'}
                      onChange={(event) =>
                        void handleRoleChange(
                          item.id,
                          event.target.value as 'admin' | 'user'
                        )
                      }
                      disabled={savingUserId === item.id}
                      className="h-10 rounded-lg border border-white/20 bg-black/40 px-3 text-white"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>

                    <div className="text-sm text-white/50 md:text-right">
                      {item.score} pts
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
      </div>
    </AppLayout>
  );
};
