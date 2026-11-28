'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/auth-client';
import type { CurrentUser } from '@/lib/types';

function TabIcon({ name }: { name: 'home' | 'search' | 'styles' | 'salon' | 'profile' }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'styles':
      // scissors
      return (
        <svg {...common}>
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12" />
        </svg>
      );
    case 'salon':
      return (
        <svg {...common}>
          <path d="M6 4v16M18 4v16M6 8h12M6 16h12" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
        </svg>
      );
  }
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(getStoredUser<CurrentUser>());
  }, [pathname]);

  const tabs = [
    { href: '/', label: 'Home', icon: 'home' as const, active: pathname === '/' },
    { href: '/search', label: 'Search', icon: 'search' as const, active: pathname === '/search' },
    { href: '/styles', label: 'Styles', icon: 'styles' as const, active: pathname === '/styles' },
    user
      ? {
          href: user.role === 'OWNER' ? '/owner' : user.role === 'ADMIN' ? '/admin' : user.role === 'STAFF' ? '/staff' : '/account',
          label: user.role === 'OWNER' ? 'My salon' : user.role === 'ADMIN' ? 'Admin' : user.role === 'STAFF' ? 'Dashboard' : 'Account',
          icon: user.role === 'OWNER' || user.role === 'STAFF' ? ('salon' as const) : ('profile' as const),
          active:
            pathname.startsWith('/account') ||
            pathname.startsWith('/owner') ||
            pathname.startsWith('/admin') ||
            pathname.startsWith('/staff'),
        }
      : { href: '/login', label: 'Log in', icon: 'profile' as const, active: pathname === '/login' },
  ];

  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur sm:hidden">
      {tabs.map((tab) => (
        <Link
          key={tab.href + tab.label}
          href={tab.href}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
            tab.active ? 'text-brand' : 'text-muted'
          }`}
        >
          <TabIcon name={tab.icon} />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
