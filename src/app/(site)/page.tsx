import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BellRing,
  BookOpen,
  MessageSquare,
  PhoneCall,
  Search,
  TrendingUp,
  Vote,
} from 'lucide-react';
import { getDashboard } from '@/lib/api';

export const dynamic = 'force-dynamic';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

const heroFlagBackdropStyle: CSSProperties = {
  backgroundImage: [
    'linear-gradient(rgba(247, 245, 240, 0.72), rgba(247, 245, 240, 0.72))',
    "url('/kenya-flag.svg')",
  ].join(', '),
  backgroundPosition: 'center, center',
  backgroundRepeat: 'no-repeat, no-repeat',
  backgroundSize: 'cover, cover',
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
      <span className="h-px w-5 bg-slate-300" />
      {children}
    </p>
  );
}

type RouteTileTone = 'black' | 'white' | 'red' | 'green';

const routeTileToneClasses: Record<
  RouteTileTone,
  {
    card: string;
    icon: string;
    eyebrow: string;
    title: string;
    description: string;
    cta: string;
  }
> = {
  black: {
    card: 'border-slate-950 bg-slate-950 text-white hover:border-slate-900',
    icon: 'bg-white/8 text-white group-hover:bg-white/14',
    eyebrow: 'text-slate-300',
    title: 'text-white',
    description: 'text-slate-300',
    cta: 'text-white group-hover:gap-2.5',
  },
  white: {
    card: 'border-slate-300 bg-white text-slate-900 hover:border-slate-400',
    icon: 'bg-slate-100 text-slate-700 group-hover:bg-slate-900 group-hover:text-white',
    eyebrow: 'text-slate-500',
    title: 'text-slate-900',
    description: 'text-slate-600',
    cta: 'text-slate-900 group-hover:gap-2.5',
  },
  red: {
    card: 'border-[#8c1d18] bg-[#b32018] text-white hover:border-[#7a1713]',
    icon: 'bg-white/10 text-white group-hover:bg-white/16',
    eyebrow: 'text-rose-100',
    title: 'text-white',
    description: 'text-rose-100/85',
    cta: 'text-white group-hover:gap-2.5',
  },
  green: {
    card: 'border-forest-900 bg-forest-900 text-white hover:border-forest-800',
    icon: 'bg-white/10 text-white group-hover:bg-white/16',
    eyebrow: 'text-forest-200',
    title: 'text-white',
    description: 'text-forest-100/80',
    cta: 'text-white group-hover:gap-2.5',
  },
};

function RouteTile({
  href,
  eyebrow,
  title,
  description,
  icon,
  tone = 'white',
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone?: RouteTileTone;
}) {
  const toneClasses = routeTileToneClasses[tone];

  return (
    <Link
      href={href}
      className={`group flex flex-col justify-between border p-7 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${toneClasses.card}`}
    >
      <div>
        <div className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-lg ${toneClasses.icon}`}>
          {icon}
        </div>
        <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.14em] ${toneClasses.eyebrow}`}>{eyebrow}</p>
        <h3
          className={`text-xl font-semibold leading-snug ${toneClasses.title}`}
          style={{ fontFamily: 'var(--font-site-serif)' }}
        >
          {title}
        </h3>
        <p className={`mt-3 text-sm leading-7 ${toneClasses.description}`}>{description}</p>
      </div>
      <div className={`mt-8 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] transition-all ${toneClasses.cta}`}>
        Explore <ArrowUpRight size={13} />
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  let dashboard = null;
  let dashboardError: string | null = null;

  try {
    dashboard = await getDashboard();
  } catch (fetchError) {
    console.error(fetchError);
    dashboardError = 'Live dashboard is currently unreachable. Showing cached data where possible.';
  }

  const featuredBill = dashboard?.featuredBill;
  const trendingPetitions = dashboard?.trendingPetitions ?? [];
  const topCounty = dashboard?.topCounty;

  return (
    <main className="min-h-screen bg-[#f7f5f0] font-sans selection:bg-forest-800 selection:text-white">

      {/* ── Error Banner ─────────────────────────────────────────── */}
      {dashboardError && (
        <div className="flex items-center gap-3 border-b border-rose-200 bg-rose-50 px-6 py-3 text-sm font-medium text-rose-800">
          <AlertCircle size={14} className="shrink-0" />
          {dashboardError}
        </div>
      )}

      {/* ── Masthead ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={heroFlagBackdropStyle} />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-6 py-16 sm:px-8 lg:py-24">
          <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-forest-700">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-forest-500" />
                National Legislative Platform
              </p>

              <h1
                className="max-w-3xl text-5xl font-bold leading-[1.04] text-slate-950 sm:text-6xl lg:text-7xl"
                style={{ fontFamily: 'var(--font-site-serif)' }}
              >
                Follow bills, votes, and
                <br />
                <span className="text-forest-800">citizen action.</span>
              </h1>

              <p className="mt-8 max-w-xl text-lg leading-8 text-slate-600">
                Bunge Mkononi turns raw parliamentary activity into a civic workspace built for scanning, verification, and public participation.
              </p>

              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link
                  href="/bills"
                  className="inline-flex h-12 items-center gap-2 bg-forest-900 px-7 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
                >
                  Open bills library <ArrowUpRight size={16} />
                </Link>
                <Link
                  href="/participate"
                  className="inline-flex h-12 items-center gap-2 border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-800 transition-colors hover:border-forest-300 hover:text-forest-800"
                >
                  <MessageSquare size={15} /> Join participation
                </Link>
              </div>

              {/* Command search hint */}
              <div className="mt-8 inline-flex items-center gap-3 border border-slate-200 bg-white/92 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
                <Search size={14} className="text-slate-400" />
                <span className="text-sm text-slate-400">Search bills with</span>
                <kbd className="font-mono text-xs font-semibold text-slate-500 rounded bg-slate-100 px-1.5 py-0.5">⌘K</kbd>
              </div>
          </div>
        </div>
      </div>

      {/* ── Route tiles ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 py-16 sm:px-8">
        <SectionLabel>Explore the platform</SectionLabel>
        <div className="grid gap-px border border-slate-200 bg-slate-200 md:grid-cols-2 lg:grid-cols-4">
          <RouteTile
            href="/bills"
            eyebrow="Bills Library"
            title="A calmer archive for scanning titles, stages, and sponsors."
            description="Move through the parliamentary register in a structured reading order."
            icon={<BookOpen size={20} />}
            tone="black"
          />
          <RouteTile
            href="/participate"
            eyebrow="Participation Hub"
            title="Register citizen sentiment without losing context."
            description="Vote, subscribe, and follow live action through SMS and USSD."
            icon={<Vote size={20} />}
            tone="white"
          />
          <RouteTile
            href={featuredBill ? `/bills/${featuredBill.id}` : '/bills'}
            eyebrow="Bill Story"
            title="Open one bill at a time for a cleaner narrative view."
            description="Read through connected pages for overview, documents, votes, and response."
            icon={<TrendingUp size={20} />}
            tone="red"
          />
          <RouteTile
            href="/participate"
            eyebrow="Alerts"
            title="Never miss a second reading or committee report."
            description="Subscribe to bill-level SMS and USSD alerts tuned to your county."
            icon={<BellRing size={20} />}
            tone="green"
          />
        </div>
      </section>

      {/* ── Featured bill + Petitions ─────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-6 pb-16 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">

          {/* Featured bill */}
          <div className="border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-7 py-5">
              <SectionLabel>Featured Bill</SectionLabel>
              {featuredBill && (
                <span className="rounded-full border border-forest-200 bg-forest-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-forest-700">
                  {featuredBill.status}
                </span>
              )}
            </div>

            {featuredBill ? (
              <div className="px-7 py-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-forest-600">{featuredBill.category}</p>
                <h2
                  className="mt-3 text-4xl font-bold leading-tight text-slate-900 lg:text-5xl"
                  style={{ fontFamily: 'var(--font-site-serif)' }}
                >
                  {featuredBill.title}
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-500">{featuredBill.summary}</p>

                <div className="mt-7 inline-flex items-center gap-4 border border-slate-200 bg-slate-50 px-5 py-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Sponsored By</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{featuredBill.sponsor || 'Not listed'}</p>
                  </div>
                </div>

                <div className="mt-7">
                  <Link
                    href={`/bills/${featuredBill.id}`}
                    className="inline-flex h-11 items-center gap-2 bg-forest-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
                  >
                    Read full bill <ArrowUpRight size={15} />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="px-7 py-16 text-center text-sm text-slate-400">
                Data syncing — featured bill will appear shortly.
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-6">

            {/* County telemetry */}
            <div className="border border-slate-200 bg-white px-6 py-6">
              <SectionLabel>County Telemetry</SectionLabel>
              {topCounty ? (
                <>
                  <h3
                    className="text-3xl font-bold text-slate-900"
                    style={{ fontFamily: 'var(--font-site-serif)' }}
                  >
                    {topCounty.county}
                  </h3>
                  <p className="mt-2 text-sm leading-7 text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">{formatNumber(topCounty.engagementCount)}</span> voices actively shaping the conversation.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 border border-forest-200 bg-forest-50 px-3 py-1.5 text-[11px] font-semibold text-forest-700">
                    Sentiment: {topCounty.sentiment}
                  </div>
                </>
              ) : (
                <div className="space-y-3 pt-2">
                  <div className="h-7 w-2/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-slate-100" />
                </div>
              )}
            </div>

            {/* Trending petitions */}
            <div className="border border-slate-200 bg-white px-6 py-6">
              <SectionLabel>Trending Petitions</SectionLabel>
              <div className="space-y-5">
                {trendingPetitions.length > 0 ? (
                  trendingPetitions.slice(0, 3).map((petition) => {
                    const progress = petition.goal
                      ? (petition.signatures / petition.goal) * 100
                      : petition.progressPercent;
                    return (
                      <div key={petition.billId} className="group border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-semibold leading-snug text-slate-800 group-hover:text-forest-700">
                            {petition.title}
                          </p>
                          <span className="font-mono text-xs font-bold tabular-nums text-forest-700 shrink-0">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="mt-3 h-1 w-full bg-slate-100">
                          <div
                            className="h-full bg-forest-600 transition-all duration-500"
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                        <p className="mt-2 font-mono text-[11px] text-slate-400">
                          {formatNumber(petition.signatures)} signatures
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-400">No active petitions at this moment.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Offline CTA ───────────────────────────────────────────── */}
      <section className="border-t border-slate-200 bg-slate-900">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-forest-400">Offline Access</p>
              <h2
                className="mt-3 text-3xl font-bold text-white sm:text-4xl"
                style={{ fontFamily: 'var(--font-site-serif)' }}
              >
                Use a phone, not just a browser.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-7 text-slate-400">
                Track bills and subscribe to updates through USSD and SMS on any device — no internet required.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-5 border border-slate-700 bg-slate-800 px-7 py-5">
              <PhoneCall size={22} className="text-forest-400" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Dial Now</p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-white">*384*16250#</p>
              </div>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}
