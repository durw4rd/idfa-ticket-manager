'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Maximize2, Minimize2, X } from 'lucide-react';

interface QRCodeDisplayProps {
  qrCodeUrl: string;
  alt: string;
  ticketLabel?: string;
}

export default function QRCodeDisplay({ qrCodeUrl, alt, ticketLabel }: QRCodeDisplayProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wakeLock, setWakeLock] = useState<WakeLockSentinel | null>(null);
  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Request wake lock when component mounts
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          lock = await (navigator as any).wakeLock.request('screen');
          setWakeLock(lock);
          
          // Handle visibility change - re-request wake lock if page becomes visible again
          const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && lock === null) {
              try {
                lock = await (navigator as any).wakeLock.request('screen');
                setWakeLock(lock);
              } catch (err) {
                console.log('Wake lock could not be re-requested:', err);
              }
            }
          };

          document.addEventListener('visibilitychange', handleVisibilityChange);

          // Handle wake lock release
          lock.addEventListener('release', () => {
            setWakeLock(null);
            lock = null;
          });

          return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
          };
        }
      } catch (err) {
        console.log('Wake lock not supported or failed:', err);
      }
    };

    requestWakeLock();

    // Cleanup on unmount
    return () => {
      if (lock) {
        lock.release().catch(() => {});
      }
    };
  }, []);

  const toggleFullscreen = async () => {
    if (!qrContainerRef.current) return;

    try {
      if (!isFullscreen) {
        // Enter fullscreen
        if (qrContainerRef.current.requestFullscreen) {
          await qrContainerRef.current.requestFullscreen();
        } else if ((qrContainerRef.current as any).webkitRequestFullscreen) {
          await (qrContainerRef.current as any).webkitRequestFullscreen();
        } else if ((qrContainerRef.current as any).mozRequestFullScreen) {
          await (qrContainerRef.current as any).mozRequestFullScreen();
        } else if ((qrContainerRef.current as any).msRequestFullscreen) {
          await (qrContainerRef.current as any).msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.log('Fullscreen error:', err);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement)
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={qrContainerRef}
        className={`relative bg-white p-6 rounded-lg border border-idfa-gray-200 transition-all ${
          isFullscreen
            ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-white'
            : ''
        }`}
      >
        {ticketLabel && !isFullscreen && (
          <h3 className="text-lg font-semibold mb-4">{ticketLabel}</h3>
        )}
        
        <div
          className={`flex justify-center bg-white p-4 rounded ${
            isFullscreen ? 'w-full h-full flex items-center justify-center' : ''
          }`}
        >
          <div className={`relative ${isFullscreen ? 'w-full h-full max-w-4xl max-h-4xl flex items-center justify-center' : ''}`}>
            <Image
              src={qrCodeUrl}
              alt={alt}
              width={isFullscreen ? 600 : 300}
              height={isFullscreen ? 600 : 300}
              className={`max-w-full h-auto ${isFullscreen ? 'max-h-[80vh] w-auto' : ''}`}
              priority
              unoptimized
            />
          </div>
        </div>

        {/* Fullscreen toggle button */}
        <button
          onClick={toggleFullscreen}
          className={`absolute top-4 right-4 p-2 bg-black/80 hover:bg-black text-white rounded-full transition-all z-10 ${
            isFullscreen ? 'bg-black/90' : ''
          }`}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="h-5 w-5" />
          ) : (
            <Maximize2 className="h-5 w-5" />
          )}
        </button>

        {isFullscreen && (
          <div className="absolute top-4 left-4 text-idfa-gray-600 text-sm">
            Tap the button to exit fullscreen
          </div>
        )}
      </div>
    </div>
  );
}
