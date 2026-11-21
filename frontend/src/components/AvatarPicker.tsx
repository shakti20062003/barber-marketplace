'use client';

import { useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken, saveSession } from '@/lib/auth-client';
import { fileToResizedDataUrl } from '@/lib/image';
import type { CurrentUser } from '@/lib/types';

/** Round profile picture that opens the device's photo picker on tap. */
export default function AvatarPicker({
  name,
  avatarUrl,
  onChange,
  size = 64,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  onChange: (url: string | null) => void;
  size?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(url: string | null) {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/users/me', { method: 'PATCH', token, body: JSON.stringify({ avatarUrl: url }) });
      const stored = getStoredUser<CurrentUser>();
      if (stored) saveSession(token, { ...stored, avatarUrl: url });
      onChange(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update photo');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await save(await fileToResizedDataUrl(file, 400, 0.85));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image');
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative overflow-hidden rounded-full bg-brand text-brand-foreground ring-4 ring-white/10"
        style={{ width: size, height: size }}
        aria-label="Change profile picture"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-black/50 py-0.5 text-[9px] font-semibold text-white">
          {busy ? '…' : avatarUrl ? 'CHANGE' : 'ADD'}
        </span>
      </button>
      {avatarUrl && !busy && (
        <button type="button" onClick={() => save(null)} className="mt-1 text-[10px] underline opacity-70">
          Remove
        </button>
      )}
      {error && <p className="mt-1 max-w-[8rem] text-center text-[10px] text-red-500">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
