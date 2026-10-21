'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { isOptimizableImage } from '../../image-config.mjs';

// Preserve administrator-configured image hosts. Opt known origins into the
// framework optimizer; unknown remote hosts stay browser-loaded, never proxied.
export default function OptimizedImage({ src, alt, width = 640, height = 480, sizes = '(max-width: 600px) 40vw, 240px', eager = false, onError, ...props }) {
  const failedSources = useRef(new Set());
  const fallbackSource = '/brand/image-unavailable.svg';
  const unavailableAlt = `${alt || 'Product'} — image unavailable`;
  const imageAlt = src === fallbackSource ? unavailableAlt : alt;
  const handleError = event => {
    const failed = event.currentTarget.currentSrc || event.currentTarget.src;
    if (failedSources.current.has(failed)) return;
    failedSources.current.add(failed);
    const previousSource = event.currentTarget.getAttribute('src');
    // Keep existing caller-provided fallback handlers effective when a
    // responsive srcset would otherwise override the replacement src.
    event.currentTarget.removeAttribute('srcset');
    event.currentTarget.removeAttribute('sizes');
    onError?.(event);
    if (!onError || event.currentTarget.getAttribute('src') === previousSource || failedSources.current.size > 1) {
      event.currentTarget.src = fallbackSource;
      event.currentTarget.alt = unavailableAlt;
    }
  };
  if (isOptimizableImage(src)) return <Image src={src} alt={imageAlt} width={width} height={height} sizes={sizes} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : 'auto'} onError={handleError} {...props} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={imageAlt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={handleError} {...props} />;
}
