'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/auth-provider';
import { fetchUserProfile, type UserProfile } from '@/lib/profile-api';
import { ApiError } from '@/lib/api-client';
import { DashboardAccessBoundary } from '@/components/auth/dashboard-access-boundary';

export default function ProfilePage() {
  const { logout, clearSelectedBusiness, completeAuthenticatedSession } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchUserProfile()
      .then((data) => {
        if (!cancelled) {
          setProfile(data);
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

  const handleLogout = async () => {
    await logout();
    clearSelectedBusiness();
    router.push('/login');
  };

  if (loading) {
    return (
      <DashboardAccessBoundary>
        <main className="min-h-screen bg-beige text-forest">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
            <div className="mx-auto max-w-2xl">
              <div className="rounded-xl border border-forest/10 bg-white shadow-soft p-8 text-center">
                <div className="animate-pulse flex justify-center">
                  <div className="h-8 w-40 bg-beige-light rounded" />
                </div>
                <div className="mt-4 h-4 w-24 bg-beige-light rounded mx-auto" />
                <div className="mt-2 h-4 w-32 bg-beige-light rounded mx-auto" />
              </div>
            </div>
          </div>
        </main>
      </DashboardAccessBoundary>
    );
  }

  if (!profile) {
    return (
      <DashboardAccessBoundary>
        <main className="min-h-screen bg-beige text-forest">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
            <div className="mx-auto max-w-2xl text-center">
              <Card className="bg-forest text-beige">
                <CardContent className="py-12">
                  <h1 className="text-2xl font-semibold">Unable to load profile</h1>
                  <p className="mt-2 text-beige/80">Please try again or <a href="/login" className="underline hover:text-purple">sign in</a>.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </DashboardAccessBoundary>
    );
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Not available';
    try {
      return new Date(dateString).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <DashboardAccessBoundary>
      <main className="min-h-screen bg-beige text-forest">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
          <div className="mx-auto max-w-2xl">
            <header className="mb-8">
              <h1 className="text-3xl font-semibold text-forest">Profile</h1>
              <p className="mt-1 text-muted">Manage your account settings</p>
            </header>

            {error && (
              <div className="mb-6 rounded-md p-4 text-sm" role="alert" aria-live="polite">
                <div className="rounded-lg border border-forest/15 bg-beige-light p-3 text-sm text-forest">{error}</div>
              </div>
            )}

            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>View your account details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-forest mb-1">Display Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    className="w-full min-h-11 rounded-sm border border-forest/20 bg-beige px-3 py-2 text-sm text-forest/60 focus:outline-none"
                    readOnly
                    disabled
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-forest mb-1">Email</label>
                    <input
                      type="email"
                      value={profile.email ?? ''}
                      className="w-full min-h-11 rounded-sm border border-forest/20 bg-beige px-3 py-2 text-sm text-forest/60 focus:outline-none"
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
                      className="w-full min-h-11 rounded-sm border border-forest/20 bg-beige px-3 py-2 text-sm text-forest/60 focus:outline-none"
                      readOnly
                      disabled
                    />
                    <p className="mt-1 text-xs text-muted">Phone cannot be changed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6 border-forest/20">
              <CardHeader>
                <CardTitle className="text-forest-dark">Danger Zone</CardTitle>
                <CardDescription className="text-muted">Irreversible actions</CardDescription>
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
        </div>
      </main>
    </DashboardAccessBoundary>
  );
}