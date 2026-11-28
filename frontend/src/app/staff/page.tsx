'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken, clearSession } from '@/lib/auth-client';
import { cacheKey, useCachedState } from '@/lib/clientCache';
import { fileToResizedDataUrl, formatTime } from '@/lib/image';
import SmoothImage from '@/components/SmoothImage';
import type { CurrentUser, StaffMe, StaffBooking, PortfolioMedia } from '@/lib/types';

const ENGAGED_OPTIONS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hr', minutes: 120 },
  { label: '4 hr', minutes: 240 },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function StaffDashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useCachedState<StaffMe | null>(cacheKey('staff-me'), null);
  const [bookings, setBookings] = useCachedState<StaffBooking[]>(cacheKey('staff-me-bookings'), []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'profile' | 'engaged' | 'portfolio' | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ experienceYears: '', specializations: '', languages: '' });

  function reload(tok: string) {
    apiFetch<StaffMe>('/staff/me', { token: tok })
      .then((s) => {
        setMe(s);
        setForm({
          experienceYears: s.experienceYears != null ? String(s.experienceYears) : '',
          specializations: s.specializations.join(', '),
          languages: s.languages.join(', '),
        });
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load your profile'));
    apiFetch<StaffBooking[]>('/staff/me/bookings', { token: tok })
      .then(setBookings)
      .catch(() => setBookings([]));
  }

  useEffect(() => {
    const stored = getStoredUser<CurrentUser>();
    const tok = getToken();
    if (!tok || stored?.role !== 'STAFF') {
      router.push('/login');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage read, unavailable during SSR
    setToken(tok);
    reload(tok);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (!token) return;
    setBusy('profile');
    setError(null);
    try {
      const updated = await apiFetch<StaffMe>('/staff/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
          specializations: form.specializations
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          languages: form.languages
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setMe((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile');
    } finally {
      setBusy(null);
    }
  }

  async function setEngaged(minutes: number) {
    if (!token) return;
    setBusy('engaged');
    setError(null);
    try {
      const updated = await apiFetch<StaffMe>('/staff/me/engaged', {
        method: 'POST',
        token,
        body: JSON.stringify({ minutes }),
      });
      setMe((prev) => (prev ? { ...prev, engagedUntil: updated.engagedUntil } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update status');
    } finally {
      setBusy(null);
    }
  }

  async function addPhoto(file: File) {
    if (!token) return;
    setBusy('portfolio');
    setError(null);
    try {
      const url = await fileToResizedDataUrl(file);
      const updated = await apiFetch<PortfolioMedia>('/staff/me/portfolio', {
        method: 'POST',
        token,
        body: JSON.stringify({ url, type: 'PORTFOLIO' }),
      });
      setMe((prev) => (prev ? { ...prev, portfolioMedia: [...prev.portfolioMedia, updated] } : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload that photo');
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto(mediaId: string) {
    if (!token) return;
    setBusy('portfolio');
    try {
      await apiFetch(`/staff/me/portfolio/${mediaId}`, { method: 'DELETE', token });
      setMe((prev) => (prev ? { ...prev, portfolioMedia: prev.portfolioMedia.filter((m) => m.id !== mediaId) } : prev));
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        {error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-muted">Loading…</p>}
      </div>
    );
  }

  const engagedUntil = me.engagedUntil ? new Date(me.engagedUntil) : null;
  const isEngaged = !!engagedUntil && engagedUntil > new Date();
  const upcoming = bookings.filter((b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS');
  const past = bookings.filter((b) => !upcoming.includes(b));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{me.name}</h1>
          <p className="text-sm text-muted">{me.business.name}</p>
        </div>
        <button
          onClick={() => {
            clearSession();
            router.push('/');
          }}
          className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-brand-tint"
        >
          Sign out
        </button>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      <Section title="Status">
        <p className="mb-3 text-sm">
          {isEngaged ? (
            <span className="font-medium text-amber-700">
              Engaged until {engagedUntil!.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
            </span>
          ) : (
            <span className="font-medium text-emerald-700">Available</span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {ENGAGED_OPTIONS.map((o) => (
            <button
              key={o.minutes}
              onClick={() => setEngaged(o.minutes)}
              disabled={busy === 'engaged'}
              className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-brand-tint disabled:opacity-50"
            >
              Busy {o.label}
            </button>
          ))}
          {isEngaged && (
            <button
              onClick={() => setEngaged(0)}
              disabled={busy === 'engaged'}
              className="rounded-full border border-brand bg-brand-tint px-3 py-1.5 text-sm font-medium text-brand-dark disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </Section>

      <Section title="Your profile">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted">Years of experience</label>
            <input
              value={form.experienceYears}
              onChange={(e) => setForm((f) => ({ ...f, experienceYears: e.target.value }))}
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted">Specializations (comma-separated)</label>
            <input
              value={form.specializations}
              onChange={(e) => setForm((f) => ({ ...f, specializations: e.target.value }))}
              placeholder="Fades, Beard styling"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted">Languages (comma-separated)</label>
            <input
              value={form.languages}
              onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))}
              placeholder="Hindi, English"
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={saveProfile}
            disabled={busy === 'profile'}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-foreground disabled:opacity-50"
          >
            {busy === 'profile' ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </Section>

      <Section title="Portfolio">
        <div className="grid grid-cols-3 gap-2">
          {me.portfolioMedia.map((m) => (
            <div key={m.id} className="group relative aspect-square overflow-hidden rounded-xl">
              <SmoothImage src={m.url} alt="Portfolio photo" className="h-full w-full object-cover" />
              <button
                onClick={() => removePhoto(m.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => photoInputRef.current?.click()}
            disabled={busy === 'portfolio'}
            className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted disabled:opacity-50"
          >
            {busy === 'portfolio' ? '…' : '+ Add'}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPhoto(file);
              e.target.value = '';
            }}
          />
        </div>
      </Section>

      <Section title="Upcoming bookings">
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing upcoming.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((b) => (
              <li key={b.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.customerName}</span>
                  <span className="text-muted">{formatTime(b.slotStart)}</span>
                </div>
                <p className="mt-0.5 text-muted">
                  {b.service.name} · {b.serviceLocationType === 'HOME_SERVICE' ? '🏠 Home visit' : b.business.name}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {past.length > 0 && (
        <Section title="Past bookings">
          <ul className="space-y-2">
            {past.slice(0, 20).map((b) => (
              <li key={b.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{b.customerName}</span>
                  <span className="text-muted">{formatTime(b.slotStart)}</span>
                </div>
                <p className="mt-0.5 text-muted">
                  {b.service.name} · {b.status}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
