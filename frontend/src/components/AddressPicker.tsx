'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { coordsFromMapsLink, mapEmbedUrl } from '@/lib/location';
import type { Address } from '@/lib/types';

/** Saved home-visit addresses + an inline "add new" editor (same pattern as owner/manage's location editor). */
export default function AddressPicker({
  token,
  selectedId,
  onSelect,
}: {
  token: string;
  selectedId: string | null;
  onSelect: (address: Address) => void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', lat: '', lng: '', address: '' });
  const [mapsLink, setMapsLink] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Address[]>('/addresses', { token })
      .then((list) => {
        setAddresses(list);
        setAdding(list.length === 0);
      })
      .catch(() => setAddresses([]));
  }, [token]);

  function useCurrentLocation() {
    setMsg(null);
    if (!navigator.geolocation) {
      setMsg('Location is not available on this device.');
      return;
    }
    setMsg('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) }));
        setMsg(`Got it (accurate to ~${Math.round(pos.coords.accuracy)} m).`);
      },
      () => setMsg('Could not get your location. Allow location access, or paste a Google Maps link instead.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function applyMapsLink() {
    const c = coordsFromMapsLink(mapsLink);
    if (!c) {
      setMsg('Could not read a location from that link. Open it in Google Maps, tap Share, and paste the full link.');
      return;
    }
    setForm((f) => ({ ...f, lat: c.lat.toFixed(6), lng: c.lng.toFixed(6) }));
    setMsg('Location read from the link.');
  }

  async function saveAddress() {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!form.label.trim() || !form.address.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setMsg('Fill in a label, address, and location first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await apiFetch<Address>('/addresses', {
        method: 'POST',
        token,
        body: JSON.stringify({ label: form.label.trim(), lat, lng, formattedAddress: form.address.trim() }),
      });
      setAddresses((a) => [...a, created]);
      onSelect(created);
      setAdding(false);
      setForm({ label: '', lat: '', lng: '', address: '' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save address');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {addresses.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a)}
          className={`block w-full rounded-xl border p-3 text-left text-sm ${
            selectedId === a.id ? 'border-brand bg-brand-tint' : 'border-border bg-surface'
          }`}
        >
          <p className="font-medium">{a.label}</p>
          <p className="text-muted">{a.formattedAddress}</p>
        </button>
      ))}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted"
        >
          + Add new address
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          {form.lat && form.lng && (
            <iframe
              title="Address preview"
              src={mapEmbedUrl(Number(form.lat), Number(form.lng))}
              className="h-40 w-full rounded-lg border border-border"
              loading="lazy"
            />
          )}
          <button
            onClick={useCurrentLocation}
            className="w-full rounded-xl bg-accent-tint py-2 text-sm font-semibold text-accent"
          >
            📍 Use my current location
          </button>
          <div className="flex gap-2">
            <input
              value={mapsLink}
              onChange={(e) => setMapsLink(e.target.value)}
              placeholder="…or paste a Google Maps link"
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
            <button
              onClick={applyMapsLink}
              disabled={!mapsLink.trim()}
              className="shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Use
            </button>
          </div>
          <input
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder="Label (Home, Office…)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Full address"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
          {msg && <p className="text-xs text-muted">{msg}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveAddress}
              disabled={busy}
              className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save address'}
            </button>
            {addresses.length > 0 && (
              <button onClick={() => setAdding(false)} className="rounded-lg border border-border px-3 py-2 text-sm">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
