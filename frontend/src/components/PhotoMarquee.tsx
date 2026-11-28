'use client';

import SmoothImage, { cardImageUrl } from '@/components/SmoothImage';

/**
 * Decorative, continuously auto-sliding strip of real salon photos (not
 * stock/fake images) — the images array is built by the caller from data it
 * already fetched, so this never triggers a new network request.
 * Pause-on-hover is pure CSS (.marquee-track:hover in globals.css).
 */
export default function PhotoMarquee({ images }: { images: { src: string; alt: string }[] }) {
  if (images.length === 0) return null;
  const track = [...images, ...images]; // duplicated once for a seamless loop

  return (
    <div className="overflow-hidden">
      <div className="marquee-track flex w-max gap-3">
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
