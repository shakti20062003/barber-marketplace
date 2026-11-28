import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { BusinessDetail } from '@/lib/types';
import { directionsUrl, formatHhmm } from '@/lib/image';
import HoursList from '@/components/HoursList';
import SmoothImage from '@/components/SmoothImage';

const BADGE_LABEL: Record<string, string> = {
  VERIFIED: '✓ Verified',
  TOP_RATED: '★ Top Rated',
  PREMIUM_PARTNER: 'Premium',
  FEATURED: 'Featured',
};

async function getBusiness(id: string): Promise<BusinessDetail> {
  try {
    return await apiFetch<BusinessDetail>(`/businesses/${id}`, { cache: 'no-store' });
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }
}

// SSR per §6 NFR (SEO-critical salon profile pages).
export async function generateMetadata(props: PageProps<'/salons/[id]'>) {
  const { id } = await props.params;
  try {
    const business = await apiFetch<BusinessDetail>(`/businesses/${id}`, { cache: 'no-store' });
    return { title: `${business.name} — Trimly`, description: business.description ?? undefined };
  } catch {
    return { title: 'Salon — Trimly' };
  }
}

export default async function Page(props: PageProps<'/salons/[id]'>) {
  const { id } = await props.params;
  const business = await getBusiness(id);
  const avgRating =
    business.reviews.length > 0
      ? Math.round((business.reviews.reduce((s, r) => s + r.rating, 0) / business.reviews.length) * 10) / 10
      : null;
  const cheapest = [...business.services].sort((a, b) => a.price - b.price)[0];

  return (
    <div className="pb-24 sm:pb-6">
      <div className="flex gap-1 overflow-x-auto pl-4 sm:grid sm:grid-cols-4 sm:gap-2 sm:pl-0">
        {business.media.slice(0, 6).map((m, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={m.id}
            src={m.url}
            alt={business.name}
            className={`h-48 shrink-0 object-cover sm:h-32 sm:w-full sm:rounded-md ${i === 0 ? 'w-72 sm:w-full' : 'w-56'}`}
          />
        ))}
        {business.media.length === 0 && (
          <div className="mr-4 flex h-48 w-full items-center justify-center rounded-md bg-neutral-100 text-muted sm:mr-0 sm:col-span-4 sm:h-32">
            No photos yet
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-5xl px-4">
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">{business.name}</h1>
            <p className="text-muted">
              {business.category} · {business.city.name}
            </p>
            <p className={`mt-0.5 text-sm font-medium ${business.openNow ? 'text-emerald-700' : 'text-muted'}`}>
              {business.openNow
                ? `● Open now · until ${formatHhmm(business.todayHours!.close)}`
                : business.todayHours
                  ? `Closed now · today ${formatHhmm(business.todayHours.open)}–${formatHhmm(business.todayHours.close)}`
                  : 'Closed today'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {business.trustBadges.map((b) => (
                <span key={b.badgeType} className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] font-medium text-brand-dark">
                  {BADGE_LABEL[b.badgeType] ?? b.badgeType.replace('_', ' ')}
                </span>
              ))}
              {avgRating != null && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                  ★ {avgRating} ({business.reviews.length})
                </span>
              )}
            </div>
          </div>
          <a
            href={directionsUrl(business.lat, business.lng)}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-brand-tint"
          >
            Directions
          </a>
        </div>

        {business.achievements.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {business.achievements.map((a) => (
              <span
                key={a.key}
                className="flex shrink-0 items-center gap-1 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
              >
                <span aria-hidden>{a.emoji}</span>
                {a.label}
              </span>
            ))}
          </div>
        )}

        {business.description && <p className="mt-3 text-sm text-foreground/80">{business.description}</p>}

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Services</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {business.services.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 p-3">
                {s.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.imageUrl} alt={s.name} className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted">{s.durationMinutes} min</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold">₹{s.price}</span>
                  <Link
                    href={`/salons/${business.id}/book?serviceId=${s.id}`}
                    className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-medium text-brand-foreground hover:bg-brand-dark"
                  >
                    Book
                  </Link>
                </div>
              </div>
            ))}
            {business.services.length === 0 && <p className="p-3 text-sm text-muted">No services listed yet.</p>}
          </div>
        </section>

        {business.staff.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold">Our stylists</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {business.staff.map((s) => (
                <Link
                  key={s.id}
                  href={`/barbers/${s.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 active:scale-[0.99]"
                >
                  {s.photoUrl ? (
                    <SmoothImage
                      src={s.photoUrl}
                      alt={s.name}
                      className="h-11 w-11 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-tint font-semibold text-accent">
                      {s.name.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}</p>
                    {s.experienceYears != null && (
                      <p className="text-sm text-muted">{s.experienceYears} yrs experience</p>
                    )}
                    {s.specializations.length > 0 && (
                      <p className="truncate text-xs text-muted">{s.specializations.join(', ')}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Hours</h2>
          <HoursList hours={business.workingHours} />
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Location</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <iframe
              title={`Map showing ${business.name}`}
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${business.lng - 0.006}%2C${business.lat - 0.004}%2C${business.lng + 0.006}%2C${business.lat + 0.004}&layer=mapnik&marker=${business.lat}%2C${business.lng}`}
              className="h-52 w-full border-0"
              loading="lazy"
            />
            <div className="flex items-center justify-between gap-3 p-3">
              <p className="min-w-0 text-sm text-muted">{business.address ?? `${business.city.name}`}</p>
              <a
                href={directionsUrl(business.lat, business.lng)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-foreground"
              >
                Get directions
              </a>
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Reviews ({business.reviews.length})</h2>
          <div className="space-y-3">
            {business.reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.customer.name}</span>
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    ★ {r.rating}
                  </span>
                </div>
                {r.text && <p className="mt-1 text-sm text-foreground/80">{r.text}</p>}
              </div>
            ))}
            {business.reviews.length === 0 && (
              <p className="text-sm text-muted">No reviews yet — be the first to book and review.</p>
            )}
          </div>
        </section>
      </div>

      {cheapest && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur sm:hidden">
          <Link
            href={`/salons/${business.id}/book?serviceId=${cheapest.id}`}
            className="block w-full rounded-xl bg-brand py-3 text-center font-semibold text-brand-foreground"
          >
            Book now — from ₹{cheapest.price}
          </Link>
        </div>
      )}
    </div>
  );
}
