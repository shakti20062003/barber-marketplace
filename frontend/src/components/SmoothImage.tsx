'use client';

/* eslint-disable @next/next/no-img-element */
import { useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from 'react';

/**
 * <img> that never "pops": if the photo is already in the browser's memory
 * it shows immediately (checked before paint); otherwise it fades in once
 * decoded instead of appearing abruptly. Used for photo grids that re-mount
 * when switching tabs (Style Finder, salon cards, bookings).
 */
export default function SmoothImage({ className = '', onLoad, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);

  useLayoutEffect(() => {
    // Cached image: mark loaded before the first paint, so there's no fade at all.
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [props.src]);

  return (
    <img
      ref={ref}
      decoding="async"
      alt={alt}
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={`${className} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

/**
 * Unsplash/imgix URLs accept size params — ask for what a phone card needs
 * (≈2× the rendered size) instead of the full 600×750 seed size, so photos
 * download and decode much faster. Other URLs are returned unchanged.
 */
export function cardImageUrl(url: string, width = 360, height = 450): string {
  if (!/^https:\/\/images\.unsplash\.com\//.test(url)) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('w', String(width));
    u.searchParams.set('h', String(height));
    u.searchParams.set('fit', 'crop');
    u.searchParams.set('auto', 'format'); // WebP/AVIF when the phone supports it
    return u.toString();
  } catch {
    return url;
  }
}
