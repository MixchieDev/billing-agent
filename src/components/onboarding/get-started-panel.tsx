'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, LogOut, Loader2 } from 'lucide-react';

interface Props {
  name: string;
  role: string;
  walkthroughAt: string | null;
  completedAt: string | null;
}

/**
 * Hosts the course in an iframe and tracks the two things that open the app:
 * the walkthrough (the course reports it by postMessage when all eight steps
 * are done) and the handbook, which the user confirms they have read.
 */
export function GetStartedPanel({ name, role, walkthroughAt, completedAt }: Props) {
  const router = useRouter();
  const [walkthroughDone, setWalkthroughDone] = useState(!!walkthroughAt);
  const [done, setDone] = useState(!!completedAt);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === 'ADMIN';

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const m = e.data as { type?: string; event?: string } | null;
      if (m?.type !== 'ar-onboarding' || m.event !== 'walkthrough-finished') return;
      setWalkthroughDone(true);
      try {
        await fetch('/api/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'walkthrough' }),
        });
      } catch {
        /* the next visit records it again */
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'complete', acknowledgedHandbook: acknowledged }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not finish onboarding');
      setDone(true);
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish onboarding');
    } finally {
      setBusy(false);
    }
  };

  const canFinish = walkthroughDone && acknowledged && !done && !busy;

  return (
    <div className="flex min-h-screen flex-col bg-muted text-foreground">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Get started</h1>
            <p className="text-sm text-muted-foreground">
              Welcome, {name}.{' '}
              {done || isAdmin
                ? 'You already have access to the app; this course is here whenever you want it.'
                : 'Finish the course below and the rest of the app opens.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(done || isAdmin) && (
              <Button variant="outline" onClick={() => router.push('/dashboard')}>
                Open the app
              </Button>
            )}
            <Button variant="ghost" onClick={() => signOut({ callbackUrl: '/login' })} title="Sign out">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-6 py-5">
        {!done && !isAdmin && (
          <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <div className="flex items-start gap-3">
              {walkthroughDone ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="text-sm">
                <div className="font-medium">1 · Walkthrough</div>
                <div className="text-muted-foreground">
                  {walkthroughDone ? 'All eight steps done.' : 'Work through the eight steps in the practice copy.'}
                </div>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-sm">
              <input
                id="ack-handbook"
                type="checkbox"
                className="mt-1 h-4 w-4 cursor-pointer accent-primary"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                <span className="font-medium">2 · Handbook</span>
                <span className="block text-muted-foreground">
                  I have read the handbook, including the rules that do not bend.
                </span>
              </span>
            </label>
            <div className="flex flex-col items-start gap-1 sm:items-end">
              <Button onClick={finish} disabled={!canFinish}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Finish onboarding
              </Button>
              {error && <span className="text-xs text-destructive">{error}</span>}
            </div>
          </div>
        )}

        {done && !isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <Badge variant="success">Onboarding complete</Badge>
            <span className="text-muted-foreground">You can come back to the course any time from this page.</span>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border bg-card">
          <iframe
            title="Get started course"
            src="/get-started/course"
            className="w-full border-0"
            style={{ height: 'calc(100vh - 230px)', minHeight: 640 }}
          />
        </div>
      </div>
    </div>
  );
}
