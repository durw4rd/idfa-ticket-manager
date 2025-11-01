import { Star } from 'lucide-react';
import { Rating } from '@/lib/types';

interface AllRatingsProps {
  ratings: Rating[];
  currentUserEmail?: string | null;
}

export default function AllRatings({ ratings, currentUserEmail }: AllRatingsProps) {
  if (ratings.length === 0) {
    return (
      <p className="text-sm text-idfa-gray-500 italic">No ratings yet</p>
    );
  }

  // Helper to get display name from email
  const getDisplayName = (email: string): string => {
    const username = email.split('@')[0];
    // Capitalize first letter of username
    return username.charAt(0).toUpperCase() + username.slice(1);
  };

  // Sort ratings: current user's rating first, then by date (newest first)
  const sortedRatings = [...ratings].sort((a, b) => {
    // Current user's rating always first
    if (currentUserEmail && a.userEmail === currentUserEmail) return -1;
    if (currentUserEmail && b.userEmail === currentUserEmail) return 1;
    // Otherwise sort by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-4">
      {sortedRatings.map((rating) => {
        const isCurrentUser = currentUserEmail && rating.userEmail === currentUserEmail;
        return (
          <div
            key={rating.id}
            className={`border border-idfa-gray-200 rounded-lg p-4 ${
              isCurrentUser ? 'bg-idfa-gray-50 border-idfa-black' : ''
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className={`font-medium ${isCurrentUser ? 'text-idfa-black' : 'text-idfa-gray-700'}`}>
                  {getDisplayName(rating.userEmail)}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-idfa-gray-500">(You)</span>
                  )}
                </span>
                <div className="flex items-center space-x-1">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-idfa-gray-700">
                    {rating.rating}/10
                  </span>
                </div>
              </div>
              <span className="text-xs text-idfa-gray-500">
                {new Date(rating.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            {rating.comment && (
              <p className="text-sm text-idfa-gray-600 mt-2 italic">
                "{rating.comment}"
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

