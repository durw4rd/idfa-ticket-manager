'use client';

import { signIn, getSession } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import IDFALogo from '@/components/IDFALogo';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Field';

// What NextAuth's ?error= codes mean for someone signing in (it sends them back here)
function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === 'AccessDenied') {
    return "This Google account isn't invited yet. Ask someone in your crew to invite you.";
  }
  return "Sign-in didn't work. Please try again.";
}

/** Only paths on this site: anything else (another origin, "//host") goes to the agenda */
function safeCallbackUrl(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/screenings';
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = safeCallbackUrl(searchParams.get('callbackUrl'));
  const error = signInErrorMessage(searchParams.get('error'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Already signed in: go where they were heading
    getSession().then((session) => {
      if (session) router.replace(callbackUrl);
    });
  }, [router, callbackUrl]);

  // Coming back with the browser's Back button restores this page as it was left, spinner and all
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => event.persisted && setLoading(false);
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  // Google sign-in always leaves the page (NextAuth ignores redirect: false for OAuth), and a refused
  // or failed sign-in comes back here with ?error=, which is shown above the button
  const handleSignIn = () => {
    setLoading(true);
    signIn('google', { callbackUrl });
  };

  return (
    <div className="flex min-h-dvh flex-col justify-between py-[max(3rem,env(safe-area-inset-top))]">
      <div className="pt-10">
        <IDFALogo className="h-12 w-auto" />
        <h1 className="mt-10 font-display text-xl text-balance">
          Your festival agenda, tickets and ratings, shared with your crew.
        </h1>
      </div>

      <div className="space-y-4 pb-6">
        {error && <Notice>{error}</Notice>}
        <Button
          variant="secondary"
          className="w-full"
          onClick={handleSignIn}
          disabled={loading}
          icon={
            loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
            )
          }
        >
          {loading ? 'Signing in…' : 'Sign in with Google'}
        </Button>
        <p className="text-center text-xs text-ink-3">For invited crew members only</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-ink-3" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

