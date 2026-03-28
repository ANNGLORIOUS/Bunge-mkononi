'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Landmark,
  MessageSquare,
  PhoneCall,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import BillCard from '@/components/BillCard';
import { getDashboard, listBills } from '@/lib/api';
import { Bill, BillCategory, BillStatus, DashboardResponse } from '@/types';

const CATEGORY_OPTIONS: Array<'All Categories' | BillCategory> = [
  'All Categories',
  'Finance',
  'Health',
  'Education',
  'Justice',
  'Environment',
];

const STATUS_OPTIONS: Array<'All Statuses' | BillStatus> = [
  'All Statuses',
  'First Reading',
  'Committee',
  'Second Reading',
  'Third Reading',
  'Presidential Assent',
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-3 text-slate-400">{label}</p>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full border-l-2 px-3 py-2 text-left text-sm font-medium transition-all ${
        active
          ? 'border-l-clay-600 bg-slate-950 font-semibold text-white'
          : 'border-l-transparent bg-white/75 text-slate-600 hover:border-l-forest-700 hover:bg-white hover:text-slate-950'
      }`}
    >
      {children}
    </button>
  );
}

type RegisterStatTone = 'black' | 'white' | 'red' | 'green';

const REGISTER_STAT_TONES: Record<
  RegisterStatTone,
  {
    card: string;
    label: string;
    value: string;
    icon: string;
  }
> = {
  black: {
    card: 'border-slate-950 bg-slate-950',
    label: 'text-slate-400',
    value: 'text-white',
    icon: 'text-white/75',
  },
  white: {
    card: 'border-slate-300 bg-white',
    label: 'text-slate-500',
    value: 'text-slate-950',
    icon: 'text-slate-400',
  },
  red: {
    card: 'border-[#8c1d18] bg-[#b32018]',
    label: 'text-rose-100/75',
    value: 'text-white',
    icon: 'text-rose-100',
  },
  green: {
    card: 'border-forest-900 bg-forest-900',
    label: 'text-forest-200/75',
    value: 'text-white',
    icon: 'text-forest-200',
  },
};

function RegisterStatCard({
  label,
  value,
  icon,
  tone,
  isLoading,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tone: RegisterStatTone;
  isLoading: boolean;
}) {
  const toneClasses = REGISTER_STAT_TONES[tone];

  return (
    <div className={`border px-5 py-4 ${toneClasses.card}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${toneClasses.label}`}>{label}</p>
        <span className={toneClasses.icon}>{icon}</span>
      </div>
      <p className={`mt-4 font-mono text-2xl font-semibold tracking-tight ${toneClasses.value}`}>
        {isLoading ? '...' : value}
      </p>
    </div>
  );
}

function BillRowSkeleton() {
  return (
    <div className="px-6 py-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-[minmax(0,1.7fr)_240px_260px]">
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="skeleton-line h-4 w-32" />
            <div className="skeleton-line h-4 w-28" />
            <div className="skeleton-line h-4 w-20" />
          </div>
          <div className="skeleton-line h-9 w-4/5" />
          <div className="skeleton-line h-4 w-2/3" />
          <div className="skeleton-line h-4 w-full" />
          <div className="skeleton-line h-4 w-5/6" />
        </div>
        <div className="space-y-4 border border-slate-300 bg-[linear-gradient(180deg,rgba(15,23,42,0.03),rgba(255,255,255,0.92)_34%,rgba(187,61,42,0.06)_72%,rgba(24,85,64,0.06))] p-4 lg:col-span-2 2xl:col-span-1">
          <div className="skeleton-line h-4 w-16" />
          <div className="skeleton-line h-8 w-32" />
          <div className="skeleton-line h-4 w-28" />
          <div className="skeleton-line h-3 w-full" />
        </div>
        <div className="space-y-3 lg:col-start-2 lg:row-start-1 2xl:col-start-auto 2xl:row-start-auto 2xl:ml-auto 2xl:w-full">
          <div className="skeleton-line h-11 w-40" />
          <div className="flex gap-2">
            <div className="skeleton-line h-10 w-10" />
            <div className="skeleton-line h-10 w-10" />
          </div>
          <div className="skeleton-line h-4 w-40" />
        </div>
      </div>
    </div>
  );
}

export default function BillBrowser() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billsError, setBillsError] = useState<string | null>(null);
  const [loadedBillsKey, setLoadedBillsKey] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'All Categories' | BillCategory>('All Categories');
  const [status, setStatus] = useState<'All Statuses' | BillStatus>('All Statuses');
  const [ministry, setMinistry] = useState('All Ministries');
  const [year, setYear] = useState('All Years');
  const deferredSearch = useDeferredValue(search);
  const searchTerm = deferredSearch.trim();
  const currentBillsKey = `search=${searchTerm}|category=${category}|status=${status}`;
  const isDashboardLoading = dashboard === null && dashboardError === null;
  const isBillsLoading = loadedBillsKey !== currentBillsKey;
  const error = dashboardError ?? (loadedBillsKey === currentBillsKey ? billsError : null);
  const hasSearchInput = search.length > 0;
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    getDashboard()
      .then((data) => { if (active) { setDashboard(data); setDashboardError(null); } })
      .catch((fetchError) => { console.error(fetchError); if (active) setDashboardError('We could not load the live dashboard right now.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    listBills({
      search: searchTerm || undefined,
      category: category === 'All Categories' ? undefined : category,
      status: status === 'All Statuses' ? undefined : status,
      ordering: '-is_hot,-date_introduced',
    })
      .then((payload) => { if (active) { setBills(payload.results); setBillsError(null); setLoadedBillsKey(currentBillsKey); } })
      .catch((fetchError) => { console.error(fetchError); if (active) { setBillsError('We could not load the bill feed right now.'); setLoadedBillsKey(currentBillsKey); } });
    return () => { active = false; };
  }, [category, currentBillsKey, searchTerm, status]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyboardShortcut);
    return () => window.removeEventListener('keydown', handleKeyboardShortcut);
  }, []);

  const ministryOptions = useMemo(() => {
    const sponsors = new Set<string>();
    bills.forEach((bill) => { const sponsor = bill.sponsor?.trim(); if (sponsor) sponsors.add(sponsor); });
    return ['All Ministries', ...Array.from(sponsors).sort((a, b) => a.localeCompare(b))];
  }, [bills]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    bills.forEach((bill) => { const parsed = new Date(bill.dateIntroduced); if (!Number.isNaN(parsed.getTime())) years.add(String(parsed.getFullYear())); });
    return ['All Years', ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
  }, [bills]);

  const resolvedMinistry = ministryOptions.includes(ministry) ? ministry : 'All Ministries';
  const resolvedYear = yearOptions.includes(year) ? year : 'All Years';

  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      const matchesMinistry = resolvedMinistry === 'All Ministries' || (bill.sponsor || 'Government of Kenya') === resolvedMinistry;
      const billYear = String(new Date(bill.dateIntroduced).getFullYear());
      const matchesYear = resolvedYear === 'All Years' || billYear === resolvedYear;
      return matchesMinistry && matchesYear;
    });
  }, [bills, resolvedMinistry, resolvedYear]);

  const stats = dashboard?.stats;
  const activeResultLabel = searchTerm ? `${filteredBills.length} results for "${searchTerm}"` : `${filteredBills.length} bills`;
  const activeFilterCount = [
    category !== 'All Categories',
    status !== 'All Statuses',
    ministry !== 'All Ministries',
    year !== 'All Years',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setCategory('All Categories');
    setStatus('All Statuses');
    setMinistry('All Ministries');
    setYear('All Years');
    setSearch('');
  };

  return (
    <main className="bg-[#f7f5f0] pb-24">

      {/* ── Error ── */}
      {error && (
        <div className="border-b border-clay-200 bg-clay-50 px-6 py-3 text-sm font-medium text-clay-700">
          {error}
        </div>
      )}

      {/* ── Page header ── */}
      <div className="border-b border-[var(--line-strong)] bg-white">
        <div className="h-2 bg-[linear-gradient(90deg,#020617_0_24%,#ffffff_24_28%,#b32018_28_72%,#ffffff_72_76%,#185540_76_100%)]" />
        <div className="mx-auto max-w-7xl px-6 py-8 sm:px-8 lg:py-10">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-end">
            <div>
              <p className="eyebrow text-forest-700">Bills Register</p>
              <h1 className="mt-2 text-4xl font-bold text-slate-950 sm:text-5xl">
                Legislative <span className="text-clay-600">Archive</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Search by title, summary, sponsor, category, or bill ID through a register styled with the Kenyan flag palette: black for structure, white for clarity, red for urgency, and green for civic action.
              </p>
            </div>

            <div className="grid gap-px border border-slate-300 bg-slate-300 sm:grid-cols-2">
              <RegisterStatCard
                label="Active Bills"
                value={formatNumber(stats?.activeBills ?? 0)}
                icon={<Landmark size={15} />}
                tone="black"
                isLoading={isDashboardLoading}
              />
              <RegisterStatCard
                label="Signatures"
                value={formatNumber(stats?.totalSignatures ?? 0)}
                icon={<Users size={15} />}
                tone="white"
                isLoading={isDashboardLoading}
              />
              <RegisterStatCard
                label="USSD Sessions"
                value={formatNumber(stats?.ussdSessions ?? 0)}
                icon={<PhoneCall size={15} />}
                tone="red"
                isLoading={isDashboardLoading}
              />
              <RegisterStatCard
                label="SMS Alerts"
                value={formatNumber(stats?.smsAlertsSent ?? 0)}
                icon={<MessageSquare size={15} />}
                tone="green"
                isLoading={isDashboardLoading}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Three-column layout ── */}
      <div className="mx-auto max-w-7xl xl:grid xl:grid-cols-[220px_minmax(0,1fr)] xl:items-start">

        {/* ── Sidebar ── */}
        <aside className="border-b border-[var(--line)] bg-[linear-gradient(180deg,#f8f4ef_0%,#fff_24%,#fff_54%,#fcf1ee_78%,#eef7f1_100%)] xl:sticky xl:top-[65px] xl:self-start xl:border-b-0 xl:border-r xl:border-[var(--line-strong)]">
          <div className="px-5 py-6">
            <div className="mb-6 h-1.5 w-full bg-[linear-gradient(90deg,#020617_0_22%,#ffffff_22_28%,#b32018_28_72%,#ffffff_72_78%,#185540_78_100%)]" />

            {/* Active filter count + reset */}
            <div className="mb-6 flex items-center justify-between">
              <p className="eyebrow text-slate-500">Filters</p>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-clay-600 transition hover:text-clay-800"
                >
                  <X size={10} /> Reset ({activeFilterCount})
                </button>
              )}
            </div>

            <div className="space-y-7">

              {/* Category */}
              <FilterGroup label="Category">
                {CATEGORY_OPTIONS.map((option) => (
                  <FilterButton key={option} active={category === option} onClick={() => setCategory(option)}>
                    {option}
                  </FilterButton>
                ))}
              </FilterGroup>

              {/* Status */}
              <FilterGroup label="Status">
                {STATUS_OPTIONS.map((option) => (
                  <FilterButton key={option} active={status === option} onClick={() => setStatus(option)}>
                    {option}
                  </FilterButton>
                ))}
              </FilterGroup>

              {/* Ministry */}
              <div>
                <label className="eyebrow mb-3 block text-slate-400" htmlFor="ministry-filter">
                  Ministry / Sponsor
                </label>
                <select
                  id="ministry-filter"
                  value={resolvedMinistry}
                  onChange={(e) => setMinistry(e.target.value)}
                  className="w-full border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-clay-500 focus:ring-2 focus:ring-clay-100"
                >
                  {ministryOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div>
                <label className="eyebrow mb-3 block text-slate-400" htmlFor="year-filter">
                  Year Introduced
                </label>
                <select
                  id="year-filter"
                  value={resolvedYear}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full border border-[var(--line-strong)] bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-clay-500 focus:ring-2 focus:ring-clay-100"
                >
                  {yearOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="min-w-0">

          {/* Search bar */}
          <div className="border-b border-[var(--line-strong)] bg-[#fffdfb] px-6 py-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-forest-700" size={16} />
              <input
                aria-label="Search bills"
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                placeholder="Search bills, sponsors, topics, or IDs..."
                className="w-full border border-[var(--line-strong)] bg-white py-3 pl-10 pr-28 text-sm text-foreground outline-none transition placeholder:text-slate-400 focus:border-clay-500 focus:ring-2 focus:ring-clay-100"
              />
              <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                {hasSearchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="text-xs font-semibold text-clay-600 transition hover:text-clay-800"
                  >
                    Clear
                  </button>
                ) : (
                  <kbd className="font-mono text-[10px] font-semibold text-slate-400 border border-slate-200 bg-slate-50 px-1.5 py-0.5">⌘K</kbd>
                )}
              </div>
            </div>
          </div>

          {/* Result count + status chip */}
          <div className="flex items-center justify-between gap-4 border-b border-[var(--line-strong)] bg-[#f6f1ea] px-6 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {isBillsLoading ? 'Loading...' : activeResultLabel}
            </p>
            <div className="flex items-center gap-2">
              {status !== 'All Statuses' && (
                <span className="badge badge-forest">{status}</span>
              )}
              {category !== 'All Categories' && (
                <span className="badge badge-clay">{category}</span>
              )}
            </div>
          </div>

          {/* Column header (wide only) */}
          <div className="hidden border-b border-slate-950 bg-slate-950 px-6 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 2xl:grid 2xl:grid-cols-[minmax(0,1.7fr)_240px_260px]">
            <span>Bill Record</span>
            <span>Status &amp; Progress</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Bill rows */}
          <div className="divide-y divide-[var(--line)]">
            {isBillsLoading
              ? Array.from({ length: 5 }).map((_, i) => <BillRowSkeleton key={i} />)
              : filteredBills.map((bill) => (
                  <BillCard key={bill.id} bill={bill} petition={bill.petition ?? undefined} />
                ))}
          </div>

          {/* Empty state */}
          {!isBillsLoading && filteredBills.length === 0 && (
            <div className="border border-dashed border-clay-300 bg-[linear-gradient(180deg,#ffffff,#f7f5f0)] px-6 py-16 text-center">
              <p className="text-base font-semibold text-slate-900">
                {searchTerm ? `No bills matched "${searchTerm}".` : 'No bills match your current filters.'}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Try a different title, stage, sponsor, year, or category.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 inline-flex items-center gap-2 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-900"
              >
                <SlidersHorizontal size={14} /> Reset all filters
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
