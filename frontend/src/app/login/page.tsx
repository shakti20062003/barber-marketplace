'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { saveSession } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

// Accepts how people actually type a number (spaces, dashes, no country
// code) and normalizes it to the E.164 format the backend requires
// (`phoneSchema` in `backend/src/modules/auth/dto/otp.dto.ts`).
function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s()-]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (/^\d{10}$/.test(cleaned)) return `+91${cleaned}`;
  return cleaned;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitNext = searchParams.get('next');

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<'CUSTOMER' | 'OWNER'>('CUSTOMER');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  async function sendOtp() {
    const normalized = normalizePhone(phone);
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError('Enter a valid phone number, e.g. 9876543210 or +919876543210.');
      return;
    }
    setPhone(normalized);
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ sent: true; devOtp?: string }>('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone: normalized }),
      });
      setDevOtp(result.devOtp ?? null);
      setStep('otp');
      setResendCooldown(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ sent: true; devOtp?: string }>('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setDevOtp(result.devOtp ?? null);
      setCode('');
      setResendCooldown(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend OTP');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<{ accessToken: string; user: CurrentUser }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, code, role, name: name || undefined }),
      });
      saveSession(result.accessToken, result.user);
      const roleHome =
        result.user.role === 'ADMIN' ? '/admin' : result.user.role === 'OWNER' ? '/owner' : '/account';
      router.push(explicitNext ?? roleHome);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Incorrect OTP');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-xl font-extrabold text-brand-foreground">
        T
      </div>
      <h1 className="mt-4 text-center text-xl font-bold">Log in to Trimly</h1>
      <p className="mt-1 text-center text-sm text-muted">
        {step === 'phone' ? "We'll text you a one-time code." : 'Enter the code to continue.'}
      </p>

      {step === 'phone' && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold">Phone number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">I am a</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole('CUSTOMER')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                  role === 'CUSTOMER' ? 'border-brand bg-brand-tint text-brand-dark' : 'border-border bg-surface'
                }`}
              >
                Customer
              </button>
              <button
                onClick={() => setRole('OWNER')}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${
                  role === 'OWNER' ? 'border-brand bg-brand-tint text-brand-dark' : 'border-border bg-surface'
                }`}
              >
                Salon owner
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={sendOtp}
            disabled={loading}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div className="mt-5 space-y-4">
          {devOtp && (
            <div className="rounded-xl border border-dashed border-brand/40 bg-brand-tint p-3 text-center text-sm text-brand-dark">
              Dev mode — no SMS provider is configured yet, so here&apos;s the code:{' '}
              <span className="font-bold tracking-widest">{devOtp}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold">Your name (first-time sign-up)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional if you already have an account"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold">6-digit code sent to {phone}</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              inputMode="numeric"
              className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-center text-lg tracking-[0.5em]"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={verifyOtp}
            disabled={loading || code.length !== 6}
            className="w-full rounded-xl bg-brand py-3 font-semibold text-brand-foreground disabled:opacity-50"
          >
            {loading ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button
            onClick={resendOtp}
            disabled={loading || resendCooldown > 0}
            className="w-full text-center text-sm font-medium text-muted disabled:opacity-50"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
