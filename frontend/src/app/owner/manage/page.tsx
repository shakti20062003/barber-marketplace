'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth-client';
import type { CurrentUser, OwnerBusinessDetail } from '@/lib/types';

const STATUS_COPY: Record<OwnerBusinessDetail['verificationStatus'], { label: string; style: string; note: string }> = {
  PENDING: {
    label: 'Pending review',
    style: 'bg-amber-100 text-amber-700',
    note: "Customers won't see this salon until an admin verifies it. You can keep editing in the meantime.",
  },
  VERIFIED: {
    label: 'Live',
    style: 'bg-accent-tint text-accent',
    note: 'Your salon is visible to customers. New changes stay live immediately.',
  },
  REJECTED: {
    label: 'Rejected',
    style: 'bg-red-100 text-red-700',
    note: 'An admin rejected this listing. Update the details below and it will be queued for review again.',
  },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export default function OwnerManagePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [business, setBusiness] = useState<OwnerBusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [serviceForm, setServiceForm] = useState({ name: '', price: '', durationMinutes: '30' });
  const [staffForm, setStaffForm] = useState({ name: '', experienceYears: '' });
  const [photoUrl, setPhotoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  function reload(businessId: string, tok: string) {
    apiFetch<OwnerBusinessDetail>(`/owner/businesses/${businessId}`, { token: tok })
      .then(setBusiness)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your salon'));
  }

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const tok = getToken();
    if (!tok || stored?.role !== 'OWNER') {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setToken(tok);
    apiFetch<{ id: string }[]>('/owner/businesses', { token: tok })
      .then((list) => {
        if (list.length === 0) {
          router.push('/owner');
          return;
        }
        reload(list[0].id, tok);
      })
      .catch(() => setError('Could not load your salon'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addService() {
    if (!token || !business || !serviceForm.name || !serviceForm.price) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/owner/businesses/${business.id}/services`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: serviceForm.name,
          price: Number(serviceForm.price),
          durationMinutes: Number(serviceForm.durationMinutes),
        }),
      });
      setServiceForm({ name: '', price: '', durationMinutes: '30' });
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add service');
    } finally {
      setBusy(false);
    }
  }

  async function addStaff() {
    if (!token || !business || !staffForm.name) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/owner/businesses/${business.id}/staff`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: staffForm.name,
          experienceYears: staffForm.experienceYears ? Number(staffForm.experienceYears) : undefined,
        }),
      });
      setStaffForm({ name: '', experienceYears: '' });
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add staff member');
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto() {
    if (!token || !business || !photoUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/owner/businesses/${business.id}/media`, {
        method: 'POST',
        token,
        body: JSON.stringify({ url: photoUrl.trim(), type: 'IMAGE' }),
      });
      setPhotoUrl('');
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add photo');
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto(mediaId: string) {
    if (!token || !business) return;
    setBusy(true);
    try {
      await apiFetch(`/owner/businesses/${business.id}/media/${mediaId}`, { method: 'DELETE', token });
      reload(business.id, token);
    } finally {
      setBusy(false);
    }
  }

  if (!business) {
    return <div className="p-6 text-sm text-muted">{error ?? 'Loading…'}</div>;
  }

  const status = STATUS_COPY[business.verificationStatus];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <div className="flex items-center justify-between text-sm text-muted">
        <Link href="/owner" className="font-medium underline hover:text-foreground">
          ← Back to dashboard
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{business.name}</h1>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.style}`}>{status.label}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{status.note}</p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Section title="Photos">
        <div className="grid grid-cols-3 gap-2">
          {business.media.map((m) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removePhoto(m.id)}
                disabled={busy}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
          {business.media.length === 0 && <p className="col-span-3 text-sm text-muted">No photos yet.</p>}
        </div>
        <div className="flex gap-2">
          <input
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="Photo URL (https://…)"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
          />
          <button
            onClick={addPhoto}
            disabled={busy || !photoUrl.trim()}
            className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="text-xs text-muted">
          No upload yet — paste an image URL. Try{' '}
          <button
            type="button"
            onClick={() => setPhotoUrl(`https://picsum.photos/seed/${business.id}-${business.media.length}/800/600`)}
            className="underline"
          >
            a placeholder photo
          </button>
          .
        </p>
      </Section>

      <Section title={`Services (${business.services.length})`}>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {business.services.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium">{s.name}</p>
                <p className="text-muted">{s.durationMinutes} min</p>
              </div>
              <span className="font-semibold">₹{s.price}</span>
            </div>
          ))}
          {business.services.length === 0 && <p className="p-3 text-sm text-muted">No services yet.</p>}
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={serviceForm.name}
            onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
            placeholder="Service name"
            className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
          <input
            value={serviceForm.price}
            onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
            placeholder="₹ Price"
            inputMode="numeric"
            className="w-24 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
          <input
            value={serviceForm.durationMinutes}
            onChange={(e) => setServiceForm({ ...serviceForm, durationMinutes: e.target.value })}
            placeholder="Mins"
            inputMode="numeric"
            className="w-16 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={addService}
          disabled={busy || !serviceForm.name || !serviceForm.price}
          className="w-full rounded-xl bg-brand-tint py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-50"
        >
          Add service
        </button>
      </Section>

      <Section title={`Staff (${business.staff.length})`}>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {business.staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 text-sm">
              <span className="font-medium">{s.name}</span>
              {s.experienceYears != null && <span className="text-muted">{s.experienceYears} yrs</span>}
            </div>
          ))}
          {business.staff.length === 0 && <p className="p-3 text-sm text-muted">No staff yet.</p>}
        </div>
        <div className="flex gap-2">
          <input
            value={staffForm.name}
            onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
            placeholder="Staff name"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
          />
          <input
            value={staffForm.experienceYears}
            onChange={(e) => setStaffForm({ ...staffForm, experienceYears: e.target.value })}
            placeholder="Yrs exp."
            inputMode="numeric"
            className="w-24 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
          />
        </div>
        <button
          onClick={addStaff}
          disabled={busy || !staffForm.name}
          className="w-full rounded-xl bg-brand-tint py-2.5 text-sm font-semibold text-brand-dark disabled:opacity-50"
        >
          Add staff member
        </button>
      </Section>
    </div>
  );
}
