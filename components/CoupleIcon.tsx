/**
 * A cheesy romantic icon showing two people with a heart
 * For screenings with exactly 2 tickets - date night! 💕
 */
import { Heart, Users } from 'lucide-react';

export default function CoupleIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className || ''}`} aria-label="Date night">
      {/* Two people icon */}
      <Users className="w-5 h-5 text-idfa-gray-700" strokeWidth={1.5} />
      
      {/* Heart next to it with subtle animation */}
      <Heart 
        className="w-4 h-4 text-pink-500 fill-pink-400 ml-1 animate-pulse" 
        strokeWidth={1.5}
      />
    </div>
  );
}

