'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Premium hero: fades and shrinks away as the page scrolls past it, instead
 * of just scrolling off like a plain section. Reads scroll position relative
 * to its own height (not a `position: fixed` pin), so it can't overlap the
 * sticky <Nav> or the sections below.
 */
export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = ref.current;
      if (!el) return;
      const height = el.offsetHeight || 1;
      const p = Math.min(1, Math.max(0, window.scrollY / height));
      setProgress(p);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      ref={ref}
      style={{ opacity: 1 - progress * 0.9, transform: `scale(${1 - progress * 0.06})` }}
    >
      <section className="bg-foreground px-4 pb-6 pt-8 text-white sm:pb-10 sm:pt-14">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold sm:text-4xl">Book your next cut, color or spa day — guaranteed.</h1>
          <p className="mt-2 max-w-md text-sm text-white/70 sm:text-base">
            Verified salons and barbers near you. Transparent pricing, real reviews, no surprises at the counter.
          </p>
          <Link
            href="/search"
            className="mt-5 flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-sm text-muted shadow-premium sm:max-w-sm"
          >
            <span aria-hidden>🔍</span>
            Search salons by name, category or location…
          </Link>
        </div>
      </section>
    </div>
  );
}
