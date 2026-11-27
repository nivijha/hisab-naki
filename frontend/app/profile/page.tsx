'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import {
  fetchUserProfile,
  updateProfile,
  changePassword,
  type UserProfile,
} from '@/lib/profile-api';
import { ApiError } from '@/lib/api-client';

export default function ProfilePage() {
  const { logout, clearSelectedBusiness, completeAuthenticatedSession } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUserProfile()
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
          setName(data.name);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 401) {
            completeAuthenticatedSession();
            router.push('/login');
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load profile');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [completeAuthenticatedSession, router]);

  const validateName = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Name is required';
    if (trimmed.length < 2) return 'Name must be at least 2 characters';
    if (trimmed.length > 80) return 'Name must be 80 characters or fewer';
    return null;
  };

  const validatePassword = (current: string, newPass: string, confirm: string): string | null => {
    if (!current) return 'Current password is required';
    if (!newPass) return 'New password is required';
    if (newPass.length < 8) return 'New password must be at least 8 characters';
    if (newPass !== confirm) return 'Passwords do not match';
    return null;
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setNameError(null);

    const validation = validateName(name);
    if (validation) {
      setNameError(validation);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile({ name: name.trim() });
      setProfile(updated);
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPasswordError(null);

    const validation = validatePassword(currentPassword, newPassword, confirmPassword);
    if (validation) {
      setPasswordError(validation);
      return;
    }

    setChangingPassword(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPasswordError('Current password is incorrect');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to change password');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    clearSelectedBusiness();
    router.push('/login');
  };

  if (loading) {
    return (
      <main className="site-container py-16">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-lg border border-forest/10 bg-white shadow-soft p-8 text-center">
            <div className="animate-pulse flex justify-center">
              <div className="h-8 w-40 bg-beige rounded" />
            </div>
            <div className="mt-4 h-4 w-24 bg-beige-light rounded mx-auto" />
            <div className="mt-2 h-4 w-32 bg-beige-light rounded mx-auto" />
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="site-container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <Card className="bg-forest text-beige">
            <CardContent className="py-12">
              <h1 className="text-2xl font-semibold">Unable to load profile</h1>
              <p className="mt-2 text-beige/80">Please try again or <a href="/login" className="underline hover:text-purple">sign in</a>.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <main className="site-container py-16">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold text-forest">Profile</h1>
          <p className="mt-1 text-muted">Manage your account settings</p>
        </header>

        {(error || success) && (
          <div className="mb-6 rounded-md p-4 text-sm" role="alert" aria-live="polite">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-800">{error}</div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-800">{success}</div>
            )}
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>Update your display name and contact details</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-forest mb-1">
                  Display Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(null);
                  }}
                  className={`w-full rounded-sm border px-3 py-2 text-sm transition-colors ${
                    nameError
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-forest/20 focus:border-forest focus:ring-forest'
                  } bg-white text-forest placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-offset-0`}
                  placeholder="Your name"
                  disabled={saving}
                  autoComplete="name"
                />
                {nameError && (
                  <p className="mt-1 text-sm text-red-600" role="alert">{nameError}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-forest mb-1">Email</label>
                  <input
                    type="email"
                    value={profile.email ?? ''}
                    className="w-full rounded-sm border border-forest/20 bg-beige px-3 py-2 text-sm text-forest/60 focus:outline-none"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-muted">Email cannot be changed</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-forest mb-1">Phone</label>
                  <input
                    type="tel"
                    value={profile.phone ?? ''}
                    className="w-full rounded-sm border border-forest/20 bg-beige px-3 py-2 text-sm text-forest/60 focus:outline-none"
                    readOnly
                    disabled
                  />
                  <p className="mt-1 text-xs text-muted">Phone cannot be changed</p>
                </div>
              </div>

              <div className="pt-4 border-t border-forest/10">
                <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password for better security</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-6">
              <div>
                <label htmlFor="currentPassword" className="block text-sm font-medium text-forest mb-1">
                  Current Password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordError(null);
                  }}
                  className={`w-full rounded-sm border px-3 py-2 text-sm transition-colors ${
                    passwordError
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                      : 'border-forest/20 focus:border-forest focus:ring-forest'
                  } bg-white text-forest focus:outline-none focus:ring-2 focus:ring-offset-0`}
                  autoComplete="current-password"
                  disabled={changingPassword}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-forest mb-1">
                    New Password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    className={`w-full rounded-sm border px-3 py-2 text-sm transition-colors ${
                      passwordError
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : 'border-forest/20 focus:border-forest focus:ring-forest'
                    } bg-white text-forest focus:outline-none focus:ring-2 focus:ring-offset-0`}
                    autoComplete="new-password"
                    disabled={changingPassword}
                    minLength={8}
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-forest mb-1">
                    Confirm New Password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    className={`w-full rounded-sm border px-3 py-2 text-sm transition-colors ${
                      passwordError
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : 'border-forest/20 focus:border-forest focus:ring-forest'
                    } bg-white text-forest focus:outline-none focus:ring-2 focus:ring-offset-0`}
                    autoComplete="new-password"
                    disabled={changingPassword}
                  />
                </div>
              </div>

              {passwordError && (
                <p className="text-sm text-red-600" role="alert">{passwordError}</p>
              )}

              <div className="pt-4 border-t border-forest/10">
                <Button type="submit" disabled={changingPassword} className="w-full sm:w-auto">
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="mb-6 border-red-100">
          <CardHeader>
            <CardTitle className="text-red-700">Danger Zone</CardTitle>
            <CardDescription className="text-red-600">Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={handleLogout}
              className="w-full sm:w-auto"
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Read-only account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-2 sm:grid-cols-2">
              <dt className="text-muted">User ID</dt>
              <dd className="font-mono text-forest/80 break-all">{profile.id}</dd>
              <dt className="text-muted">Member since</dt>
              <dd className="text-forest/80">{formatDate(profile.createdAt ?? profile.phoneVerifiedAt)}</dd>
              <dt className="text-muted">Phone verified</dt>
              <dd className="text-forest/80">
                {profile.phoneVerifiedAt
                  ? formatDate(profile.phoneVerifiedAt)
                  : 'Not verified'}
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}