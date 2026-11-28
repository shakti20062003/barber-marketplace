'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getStoredUser } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

export default function Nav() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR, so the logged-in state is
    // necessarily synced in after mount rather than during initial render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getStoredUser<CurrentUser>());
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight text-foreground">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm text-brand-foreground">
            T
          </span>
          Trimly
        </Link>
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          <Link href="/styles" className="font-medium text-muted hover:text-foreground">
            ✂️ Style Finder
          </Link>
          {user?.role === 'OWNER' && (
            <Link href="/owner" className="font-medium text-muted hover:text-foreground">
              My salon
            </Link>
          )}
          {user?.role === 'CUSTOMER' && (
            <Link href="/account" className="font-medium text-muted hover:text-foreground">
              My account
            </Link>
          )}
          {user?.role === 'STAFF' && (
            <Link href="/staff" className="font-medium text-muted hover:text-foreground">
              My dashboard
            </Link>
          )}
          {user?.role === 'ADMIN' && (
            <Link href="/admin" className="font-medium text-muted hover:text-foreground">
              Admin console
            </Link>
          )}
          {user ? (
            <button
              onClick={() => {
                clearSession();
                setUser(null);
                router.push('/');
              }}
              className="rounded-full border border-border px-3.5 py-1.5 font-medium hover:bg-brand-tint"
            >
              Sign out ({user.name})
            </button>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-brand px-4 py-1.5 font-medium text-brand-foreground hover:bg-brand-dark"
            >
              Log in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
