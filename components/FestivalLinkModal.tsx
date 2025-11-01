'use client';

import { useEffect } from 'react';
import { X, ExternalLink } from 'lucide-react';

interface FestivalLinkModalProps {
  url: string;
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function FestivalLinkModal({
  url,
  movieTitle,
  isOpen,
  onClose,
}: FestivalLinkModalProps) {
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75 p-4 pt-20"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl h-[calc(100vh-6rem)] bg-white rounded-lg shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-idfa-gray-200 flex-shrink-0">
          <h2 className="text-xl font-bold">{movieTitle}</h2>
          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-idfa-black text-white font-medium rounded hover:bg-idfa-gray-800 transition-colors text-sm"
              onClick={(e) => {
                e.stopPropagation();
                // Close modal when opening in new tab
                setTimeout(onClose, 100);
              }}
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open in New Tab</span>
            </a>
            <button
              onClick={onClose}
              className="p-2 hover:bg-idfa-gray-100 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 overflow-hidden relative">
          <iframe
            src={url}
            className="w-full h-full border-0"
            title={`Festival page for ${movieTitle}`}
            allow="fullscreen"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      </div>
    </div>
  );
}

