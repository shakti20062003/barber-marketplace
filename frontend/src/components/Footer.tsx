import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 py-8 text-sm sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <div className="flex items-center gap-1.5 text-base font-extrabold tracking-tight text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs text-brand-foreground">
              T
            </span>
            Trimly
          </div>
          <p className="mt-2 text-xs text-muted">
            Find and book verified salons and barbers near you — transparent pricing, no surprises.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">For customers</h3>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>
              <Link href="/search" className="hover:text-foreground">
                Find a salon
              </Link>
            </li>
            <li>
              <Link href="/styles" className="hover:text-foreground">
                Style Finder
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-foreground">
                Log in
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">For salon owners</h3>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>
              <Link href="/login?next=/owner" className="hover:text-foreground">
                List your salon
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-foreground">Trimly</h3>
          <p className="mt-2 text-xs text-muted">© 2026 Trimly. Made for salons and customers across India.</p>
        </div>
      </div>
    </footer>
  );
}
