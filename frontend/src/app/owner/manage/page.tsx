'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken } from '@/lib/auth-client';
import type { CurrentUser, OwnerBusinessDetail, Service } from '@/lib/types';
import { fileToResizedDataUrl, formatHhmm } from '@/lib/image';

const CUTOFF_OPTIONS = [0, 15, 30, 45, 60, 90, 120];

function minusMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.max(0, h * 60 + m - mins);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function BookingHoursSection({
  business,
  busy,
  onSave,
}: {
  business: OwnerBusinessDetail;
  busy: boolean;
  onSave: (cutoff: number | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<'finish' | 'cutoff'>(business.lastBookingCutoffMinutes == null ? 'finish' : 'cutoff');
  const [cutoff, setCutoff] = useState<number>(business.lastBookingCutoffMinutes ?? 30);
  const [saved, setSaved] = useState(false);

  // Preview against a real open day of this salon (first open day, Mon→Sun).
  const sample = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    .map((k) => business.workingHours?.[k])
    .find((d) => d && !d.closed);
  const sampleService = business.services[0];
  const dirty = (mode === 'finish' ? null : cutoff) !== business.lastBookingCutoffMinutes;

  return (
    <Section title="Last booking time">
      <p className="text-sm text-muted">How late in the day can customers book?</p>
      <label className={`flex gap-3 rounded-xl border p-3 text-sm ${mode === 'finish' ? 'border-brand bg-brand-tint/40' : 'border-border bg-surface'}`}>
        <input type="radio" checked={mode === 'finish'} onChange={() => setMode('finish')} className="mt-0.5 accent-[var(--brand)]" />
        <span>
          <span className="font-medium">Service must finish by closing time</span>{' '}
          <span className="text-xs text-muted">(recommended)</span>
          {sample && sampleService && (
            <span className="mt-0.5 block text-xs text-muted">
              e.g. open {formatHhmm(sample.open)}–{formatHhmm(sample.close)}: a {sampleService.durationMinutes}-min{' '}
              {sampleService.name} can start until{' '}
              {formatHhmm(minusMinutes(sample.close, sampleService.durationMinutes))}
            </span>
          )}
        </span>
      </label>
      <label className={`flex gap-3 rounded-xl border p-3 text-sm ${mode === 'cutoff' ? 'border-brand bg-brand-tint/40' : 'border-border bg-surface'}`}>
        <input type="radio" checked={mode === 'cutoff'} onChange={() => setMode('cutoff')} className="mt-0.5 accent-[var(--brand)]" />
        <span className="flex-1">
          <span className="font-medium">Accept bookings until</span>
          <select
            value={cutoff}
            onChange={(e) => {
              setMode('cutoff');
              setCutoff(Number(e.target.value));
            }}
            className="mx-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
          >
            {CUTOFF_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'closing time' : `${m} min before`}
              </option>
            ))}
          </select>
          {cutoff !== 0 && <span className="font-medium">closing</span>}
          {sample && (
            <span className="mt-0.5 block text-xs text-muted">
              e.g. closing {formatHhmm(sample.close)}: last booking starts at{' '}
              {formatHhmm(minusMinutes(sample.close, cutoff))}, for any service. Longer services may run past closing.
            </span>
          )}
        </span>
      </label>
      <button
        onClick={async () => {
          await onSave(mode === 'finish' ? null : cutoff);
          setSaved(true);
        }}
        disabled={busy || !dirty}
        className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
      >
        {saved && !dirty ? 'Saved ✓' : 'Save'}
      </button>
    </Section>
  );
}

/** Pulls coordinates out of a pasted Google Maps link ("@19.07,72.87" or "q=19.07,72.87"). */
function coordsFromMapsLink(link: string): { lat: number; lng: number } | null {
  const m = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? link.match(/[?&](?:q|query|destination|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function mapEmbedUrl(lat: number, lng: number) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.004}%2C${lat - 0.003}%2C${lng + 0.004}%2C${lat + 0.003}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function ServiceRow({ service, onPhoto, busy }: { service: Service; onPhoto: (url: string | null) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-dashed border-border bg-neutral-50 text-[10px] text-muted"
        aria-label={`Add photo for ${service.name}`}
      >
        {service.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.imageUrl} alt={service.name} className="h-full w-full object-cover" />
        ) : (
          <span>+ Photo</span>
        )}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setError(null);
          try {
            onPhoto(await fileToResizedDataUrl(file, 800));
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not read image');
          }
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{service.name}</p>
        <p className="text-muted">{service.durationMinutes} min</p>
        {service.imageUrl && (
          <button type="button" onClick={() => onPhoto(null)} className="text-xs text-muted underline">
            Remove photo
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
      <span className="font-semibold">₹{service.price}</span>
    </div>
  );
}

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
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useState<{ lat: string; lng: string; address: string }>({ lat: '', lng: '', address: '' });
  const [mapsLink, setMapsLink] = useState('');
  const [locationMsg, setLocationMsg] = useState<string | null>(null);

  function reload(businessId: string, tok: string) {
    apiFetch<OwnerBusinessDetail>(`/owner/businesses/${businessId}`, { token: tok })
      .then((b) => {
        setBusiness(b);
        setLocation({ lat: String(b.lat), lng: String(b.lng), address: b.address ?? '' });
      })
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

  async function uploadPhotos(files: FileList | null) {
    if (!token || !business || !files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const url = await fileToResizedDataUrl(file);
        await apiFetch(`/owner/businesses/${business.id}/media`, {
          method: 'POST',
          token,
          body: JSON.stringify({ url, type: 'IMAGE' }),
        });
      }
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not upload photo');
    } finally {
      setBusy(false);
    }
  }

  async function setServicePhoto(serviceId: string, imageUrl: string | null) {
    if (!token || !business) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/owner/businesses/${business.id}/services/${serviceId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ imageUrl }),
      });
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update service photo');
    } finally {
      setBusy(false);
    }
  }

  function useCurrentLocation() {
    setLocationMsg(null);
    if (!navigator.geolocation) {
      setLocationMsg('Location is not available on this device.');
      return;
    }
    setLocationMsg('Finding your location… stand inside the salon for best accuracy.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation((l) => ({ ...l, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setLocationMsg(`Got it (accurate to ~${Math.round(pos.coords.accuracy)} m). Check the map, then Save.`);
      },
      () => setLocationMsg('Could not get your location. Allow location access, or paste a Google Maps link instead.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function applyMapsLink() {
    const c = coordsFromMapsLink(mapsLink);
    if (!c) {
      setLocationMsg('Could not read a location from that link. Open the salon in Google Maps, tap Share, and paste the full link.');
      return;
    }
    setLocation((l) => ({ ...l, lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) }));
    setLocationMsg('Location read from the link. Check the map, then Save.');
  }

  async function saveLocation() {
    if (!token || !business) return;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocationMsg('Set a location first.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/owner/businesses/${business.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ lat, lng, address: location.address.trim() || undefined }),
      });
      setLocationMsg('Location saved. Customers will get directions to this exact spot.');
      reload(business.id, token);
    } catch (err) {
      setLocationMsg(err instanceof ApiError ? err.message : 'Could not save location');
    } finally {
      setBusy(false);
    }
  }

  async function saveCutoff(lastBookingCutoffMinutes: number | null) {
    if (!token || !business) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/owner/businesses/${business.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ lastBookingCutoffMinutes }),
      });
      reload(business.id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save setting');
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

      <Section title={`Salon photos (${business.media.length})`}>
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
        <button
          onClick={() => photoInputRef.current?.click()}
          disabled={busy}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          {busy ? 'Uploading…' : '📷 Upload photos from your phone'}
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        {showUrlInput ? (
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
              className="shrink-0 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              Add
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowUrlInput(true)} className="text-xs text-muted underline">
            Or add a photo by link
          </button>
        )}
      </Section>

      <Section title="Location">
        <p className="text-sm text-muted">
          Set the exact spot so customers get turn-by-turn directions to your door.
        </p>
        {location.lat && location.lng && (
          <iframe
            title="Salon location preview"
            src={mapEmbedUrl(Number(location.lat), Number(location.lng))}
            className="h-48 w-full rounded-xl border border-border"
            loading="lazy"
          />
        )}
        <button
          onClick={useCurrentLocation}
          className="w-full rounded-xl bg-accent-tint py-2.5 text-sm font-semibold text-accent"
        >
          📍 Use my current location
        </button>
        <div className="flex gap-2">
          <input
            value={mapsLink}
            onChange={(e) => setMapsLink(e.target.value)}
            placeholder="…or paste a Google Maps link"
            className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
          />
          <button
            onClick={applyMapsLink}
            disabled={!mapsLink.trim()}
            className="shrink-0 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            Use
          </button>
        </div>
        <input
          value={location.address}
          onChange={(e) => setLocation({ ...location, address: e.target.value })}
          placeholder="Address / landmark (e.g. Shop 4, Linking Road, near Bandra station)"
          className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm"
        />
        {locationMsg && <p className="text-sm text-muted">{locationMsg}</p>}
        <button
          onClick={saveLocation}
          disabled={busy}
          className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          Save location
        </button>
      </Section>

      <BookingHoursSection key={String(business.lastBookingCutoffMinutes)} business={business} busy={busy} onSave={saveCutoff} />

      <Section title={`Services (${business.services.length})`}>
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {business.services.map((s) => (
            <ServiceRow key={s.id} service={s} busy={busy} onPhoto={(url) => setServicePhoto(s.id, url)} />
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
