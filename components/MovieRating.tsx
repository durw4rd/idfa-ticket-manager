'use client';

import { useState, useEffect } from 'react';
import { Star, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Rating } from '@/lib/types';

interface MovieRatingProps {
  movieTitle: string;
  initialRating?: Rating | null;
  onRatingChange?: (rating: Rating) => void;
}

const MAX_COMMENT_LENGTH = 500;

export default function MovieRating({
  movieTitle,
  initialRating,
  onRatingChange,
}: MovieRatingProps) {
  const [selectedRating, setSelectedRating] = useState<number | null>(
    initialRating?.rating || null
  );
  const [comment, setComment] = useState<string>(initialRating?.comment || '');
  const [isCommentExpanded, setIsCommentExpanded] = useState<boolean>(
    !!initialRating?.comment
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Update local state when initialRating changes
  useEffect(() => {
    if (initialRating) {
      setSelectedRating(initialRating.rating);
      setComment(initialRating.comment || '');
      setIsCommentExpanded(!!initialRating.comment);
    }
  }, [initialRating]);

  const handleStarClick = (rating: number) => {
    setSelectedRating(rating);
    setError(null);
    // Auto-save on star click
    handleSaveRating(rating, comment);
  };

  const handleSaveRating = async (rating: number | null, commentText: string) => {
    if (!rating) {
      setError('Please select a rating');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          act: movieTitle,
          rating,
          comment: commentText.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save rating');
      }

      const data = await response.json();
      setSelectedRating(rating);
      setComment(commentText.trim());
      setSuccessMessage('Rating saved!');
      setTimeout(() => setSuccessMessage(null), 3000);

      if (onRatingChange) {
        onRatingChange(data.rating);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rating');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommentSave = () => {
    if (selectedRating) {
      handleSaveRating(selectedRating, comment);
    }
  };

  const handleDeleteRating = async () => {
    if (!initialRating) return;

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/ratings', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          act: movieTitle,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete rating');
      }

      setSelectedRating(null);
      setComment('');
      setIsCommentExpanded(false);
      setSuccessMessage('Rating deleted');
      setTimeout(() => setSuccessMessage(null), 3000);

      // Reload the page to refresh the rating state
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rating');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStar = (starNumber: number) => {
    const isFilled = selectedRating !== null && starNumber <= selectedRating;
    return (
      <button
        key={starNumber}
        type="button"
        onClick={() => handleStarClick(starNumber)}
        disabled={isLoading}
        className={`
          focus:outline-none focus:ring-2 focus:ring-idfa-black focus:ring-offset-2 rounded flex-shrink-0
          transition-transform hover:scale-110 active:scale-95
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        aria-label={`Rate ${starNumber} out of 10`}
      >
        <Star
          className={`w-7 h-7 sm:w-8 sm:h-8 ${
            isFilled
              ? 'fill-yellow-400 text-yellow-400'
              : 'fill-none text-idfa-gray-300 hover:text-yellow-300'
          } transition-colors`}
          strokeWidth={1.5}
        />
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Star Rating */}
      <div>
        <label className="block text-sm font-medium text-idfa-gray-700 mb-2">
          Rate this movie
        </label>
        <div className="space-y-2">
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto pb-2 -mx-1 px-1">
            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((num) =>
                renderStar(num)
              )}
            </div>
          </div>
          {selectedRating && (
            <div className="text-sm text-idfa-gray-600 font-medium">
              {selectedRating}/10
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Comment Section */}
      <div>
        <button
          type="button"
          onClick={() => setIsCommentExpanded(!isCommentExpanded)}
          className="flex items-center space-x-2 text-sm text-idfa-gray-600 hover:text-idfa-black transition-colors"
        >
          {isCommentExpanded ? (
            <>
              <ChevronUp className="h-4 w-4" />
              <span>Hide comment</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              <span>Add a comment (optional)</span>
            </>
          )}
        </button>

        {isCommentExpanded && (
          <div className="mt-2 space-y-2">
            <textarea
              value={comment}
              onChange={(e) => {
                if (e.target.value.length <= MAX_COMMENT_LENGTH) {
                  setComment(e.target.value);
                }
              }}
              placeholder="Share your thoughts about this movie..."
              rows={3}
              className="w-full px-3 py-2 border border-idfa-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-idfa-black focus:border-transparent resize-none"
              disabled={isLoading}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-idfa-gray-500">
                {comment.length}/{MAX_COMMENT_LENGTH} characters
              </span>
              <button
                type="button"
                onClick={handleCommentSave}
                disabled={isLoading || !selectedRating}
                className="px-3 py-1 text-sm bg-idfa-black text-white rounded hover:bg-idfa-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Saving...' : 'Save Comment'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Current Rating Display and Delete Button */}
      {initialRating && (
        <div className="flex items-start justify-between">
          <div className="text-sm text-idfa-gray-600 flex-1">
            <p>
              Your rating: <span className="font-medium">{initialRating.rating}/10</span>
            </p>
            {initialRating.comment && !isCommentExpanded && (
              <p className="mt-1 italic">"{initialRating.comment}"</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleDeleteRating}
            disabled={isLoading}
            className="ml-4 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1.5 flex-shrink-0"
            title="Delete rating"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="text-sm text-green-600 bg-green-50 px-3 py-2 rounded">
          {successMessage}
        </div>
      )}
    </div>
  );
}

