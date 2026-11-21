'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Official "Sign in with Google" button (Google Identity Services, free).
 * Google returns an ID token ("credential"); the API verifies it
 * (backend modules/auth/google-id-token.ts) and signs the user in.
 */

type GsiButtonOptions = { theme: string; size: string; text: string; shape: string; width?: number; logo_alignment?: string };
interface GoogleAccountsId {
  initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: 'popup' }): void;
  renderButton(el: HTMLElement, opts: GsiButtonOptions): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load Google sign-in'));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function GoogleButton({
  clientId,
  onCredential,
  text = 'continue_with',
}: {
  clientId: string;
  onCredential: (credential: string) => void;
  /** Google's wording presets: 'continue_with' | 'signin_with' | 'signup_with'. */
  text?: 'continue_with' | 'signin_with' | 'signup_with';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !ref.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (r) => callbackRef.current(r.credential),
          ux_mode: 'popup',
        });
        window.google.accounts.id.renderButton(ref.current, {
          theme: 'outline',
          size: 'large',
          text,
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(360, ref.current.offsetWidth || 320),
        });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (failed) {
    return <p className="text-center text-sm text-red-600">Couldn&apos;t load Google sign-in. Check your connection and refresh.</p>;
  }
  return <div ref={ref} className="flex min-h-11 w-full justify-center" />;
}
