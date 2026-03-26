import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  PhoneCall,
  TrendingUp,
  Vote,
  AlertCircle,
  Activity,
  Users,
  BellRing,
  Landmark,
} from 'lucide-react';
import { getDashboard } from '@/lib/api';

export const dynamic = 'force-dynamic';

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function RouteTile({
  href,
  eyebrow,
  title,
  description,
  icon,
}: {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="surface-card group relative flex min-h-60 flex-col justify-between p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-(--shadow-lift) sm:p-8"
    >
      <div>
        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-slate-100 text-slate-900 transition-colors group-hover:bg-brand-soft group-hover:text-brand-strong">
          {icon}
        </div>
        <p className="eyebrow text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-slate-600">{description}</p>
      </div>
      <div className="mt-8 flex items-center gap-2 font-semibold text-brand-strong">
        Explore <ArrowUpRight size={18} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
      </div>
    </Link>
  );
}

function HeroStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="surface-panel group p-5 transition duration-300 hover:-translate-y-1 hover:shadow-(--shadow-lift)">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-slate-500">{label}</p>
        <span className="rounded-xl bg-slate-100 p-2 text-slate-600 transition group-hover:bg-brand-soft group-hover:text-brand-strong">
          {icon}
        </span>
      </div>
      <p className="metric-mono mt-4 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function HomePage() {
  let dashboard = null;
  let dashboardError: string | null = null;

  try {
    dashboard = await getDashboard();
  } catch (fetchError) {
    console.error(fetchError);
    dashboardError = 'Live dashboard is currently unreachable. Showing cached data where possible.';
  }

  const stats = dashboard?.stats;
  const featuredBill = dashboard?.featuredBill;
  const trendingPetitions = dashboard?.trendingPetitions ?? [];
  const topCounty = dashboard?.topCounty;

  return (
    <main className="min-h-screen bg-slate-50 pb-24 selection:bg-brand selection:text-white">
      {dashboardError && (
        <div className="flex items-center gap-3 border-b border-rose-200 bg-rose-100 px-6 py-3 text-sm font-bold text-rose-900">
          <AlertCircle size={16} />
          {dashboardError}
        </div>
      )}

      <header className="border-b border-slate-200/80 bg-white/80 px-4 py-16 sm:px-8 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-[1fr_400px] lg:gap-20">
            <div className="flex flex-col justify-center">
             
              <h1 className="text-5xl font-semibold leading-[1.02] text-slate-900 sm:text-6xl lg:text-7xl">
                Follow bills, votes, and citizen action. <span className="text-brand-strong">Without the noise.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
                Bunge Mkononi turns raw parliamentary data into a clear, actionable civic workspace.
                Move seamlessly between bill libraries and live participation.
              </p>

              <div className="mt-10 flex flex-wrap gap-4">
                <Link
                  href="/bills"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-brand px-8 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
                >
                  Open bills library <ArrowUpRight size={18} />
                </Link>
                <Link
                  href="/participate"
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-8 text-sm font-semibold text-slate-900 transition-colors hover:border-brand/20 hover:text-brand-strong"
                >
                  Join the hub <MessageSquare size={18} />
                </Link>
              </div>
            </div>

            <div className="surface-card flex flex-col justify-center p-8">
              <div className="mb-8 flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="live-dot" aria-hidden="true" />
                    <p className="eyebrow text-slate-500">Live Platform Pulse</p>
                  </div>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Real-time civic activity</h3>
                </div>
                <span className="rounded-xl bg-success-soft px-3 py-1 text-xs font-semibold text-success">Live</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                <HeroStat label="Active Bills" value={formatNumber(stats?.activeBills ?? 0)} icon={<Landmark size={16} />} />
                <HeroStat label="Signatures" value={formatNumber(stats?.totalSignatures ?? 0)} icon={<Users size={16} />} />
                <HeroStat label="USSD Sessions" value={formatNumber(stats?.ussdSessions ?? 0)} icon={<Activity size={16} />} />
                <HeroStat label="SMS Alerts" value={formatNumber(stats?.smsAlertsSent ?? 0)} icon={<BellRing size={16} />} />
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-8">
        <div className="grid gap-6 md:grid-cols-3">
          <RouteTile
            href="/bills"
            eyebrow="Bills Library"
            title="Bills Library"
            description="Search, filter, and compare bills in a calmer workspace built for scanning."
            icon={<BookOpen size={24} />}
          />
          <RouteTile
            href="/participate"
            eyebrow="Participation Hub"
            title="Participation"
            description="Vote, subscribe, and follow live action through SMS and USSD without friction."
            icon={<Vote size={24} />}
          />
          <RouteTile
            href={featuredBill ? `/bills/${featuredBill.id}` : '/bills'}
            eyebrow="Bill Story"
            title="Bill Story"
            description="Read one bill at a time through dedicated pages for overview, documents, and votes."
            icon={<TrendingUp size={24} />}
          />
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-7xl px-4 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-8">
            <div className="surface-card p-8 sm:p-10">
              <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
                <p className="eyebrow text-slate-500">Featured Bill</p>
                {featuredBill && (
                  <span className="rounded-xl bg-brand-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-brand-strong">
                    {featuredBill.status}
                  </span>
                )}
              </div>

              {featuredBill ? (
                <>
                  <p className="eyebrow text-brand-strong">{featuredBill.category}</p>
                  <h2 className="mt-4 text-3xl font-semibold leading-tight text-slate-900 md:text-4xl">
                    {featuredBill.title}
                  </h2>
                  <p className="mt-6 text-lg leading-8 text-slate-600">{featuredBill.summary}</p>
                  <div className="mt-8 flex flex-col items-start gap-6 rounded-xl border border-slate-200 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="eyebrow text-slate-500">Sponsored By</p>
                      <p className="mt-2 font-semibold text-slate-900">{featuredBill.sponsor || 'Not listed'}</p>
                    </div>
                    <Link
                      href={`/bills/${featuredBill.id}`}
                      className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-strong"
                    >
                      Read full bill <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center font-medium text-slate-500">
                  Data syncing. Featured bill will appear shortly.
                </div>
              )}
            </div>

            <div className="surface-card flex flex-col items-center justify-between gap-6 bg-slate-900 p-8 text-white sm:flex-row">
              <div className="max-w-md">
                <p className="eyebrow text-brand-soft">Offline Access</p>
                <h2 className="mt-2 text-2xl font-semibold">Use a phone, not just a browser.</h2>
                <p className="mt-2 text-sm leading-7 text-slate-300">
                  Track bills and subscribe to updates through USSD and SMS on any device.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4 rounded-xl border border-slate-700 bg-slate-800 p-4">
                <PhoneCall size={24} className="text-brand-soft" />
                <div>
                  <p className="eyebrow text-slate-400">Dial Now</p>
                  <p className="metric-mono text-xl font-semibold text-white">*384*16250#</p>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-8">
            <div className="surface-card p-6">
              <h3 className="mb-6 border-b border-slate-200 pb-3 text-sm font-semibold uppercase tracking-[0.24em] text-slate-900">
                Trending Petitions
              </h3>
              <div className="space-y-6">
                {trendingPetitions.length > 0 ? (
                  trendingPetitions.slice(0, 3).map((petition) => {
                    const progress = petition.goal ? (petition.signatures / petition.goal) * 100 : petition.progressPercent;
                    return (
                      <div key={petition.billId} className="group rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:-translate-y-0.5 hover:shadow-(--shadow-soft)">
                        <div className="flex items-start justify-between gap-4">
                          <p className="text-sm font-semibold leading-6 text-slate-900 transition-colors group-hover:text-brand-strong">
                            {petition.title}
                          </p>
                          <span className="metric-mono shrink-0 text-xs font-semibold text-brand-strong">{Math.round(progress)}%</span>
                        </div>
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(progress, 100)}%` }} />
                        </div>
                        <p className="metric-mono mt-3 text-xs text-slate-500">{formatNumber(petition.signatures)} signatures</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">No active petitions at this moment.</p>
                )}
              </div>
            </div>

            <div className="surface-card p-6">
              <p className="eyebrow text-brand-strong">County Telemetry</p>
              {topCounty ? (
                <>
                  <h3 className="mt-2 text-3xl font-semibold text-slate-900">{topCounty.county}</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-700">
                    <span className="metric-mono">{formatNumber(topCounty.engagementCount)}</span> voices are actively shaping the conversation here.
                  </p>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-brand/15 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-strong">
                    Sentiment: {topCounty.sentiment}
                  </div>
                </>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="skeleton-line h-8 w-2/3" />
                  <div className="skeleton-line h-4 w-full" />
                  <div className="skeleton-line h-4 w-4/5" />
                  <div className="skeleton-line h-8 w-28" />
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
