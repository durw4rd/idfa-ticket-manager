import { Star } from 'lucide-react';

interface AverageRatingProps {
  average: number;
  count: number;
  className?: string;
}

export default function AverageRating({
  average,
  count,
  className = '',
}: AverageRatingProps) {
  // Round to 1 decimal place
  const roundedAverage = Math.round(average * 10) / 10;

  return (
    <div className={`flex items-center space-x-1 ${className}`}>
      <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
      <span className="text-xs text-idfa-gray-600 font-medium">
        {roundedAverage}
      </span>
      <span className="text-xs text-idfa-gray-500">
        ({count} {count === 1 ? 'rating' : 'ratings'})
      </span>
    </div>
  );
}

