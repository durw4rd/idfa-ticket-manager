'use client';

import { useEffect } from 'react';

/**
 * Client component that detects WebP support and optimizes background images
 * Updates CSS variables to use WebP format when supported by the browser
 */
export default function VenueBackgroundLoader() {
  useEffect(() => {
    // Check if browser supports WebP (cached result)
    const supportsWebP = (): boolean => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    };

    const updateVenueBackgrounds = () => {
      if (!supportsWebP()) return;

      // Find all elements with venue background CSS variable
      const elements = document.querySelectorAll('[style*="--venue-bg-image"]');
      
      elements.forEach((element) => {
        const style = (element as HTMLElement).style;
        const bgImage = style.getPropertyValue('--venue-bg-image');
        
        // If it's a PNG, try to switch to WebP
        if (bgImage && bgImage.includes('.png')) {
          const webpUrl = bgImage.replace('.png', '.webp');
          style.setProperty('--venue-bg-image', `url(${webpUrl})`);
        }
      });
    };

    // Run immediately
    updateVenueBackgrounds();

    // Also observe for dynamically added elements (like when navigating)
    const observer = new MutationObserver(() => {
      updateVenueBackgrounds();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });

    return () => observer.disconnect();
  }, []);

  return null; // This component doesn't render anything
}

