'use client';

import { useSession, signOut } from 'next-auth/react';
import { LogOut, User } from 'lucide-react';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center space-x-2 text-idfa-gray-600">
        <div className="h-4 w-4 border-2 border-idfa-gray-300 border-t-idfa-black rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null; // Don't show anything if not logged in (middleware will redirect)
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2 text-sm text-idfa-gray-700">
        <User className="h-4 w-4" />
        <span className="hidden sm:inline">{session.user?.name || session.user?.email}</span>
        <span className="sm:hidden">{session.user?.email?.split('@')[0]}</span>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center space-x-2 px-4 py-2 text-sm text-idfa-gray-700 hover:text-idfa-black hover:bg-idfa-gray-50 rounded transition-colors"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}

