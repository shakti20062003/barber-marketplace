import Link from 'next/link';
import type { BusinessCard as BusinessCardType } from '@/lib/types';
import { formatHhmm } from '@/lib/image';

const BADGE_STYLE: Record<string, { label: string; className: string }> = {
  VERIFIED: { label: '✓ Verified', className: 'bg-accent-tint text-accent' },
  TOP_RATED: { label: '★ Top Rated', className: 'bg-amber-50 text-amber-700' },
  PREMIUM_PARTNER: { label: 'Premium', className: 'bg-violet-50 text-violet-700' },
  FEATURED: { label: 'Featured', className: 'bg-brand-tint text-brand-dark' },
};

function openLabel(b: BusinessCardType): string {
  if (b.openNow) return 'Open';
  return b.todayHours ? 'Closed now' : 'Closed today';
}

export default function BusinessCard({ business }: { business: BusinessCardType }) {
  return (
    <Link
      href={`/salons/${business.id}`}
      className="flex gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm transition active:scale-[0.99] sm:p-4"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-neutral-100 sm:h-28 sm:w-28">
        {business.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.image} alt={business.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted">No photo</div>
        )}
        <span
          className={`absolute bottom-1 left-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${
            business.openNow ? 'bg-emerald-600' : 'bg-neutral-500'
          }`}
        >
          {openLabel(business)}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <h3 className="truncate font-semibold text-foreground">{business.name}</h3>
          <p className="text-sm text-muted">{business.category}</p>
          {!business.openNow && business.todayHours && (
            <p className="text-xs text-muted">Today {formatHhmm(business.todayHours.open)}–{formatHhmm(business.todayHours.close)}</p>
          )}
          {business.trustBadges.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {business.trustBadges.slice(0, 2).map((badge) => {
                const style = BADGE_STYLE[badge] ?? { label: badge, className: 'bg-neutral-100 text-muted' };
                return (
                  <span key={badge} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${style.className}`}>
                    {style.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
            ★ {business.rating || 'New'}
            {business.reviewCount > 0 && <span className="text-amber-600/70">({business.reviewCount})</span>}
          </span>
          <span className="text-muted">{business.distanceKm} km</span>
        </div>
        <p className="mt-1 text-sm font-semibold text-foreground">
          {business.startingPrice != null ? `From ₹${business.startingPrice}` : 'See services'}
        </p>
      </div>
    </Link>
  );
}
