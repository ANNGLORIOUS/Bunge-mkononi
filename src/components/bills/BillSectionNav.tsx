'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  { label: 'Overview', hrefSuffix: '' },
  { label: 'Documents', hrefSuffix: '/documents' },
  { label: 'Votes', hrefSuffix: '/votes' },
  { label: 'Participation', hrefSuffix: '/participation' },
] as const;

export default function BillSectionNav({ billId }: { billId: string }) {
  const pathname = usePathname();
  const baseHref = `/bills/${billId}`;

  return (
    <nav className="border-t border-[var(--line-strong)] bg-[#f6f1ea] px-7 py-4">
      <div className="flex flex-wrap gap-2">
      {sections.map((section) => {
        const href = `${baseHref}${section.hrefSuffix}`;
        const active = pathname === href;

        return (
          <Link
            key={section.label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              active
                ? 'border-slate-950 bg-slate-950 text-white shadow-lg shadow-slate-950/15'
                : 'border-slate-300 bg-white text-slate-700 hover:border-clay-400 hover:text-forest-800'
            }`}
          >
            {section.label}
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
