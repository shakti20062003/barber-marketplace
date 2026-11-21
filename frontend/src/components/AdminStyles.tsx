'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getToken } from '@/lib/auth-client';
import { fileToResizedDataUrl } from '@/lib/image';
import type { HairStyle } from '@/lib/types';

const SHAPES = ['oval', 'round', 'square', 'heart', 'oblong', 'diamond'] as const;

function StyleRow({ style, onSaved }: { style: HairStyle; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Partial<HairStyle>) {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/styles/${style.id}`, { method: 'PATCH', token, body: JSON.stringify(body) });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex gap-3 border-b border-slate-700 px-3 py-3 last:border-0 ${style.active ? '' : 'opacity-50'}`}>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="relative h-16 w-14 shrink-0 overflow-hidden rounded-md border border-dashed border-slate-600 bg-slate-900 text-[10px] text-slate-400"
        aria-label={`Upload photo for ${style.name}`}
      >
        {style.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={style.imageUrl} alt={style.name} className="h-full w-full object-cover" />
        ) : (
          '+ Photo'
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) patch({ imageUrl: await fileToResizedDataUrl(file, 900) });
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-100">
          {style.name} <span className="text-xs text-slate-500">· {style.gender === 'MEN' ? 'Men' : 'Women'}</span>
        </p>
        <p className="text-[11px] text-slate-500">
          {SHAPES.map((s) => `${s} ${style.faceShapeFit[s]}`).join(' · ')}
        </p>
        <div className="mt-1 flex gap-3 text-xs">
          {style.imageUrl && (
            <button onClick={() => patch({ imageUrl: null })} disabled={busy} className="text-slate-400 underline">
              Remove photo
            </button>
          )}
          <button onClick={() => patch({ active: !style.active })} disabled={busy} className="text-indigo-300 underline">
            {style.active ? 'Hide from customers' : 'Show to customers'}
          </button>
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}

function AddStyleForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState({
    name: '',
    gender: 'WOMEN' as 'MEN' | 'WOMEN',
    description: '',
    length: 'Medium',
    maintenance: 'Medium',
  });
  const [fit, setFit] = useState<Record<(typeof SHAPES)[number], number>>({
    oval: 85,
    round: 80,
    square: 80,
    heart: 80,
    oblong: 80,
    diamond: 80,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const input = 'w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-500';

  async function submit() {
    const token = getToken();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/admin/styles', { method: 'POST', token, body: JSON.stringify({ ...form, faceShapeFit: fit }) });
      setForm({ ...form, name: '', description: '' });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add style');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-800/60 p-3">
      <p className="text-sm font-semibold text-slate-200">Add a style</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={input} />
        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'MEN' | 'WOMEN' })} className={input}>
          <option value="WOMEN">Women</option>
          <option value="MEN">Men</option>
        </select>
        <select value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} className={input}>
          {['Short', 'Medium', 'Long'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={form.maintenance} onChange={(e) => setForm({ ...form, maintenance: e.target.value })} className={input}>
          {['Low', 'Medium', 'High'].map((v) => (
            <option key={v} value={v}>
              {v} upkeep
            </option>
          ))}
        </select>
      </div>
      <input
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="Short description customers will read"
        className={input}
      />
      <p className="text-[11px] text-slate-400">How well it suits each face shape (0–100):</p>
      <div className="grid grid-cols-3 gap-2">
        {SHAPES.map((s) => (
          <label key={s} className="text-[11px] capitalize text-slate-400">
            {s}
            <input
              type="number"
              min={0}
              max={100}
              value={fit[s]}
              onChange={(e) => setFit({ ...fit, [s]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
              className={input}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={saving || form.name.trim().length < 2 || form.description.trim().length < 5}
        className="w-full rounded-lg bg-indigo-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add style'}
      </button>
    </div>
  );
}

/** Admin console section for the Style Finder catalogue. */
export default function AdminStyles() {
  const [styles, setStyles] = useState<HairStyle[] | null>(null);

  function load() {
    const token = getToken();
    if (!token) return;
    apiFetch<HairStyle[]>('/admin/styles', { token })
      .then(setStyles)
      .catch(() => setStyles([]));
  }

  useEffect(load, []);

  if (styles === null) return <p className="text-sm text-slate-500">Loading…</p>;
  const missingPhotos = styles.filter((s) => s.active && !s.imageUrl).length;

  return (
    <div className="space-y-3">
      {missingPhotos > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200">
          {missingPhotos} styles still show an illustrated placeholder. Tap “+ Photo” to upload a picture you have the
          rights to use (your own salon photos, or licensed stock).
        </p>
      )}
      <div className="rounded-xl border border-slate-700 bg-slate-800/60">
        {styles.map((s) => (
          <StyleRow key={s.id} style={s} onSaved={load} />
        ))}
      </div>
      <AddStyleForm onAdded={load} />
    </div>
  );
}
