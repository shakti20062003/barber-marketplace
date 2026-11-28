import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { StaffDetail } from '@/lib/types';
import { BADGE_STYLE } from '@/components/BusinessCard';
import SmoothImage from '@/components/SmoothImage';

async function getStaff(id: string): Promise<StaffDetail> {
  try {
    return await apiFetch<StaffDetail>(`/staff/${id}`, { cache: 'no-store' });
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 404) notFound();
    throw err;
  }
}

export async function generateMetadata(props: PageProps<'/barbers/[id]'>) {
  const { id } = await props.params;
  try {
    const staff = await apiFetch<StaffDetail>(`/staff/${id}`, { cache: 'no-store' });
    return { title: `${staff.name} — Trimly` };
  } catch {
    return { title: 'Barber — Trimly' };
  }
}

export default async function Page(props: PageProps<'/barbers/[id]'>) {
  const { id } = await props.params;
  const staff = await getStaff(id);

  return (
    <div className="pb-24 sm:pb-6">
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <div className="flex items-center gap-4">
          {staff.photoUrl ? (
            <SmoothImage src={staff.photoUrl} alt={staff.name} className="h-20 w-20 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-accent-tint text-2xl font-semibold text-accent">
              {staff.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold">{staff.name}</h1>
            <Link href={`/salons/${staff.business.id}`} className="text-sm text-muted underline">
              {staff.business.name}
              {staff.business.city && ` · ${staff.business.city.name}`}
            </Link>
            {staff.experienceYears != null && (
              <p className="mt-0.5 text-sm text-muted">{staff.experienceYears} yrs experience</p>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          {staff.business.trustBadges.map((b) => {
            const style = BADGE_STYLE[b.badgeType] ?? { label: b.badgeType.replace('_', ' '), className: 'bg-neutral-100 text-muted' };
            return (
              <span key={b.badgeType} className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${style.className}`}>
                {style.label}
              </span>
            );
          })}
          {staff.averageRating != null && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
              ★ {staff.averageRating}
            </span>
          )}
        </div>

        {staff.specializations.length > 0 && (
          <p className="mt-3 text-sm">
            <span className="font-medium">Specializes in: </span>
            {staff.specializations.join(', ')}
          </p>
        )}
        {staff.languages.length > 0 && (
          <p className="mt-1 text-sm text-muted">Speaks {staff.languages.join(', ')}</p>
        )}

        {staff.portfolioMedia.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold">Portfolio</h2>
            <div className="grid grid-cols-3 gap-2">
              {staff.portfolioMedia.map((m) => (
                <div key={m.id} className="aspect-square overflow-hidden rounded-xl">
                  <SmoothImage src={m.url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 hidden sm:block">
          <Link
            href={`/salons/${staff.business.id}/book?staffId=${staff.id}`}
            className="block w-full rounded-xl bg-brand py-3 text-center font-semibold text-brand-foreground"
          >
            Book this barber
          </Link>
        </div>
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-16 z-30 border-t border-border bg-surface/95 p-3 backdrop-blur sm:hidden">
        <Link
          href={`/salons/${staff.business.id}/book?staffId=${staff.id}`}
          className="block w-full rounded-xl bg-brand py-3 text-center font-semibold text-brand-foreground"
        >
          Book this barber
        </Link>
      </div>
    </div>
  );
}
