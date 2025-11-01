'use client';

import { useState } from 'react';
import { Film } from 'lucide-react';
import FestivalLinkModal from './FestivalLinkModal';

interface FestivalLinkButtonProps {
  url: string;
  movieTitle: string;
}

export default function FestivalLinkButton({
  url,
  movieTitle,
}: FestivalLinkButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors text-sm whitespace-nowrap"
      >
        <Film className="h-4 w-4" />
        <span>View Description</span>
      </button>

      <FestivalLinkModal
        url={url}
        movieTitle={movieTitle}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

