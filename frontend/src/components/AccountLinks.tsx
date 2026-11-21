'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { getStoredUser, getToken, saveSession } from '@/lib/auth-client';
import type { AuthMethods, CurrentUser } from '@/lib/types';
import GoogleButton from '@/components/GoogleButton';
import { cacheKey, useCachedState } from '@/lib/clientCache';

interface Me {
  phone: string | null;
  phoneVerified: boolean;
  email: string | null;
  googleLinked: boolean;
}

/**
 * Profile card: link a Google account (so accounts created with phone login
 * keep their data once phone login is switched off) and add/edit the mobile
 * number. One Google account and one phone number can each belong to only
 * one Trimly account — the API enforces it and we show its message.
 */
export default function AccountLinks({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const [me, setMe] = useCachedState<Me | null>(cacheKey('links:me'), null);
  const [methods, setMethods] = useCachedState<AuthMethods | null>('links:methods', null);
  const [editingPhone, setEditingPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch<Me>('/users/me', { token }).then(setMe).catch(() => {});
    apiFetch<AuthMethods>('/auth/methods').then(setMethods).catch(() => {});
  }, [setMe, setMethods]);

  async function linkGoogle(credential: string) {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ accessToken: string; user: CurrentUser }>('/auth/google/link', {
        method: 'POST',
        token,
        body: JSON.stringify({ credential }),
      });
      saveSession(res.accessToken, { ...(getStoredUser<CurrentUser>() ?? {}), ...res.user });
      setMe((m) => (m ? { ...m, googleLinked: true, email: res.user.email ?? m.email } : m));
      setMessage({ text: '✓ Google account connected. You can now sign in with Google.', ok: true });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : 'Could not connect Google', ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function savePhone() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await apiFetch<Me>('/users/me', { method: 'PATCH', token, body: JSON.stringify({ phone }) });
      setMe(updated);
      const stored = getStoredUser<CurrentUser>();
      if (stored) saveSession(token, { ...stored, phone: updated.phone });
      setEditingPhone(false);
      setMessage({ text: '✓ Mobile number saved.', ok: true });
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : 'Could not save number', ok: false });
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;
  const showGoogle = !!methods?.google && !me.googleLinked;
  const dark = tone === 'dark';
  const box = dark ? 'border-slate-700 bg-slate-800/60 text-slate-100' : 'border-border bg-surface';
  const muted = dark ? 'text-slate-400' : 'text-muted';
  const input = dark
    ? 'border-slate-700 bg-slate-900 text-slate-100'
    : 'border-border bg-surface';

  return (
    <div className={`mt-4 space-y-3 rounded-xl border p-4 ${box}`}>
      <p className="font-semibold">Your account</p>

      {/* Mobile number */}
      <div>
        <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>Mobile number</p>
        {editingPhone || !me.phone ? (
          <div className="mt-1 flex gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="10-digit mobile number"
              className={`min-w-0 flex-1 rounded-lg border px-3 py-2 ${input}`}
            />
            <button
              onClick={savePhone}
              disabled={busy || phone.replace(/\D/g, '').length < 10}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-50"
            >
              Save
            </button>
          </div>
        ) : (
          <p className="mt-0.5 flex items-center gap-2">
            <span className="font-medium">{me.phone}</span>
            {me.phoneVerified && <span className="text-xs text-emerald-600">✓ verified</span>}
            <button
              onClick={() => {
                setPhone(me.phone ?? '');
                setEditingPhone(true);
              }}
              className={`text-xs underline ${muted}`}
            >
              Change
            </button>
          </p>
        )}
        {!me.phone && (
          <p className={`mt-1 text-xs ${muted}`}>Used only by Trimly — never shown to salons or customers.</p>
        )}
      </div>

      {/* Google */}
      <div>
        <p className={`text-xs font-medium uppercase tracking-wide ${muted}`}>Google sign-in</p>
        {me.googleLinked ? (
          <p className="mt-0.5 text-sm">✓ Connected{me.email ? ` (${me.email})` : ''}</p>
        ) : showGoogle ? (
          <div className="mt-1">
            <p className={`mb-2 text-xs ${muted}`}>Connect Google so you can always sign in to this same account.</p>
            <GoogleButton clientId={methods!.google!.clientId} onCredential={linkGoogle} text="continue_with" />
          </div>
        ) : (
          <p className={`mt-0.5 text-sm ${muted}`}>Not connected</p>
        )}
      </div>

      {message && <p className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-500'}`}>{message.text}</p>}
    </div>
  );
}
