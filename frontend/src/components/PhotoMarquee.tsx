'use client';

import { useEffect, useRef } from 'react';
import SmoothImage, { cardImageUrl } from '@/components/SmoothImage';

/**
 * A real, manually-scrollable strip of salon photos (not a decorative-only
 * CSS marquee) that also auto-advances slowly on its own — auto-advance
 * pauses the moment a visitor touches/drags/hovers it, and resumes after
 * they let go, so manual scrolling always wins over the automatic motion.
 */
export default function PhotoMarquee({ images, label }: { images: { src: string; alt: string }[]; label?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf: number;
    const step = () => {
      if (!pausedRef.current && el.scrollWidth > el.clientWidth) {
        const half = el.scrollWidth / 2;
        el.scrollLeft += 0.4;
        if (el.scrollLeft >= half) el.scrollLeft -= half;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (images.length === 0) return null;
  const track = [...images, ...images]; // duplicated once for a seamless loop

  const pause = () => {
    pausedRef.current = true;
  };
  const resume = () => {
    pausedRef.current = false;
  };

  return (
    <div>
      {label && <h2 className="mb-3 px-4 text-lg font-semibold">{label}</h2>}
      <div
        ref={trackRef}
        className="scrollbar-hide flex gap-3 overflow-x-auto px-4"
        onPointerDown={pause}
        onPointerUp={resume}
        onPointerLeave={resume}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onTouchStart={pause}
        onTouchEnd={resume}
      >
        {track.map((img, i) => (
          <div
            key={`${img.src}-${i}`}
            className="h-40 w-56 shrink-0 overflow-hidden rounded-2xl shadow-premium sm:h-48 sm:w-64"
          >
            <SmoothImage
              src={cardImageUrl(img.src, 320, 240)}
              alt={img.alt}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
