'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview' },
  { href: '/bills', label: 'Bills' },
  { href: '/participate', label: 'Participate' },
  { href: '/admin', label: 'Admin' },
] as const;

function isActiveRoute(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BungeLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="12" width="14" height="1.5" rx="0.75" fill="#5da882" />
      <rect x="5" y="4" width="1.5" height="9" rx="0.75" fill="white" />
      <rect x="8.25" y="1" width="1.5" height="12" rx="0.75" fill="white" />
      <rect x="11.5" y="5.5" width="1.5" height="7.5" rx="0.75" fill="white" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function ParticipateIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 10l2.5-2.5M10.5 2.5C9 1 6.5 1 5 2.5l-1 1 4.5 4.5 1-1C11 5.5 12 4 10.5 2.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4.5 7.5L2 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 11c.5-2 2-3 4.5-3s4 1 4.5 3M6.5 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/60 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between gap-8">

          {/* Wordmark */}
          <Link href="/" className="flex flex-shrink-0 items-center gap-2.5">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[#1a3d2b]">
              <BungeLogo />
            </span>
            <span className="flex flex-col gap-px">
              <span
                className="text-[15px] font-bold leading-none text-[#1a3d2b]"
                style={{ fontFamily: 'var(--font-site-serif)' }}
              >
                Bunge Mkononi
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.07em] leading-none text-slate-400">
                Parliament in your pocket
              </span>
            </span>
          </Link>

          {/* Navigation pill group */}
          <nav className="flex items-center gap-0 rounded-[10px] border border-slate-200/80 bg-slate-100/70 p-[3px]">
            {NAV_ITEMS.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150 ${
                    active
                      ? 'bg-[#1a3d2b] font-semibold text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Actions */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Search */}
            <Link
              href="/bills"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-[7px] text-[12px] font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
            >
              <SearchIcon />
              <span>Bills</span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-px font-mono text-[10px] font-semibold tracking-wider text-slate-400">
                ⌘K
              </kbd>
            </Link>

            <div className="h-[18px] w-px bg-slate-200" />

            {/* Participate */}
            <Link
              href="/participate"
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-[7px] text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <ParticipateIcon />
              Participate
            </Link>

            {/* USSD CTA */}
            <a
              href="tel:*384*16250#"
              className="flex items-center gap-1.5 rounded-lg bg-[#bb3d2a] px-3.5 py-[7px] text-[13px] font-semibold text-white transition hover:opacity-90"
            >
              <UserIcon />
              <span className="font-mono text-[12px] tracking-wide">*384*16250#</span>
            </a>
          </div>

        </div>
      </div>
    </header>
  );
}
