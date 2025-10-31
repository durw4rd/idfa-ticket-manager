'use client';

import { signIn, getSession } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if user is already logged in
    getSession().then((session) => {
      if (session) {
        const callbackUrl = searchParams.get('callbackUrl') || '/screenings';
        router.push(callbackUrl);
      }
    });
  }, [router, searchParams]);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const callbackUrl = searchParams.get('callbackUrl') || '/screenings';
      const result = await signIn('google', {
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        // Handle sign-in error
        if (result.error === 'AccessDenied') {
          setError('Your email is not authorized to access this application. Please contact the administrator.');
        } else {
          setError('An error occurred during sign-in. Please try again.');
        }
        setLoading(false);
      } else if (result?.url) {
        // Success - NextAuth will handle the redirect
        router.push(result.url);
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-idfa-gray-50">
      <div className="max-w-md w-full px-6 py-8 bg-white rounded-lg shadow-lg border border-idfa-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">IDFA</h1>
          <p className="text-idfa-gray-600">Ticket Manager</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-3 px-6 py-3 bg-white border-2 border-idfa-gray-300 rounded-lg hover:border-idfa-black hover:bg-idfa-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
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
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          <p className="text-xs text-center text-idfa-gray-500 mt-6">
            Only authorized users can access this application
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-idfa-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-idfa-black" />
          <p className="text-idfa-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

